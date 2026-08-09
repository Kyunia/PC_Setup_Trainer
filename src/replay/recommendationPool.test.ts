import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import type { StagedRecommendationResult } from "../setups/cooperativeQuery";
import type { SetupQuery } from "../setups/query";
import type { RecommendationWorkerTask } from "../setups/recommendationWorkerClient";
import { ReplayRecommendationPool, type RecommendationWorkerSlotLike } from "./recommendationPool";

class FakeSlot implements RecommendationWorkerSlotLike {
  busy = false;
  starts = 0;
  cancels = 0;

  start(_query: SetupQuery, _onStage: (result: StagedRecommendationResult) => void): RecommendationWorkerTask {
    this.busy = true;
    this.starts += 1;
    return {
      requestId: this.starts,
      done: new Promise<StagedRecommendationResult>(() => undefined),
      cancel: () => { this.cancels += 1; },
    };
  }
}

const query: SetupQuery = {
  cycle: 1,
  board: createBoard(),
  active: "T",
  hold: null,
  next: ["O", "I", "L", "J"],
};

describe("replay recommendation Worker pool", () => {
  it("keeps the prior request on the second Worker and cancels the oldest low-priority request when full", () => {
    const first = new FakeSlot();
    const second = new FakeSlot();
    const pool = new ReplayRecommendationPool([first, second]);
    const noop = () => undefined;
    pool.request("pc-1", query, noop, noop, noop);
    pool.request("pc-2", query, noop, noop, noop);
    expect([first.starts, second.starts]).toEqual([1, 1]);
    expect([first.cancels, second.cancels]).toEqual([0, 0]);

    pool.request("pc-3", query, noop, noop, noop);
    expect([first.cancels, second.cancels]).toEqual([1, 0]);
  });
});
