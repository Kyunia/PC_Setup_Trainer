import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import type { StagedRecommendationResult } from "../setups/cooperativeQuery";
import type { SetupQuery } from "../setups/query";
import { RecommendationRequestCancelled, type RecommendationWorkerTask } from "../setups/recommendationWorkerClient";
import { ReplayRecommendationPool, type RecommendationWorkerSlotLike } from "./recommendationPool";

interface Running {
  requestId: number;
  onStage: (result: StagedRecommendationResult) => void;
  resolve: (result: StagedRecommendationResult) => void;
  reject: (reason: Error) => void;
}

class FakeSlot implements RecommendationWorkerSlotLike {
  busy = false;
  starts = 0;
  cancels = 0;
  warms = 0;
  disposes = 0;
  running: Running | null = null;

  warm() { this.warms += 1; }
  dispose() {
    this.disposes += 1;
    this.busy = false;
    this.running?.reject(new RecommendationRequestCancelled());
    this.running = null;
  }
  start(_query: SetupQuery, onStage: (result: StagedRecommendationResult) => void): RecommendationWorkerTask {
    if (this.busy) throw new Error("busy");
    this.busy = true;
    const requestId = ++this.starts;
    let resolve!: (result: StagedRecommendationResult) => void;
    let reject!: (reason: Error) => void;
    const done = new Promise<StagedRecommendationResult>((accept, decline) => {
      resolve = (value) => { this.busy = false; this.running = null; accept(value); };
      reject = (reason) => { this.busy = false; this.running = null; decline(reason); };
    });
    this.running = { requestId, onStage, resolve, reject };
    return {
      requestId,
      done,
      cancel: () => { this.cancels += 1; },
    };
  }
  stage(result: StagedRecommendationResult) { this.running?.onStage(result); }
  finish(result: StagedRecommendationResult) { this.running?.resolve(result); }
  cancelDone() { this.running?.reject(new RecommendationRequestCancelled()); }
  fail(message = "failed") { this.running?.reject(new Error(message)); }
}

const query: SetupQuery = {
  cycle: 1,
  board: createBoard(),
  active: "T",
  hold: null,
  next: ["O", "I", "L", "J"],
};
const result: StagedRecommendationResult = {
  stage: "primary",
  candidates: [],
  preferredCandidateId: null,
  complete: true,
};
const noop = () => undefined;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("replay recommendation Worker pool", () => {
  it("best-effort warms and disposes both persistent slots", () => {
    const first = new FakeSlot();
    const second = new FakeSlot();
    const pool = new ReplayRecommendationPool([first, second]);
    pool.warm();
    expect([first.warms, second.warms]).toEqual([1, 1]);
    pool.dispose();
    expect([first.disposes, second.disposes]).toEqual([1, 1]);
  });

  it("cancels only the oldest non-current job when both slots are full", () => {
    const first = new FakeSlot();
    const second = new FakeSlot();
    const pool = new ReplayRecommendationPool([first, second]);
    pool.request("pc-1", query, noop, noop, noop);
    pool.request("pc-2", query, noop, noop, noop);
    pool.request("pc-3", query, noop, noop, noop);
    expect([first.cancels, second.cancels]).toEqual([1, 0]);
  });

  it("does not reuse a cancelling same-key job on immediate revisit", async () => {
    const first = new FakeSlot();
    const second = new FakeSlot();
    const pool = new ReplayRecommendationPool([first, second]);
    pool.request("pc-1", query, noop, noop, noop);
    pool.request("pc-2", query, noop, noop, noop);
    pool.request("pc-3", query, noop, noop, noop);
    pool.request("pc-1", query, noop, noop, noop);
    expect(first.starts).toBe(1);
    first.cancelDone();
    await flush();
    expect(first.starts).toBe(2);
  });

  it("keeps the second Worker untouched while one cancellation is pending and retains only latest current", async () => {
    const first = new FakeSlot();
    const second = new FakeSlot();
    const pool = new ReplayRecommendationPool([first, second]);
    pool.request("pc-1", query, noop, noop, noop);
    pool.request("pc-2", query, noop, noop, noop);
    pool.request("pc-3", query, noop, noop, noop);
    pool.request("pc-4", query, noop, noop, noop);
    expect([first.cancels, second.cancels]).toEqual([1, 0]);
    first.cancelDone();
    await flush();
    expect(first.starts).toBe(2);
  });

  it("lets unsubscribed background completion populate cache without UI stages", async () => {
    const first = new FakeSlot();
    const second = new FakeSlot();
    const pool = new ReplayRecommendationPool([first, second]);
    let stages = 0;
    let completes = 0;
    const unsubscribe = pool.request("pc-1", query, () => { stages += 1; }, () => { completes += 1; }, noop);
    unsubscribe();
    first.stage(result);
    first.finish(result);
    await flush();
    expect(stages).toBe(0);
    expect(completes).toBe(1);
  });

  it("delivers errors only to currently subscribed listeners", async () => {
    const first = new FakeSlot();
    const second = new FakeSlot();
    const pool = new ReplayRecommendationPool([first, second]);
    let staleErrors = 0;
    let currentErrors = 0;
    const unsubscribe = pool.request("pc-1", query, noop, noop, () => { staleErrors += 1; });
    unsubscribe();
    pool.request("pc-1", query, noop, noop, () => { currentErrors += 1; });
    first.fail("boom");
    await flush();
    expect(staleErrors).toBe(0);
    expect(currentErrors).toBe(1);
  });

  it("keeps completion that wins a cancellation race and then starts latest pending", async () => {
    const first = new FakeSlot();
    const second = new FakeSlot();
    const pool = new ReplayRecommendationPool([first, second]);
    let cached = 0;
    pool.request("pc-1", query, noop, () => { cached += 1; }, noop);
    pool.request("pc-2", query, noop, noop, noop);
    pool.request("pc-3", query, noop, noop, noop);
    first.finish(result);
    await flush();
    expect(cached).toBe(1);
    expect(first.starts).toBe(2);
  });

  it("cancelAll cooperatively cancels work but does not dispose persistent slots", () => {
    const first = new FakeSlot();
    const second = new FakeSlot();
    const pool = new ReplayRecommendationPool([first, second]);
    pool.request("pc-1", query, noop, noop, noop);
    pool.request("pc-2", query, noop, noop, noop);
    pool.cancelAll();
    expect(first.cancels + second.cancels).toBe(2);
    expect(first.disposes + second.disposes).toBe(0);
  });
});
