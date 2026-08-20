import { describe, expect, it } from "vitest";
import type { SetupQuery } from "./query";
import {
  RecommendationRequestCancelled,
  RecommendationWorkerSlot,
} from "./recommendationWorkerClient";
import type { RecommendationWorkerMessage } from "./recommendationWorkerProtocol";
import type { SelectedRecommendationScope } from "./recommendationScope";

class FakeWorker {
  onmessage: ((event: MessageEvent<RecommendationWorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;
  messages: unknown[] = [];
  postMessage(message: unknown) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(message: RecommendationWorkerMessage) {
    this.onmessage?.({ data: message } as MessageEvent<RecommendationWorkerMessage>);
  }
}

const query: SetupQuery = {
  cycle: 1,
  board: Array.from({ length: 20 }, () => Array(10).fill(null)),
  active: "T",
  hold: null,
  next: ["O", "I", "L", "J", "S"],
};

function complete(worker: FakeWorker, requestId: number) {
  worker.emit({
    type: "stage",
    requestId,
    stage: "primary",
    candidates: [],
    preferredCandidateId: null,
    complete: true,
  });
}

describe("RecommendationWorkerSlot", () => {
  it("keeps construction side-effect free and warms idempotently", () => {
    let creates = 0;
    const worker = new FakeWorker();
    const slot = new RecommendationWorkerSlot(() => {
      creates += 1;
      return worker as unknown as Worker;
    });
    expect(creates).toBe(0);
    slot.warm();
    slot.warm();
    expect(creates).toBe(1);
  });

  it("turns first Worker creation failure into task rejection and can retry", async () => {
    let creates = 0;
    const worker = new FakeWorker();
    const slot = new RecommendationWorkerSlot(() => {
      creates += 1;
      if (creates === 1) throw new Error("worker unavailable");
      return worker as unknown as Worker;
    });
    const first = slot.start(query, () => undefined);
    await expect(first.done).rejects.toThrow("worker unavailable");
    expect(slot.busy).toBe(false);

    const second = slot.start(query, () => undefined);
    complete(worker, second.requestId);
    await expect(second.done).resolves.toMatchObject({ complete: true });
    expect(creates).toBe(2);
  });

  it("reuses one Worker across normal completed requests", async () => {
    const workers: FakeWorker[] = [];
    const slot = new RecommendationWorkerSlot(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    const first = slot.start(query, () => undefined);
    complete(workers[0]!, first.requestId);
    await first.done;
    const second = slot.start(query, () => undefined);
    complete(workers[0]!, second.requestId);
    await second.done;
    expect(workers).toHaveLength(1);
    expect(workers[0]!.terminated).toBe(false);
  });

  it("uses cooperative cancellation without terminating the Worker", async () => {
    const worker = new FakeWorker();
    const slot = new RecommendationWorkerSlot(() => worker as unknown as Worker);
    const task = slot.start(query, () => undefined);
    task.cancel();
    expect(worker.messages.at(-1)).toEqual({ type: "cancel", requestId: task.requestId });
    expect(worker.terminated).toBe(false);
    worker.emit({ type: "cancelled", requestId: task.requestId });
    await expect(task.done).rejects.toBeInstanceOf(RecommendationRequestCancelled);
  });

  it("replaces a failed Worker and ignores stale events from the old Worker", async () => {
    const workers: FakeWorker[] = [];
    const slot = new RecommendationWorkerSlot(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    const first = slot.start(query, () => undefined);
    const oldError = workers[0]!.onerror;
    oldError?.({} as ErrorEvent);
    await expect(first.done).rejects.toThrow("Recommendation Web Worker failed");
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);

    const second = slot.start(query, () => undefined);
    oldError?.({} as ErrorEvent);
    expect(workers).toHaveLength(2);
    complete(workers[1]!, second.requestId);
    await expect(second.done).resolves.toMatchObject({ complete: true });
  });

  it("dispose settles active work, releases the Worker, and remains reusable", async () => {
    const workers: FakeWorker[] = [];
    const slot = new RecommendationWorkerSlot(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    const task = slot.start(query, () => undefined);
    slot.dispose();
    await expect(task.done).rejects.toBeInstanceOf(RecommendationRequestCancelled);
    expect(workers[0]!.terminated).toBe(true);
    expect(slot.busy).toBe(false);

    slot.warm();
    expect(workers).toHaveLength(2);
    const retry = slot.start(query, () => undefined);
    complete(workers[1]!, retry.requestId);
    await retry.done;
  });

  it("omits scope for main-game requests and preserves explicit diagnostic scope", async () => {
    const worker = new FakeWorker();
    const slot = new RecommendationWorkerSlot(() => worker as unknown as Worker);
    const first = slot.start(query, () => undefined);
    expect(worker.messages[0]).toEqual({ type: "recommend", requestId: first.requestId, query });
    worker.emit({ type: "cancelled", requestId: first.requestId });
    await expect(first.done).rejects.toThrow("cancelled");

    const scope: SelectedRecommendationScope = {
      mode: "selected-bundles",
      bundles: [{
        bundleId: "selected-file",
        kind: "structured",
        cycle: 1,
        catalog: [{ id: "selected" }] as never[],
      }],
    };
    const second = slot.start(query, () => undefined, scope);
    expect(worker.messages.at(-1)).toMatchObject({ type: "recommend", requestId: second.requestId, query, scope });
    worker.emit({ type: "cancelled", requestId: second.requestId });
    await expect(second.done).rejects.toThrow("cancelled");
  });
});
