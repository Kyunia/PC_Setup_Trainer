import { describe, expect, it } from "vitest";
import type { SetupQuery } from "./query";
import { RecommendationWorkerSlot } from "./recommendationWorkerClient";
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
  emit(message: RecommendationWorkerMessage) { this.onmessage?.({ data: message } as MessageEvent<RecommendationWorkerMessage>); }
}

const query: SetupQuery = {
  cycle: 1,
  board: Array.from({ length: 20 }, () => Array(10).fill(null)),
  active: "T",
  hold: null,
  next: ["O", "I", "L", "J", "S"],
};

describe("RecommendationWorkerSlot", () => {
  it("omits a scope for the complete main-game recommendation path", async () => {
    const worker = new FakeWorker();
    const slot = new RecommendationWorkerSlot(() => worker as unknown as Worker);
    const task = slot.start(query, () => undefined);
    expect(worker.messages[0]).toEqual({
      type: "recommend",
      requestId: task.requestId,
      query,
    });
    worker.emit({ type: "cancelled", requestId: task.requestId });
    await expect(task.done).rejects.toThrow("cancelled");
  });

  it("replaces a failed Worker and accepts a retry", async () => {
    const workers: FakeWorker[] = [];
    const slot = new RecommendationWorkerSlot(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    const first = slot.start(query, () => undefined);
    workers[0]!.onerror?.({} as ErrorEvent);
    await expect(first.done).rejects.toThrow("Recommendation Web Worker failed");
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);

    const second = slot.start(query, () => undefined);
    workers[1]!.emit({
      type: "stage",
      requestId: second.requestId,
      stage: "primary",
      candidates: [],
      preferredCandidateId: null,
      complete: true,
    });
    await expect(second.done).resolves.toMatchObject({ complete: true, candidates: [] });
  });

  it("sends paired selected bundles only for an explicit diagnostic request", async () => {
    const worker = new FakeWorker();
    const slot = new RecommendationWorkerSlot(() => worker as unknown as Worker);
    const scope: SelectedRecommendationScope = {
      mode: "selected-bundles",
      bundles: [{
        bundleId: "selected-file",
        kind: "structured",
        cycle: 1,
        catalog: [{ id: "selected" }] as never[],
      }],
    };
    const task = slot.start(query, () => undefined, scope);
    expect(worker.messages[0]).toMatchObject({
      type: "recommend",
      requestId: task.requestId,
      query,
      scope,
    });
    worker.emit({ type: "cancelled", requestId: task.requestId });
    await expect(task.done).rejects.toThrow("cancelled");
  });
});
