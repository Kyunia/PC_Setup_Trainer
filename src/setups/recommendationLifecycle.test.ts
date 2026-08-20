import { describe, expect, it } from "vitest";
import { recommendationSegmentKey } from "./recommendationLifecycle";

describe("recommendation segment lifecycle", () => {
  it("does not include movement/rotation/board revision state in the key", () => {
    const before = {
      seed: "seed",
      pcCount: 2,
      cycle: 5,
      resetNonce: 0,
      revision: 10,
      activeX: 3,
      activeY: 20,
      orientation: 0,
    };
    const afterMovement = {
      ...before,
      revision: 14,
      activeX: 7,
      activeY: 4,
      orientation: 2,
    };
    expect(recommendationSegmentKey(before)).toBe(recommendationSegmentKey(afterMovement));
  });

  it("changes on PC transition", () => {
    expect(recommendationSegmentKey({ seed: "seed", pcCount: 2, cycle: 5, resetNonce: 0 }))
      .not.toBe(recommendationSegmentKey({ seed: "seed", pcCount: 3, cycle: 6, resetNonce: 0 }));
  });

  it("changes on restart/random-seed reset nonce", () => {
    expect(recommendationSegmentKey({ seed: "seed", pcCount: 2, cycle: 5, resetNonce: 0 }))
      .not.toBe(recommendationSegmentKey({ seed: "seed", pcCount: 2, cycle: 5, resetNonce: 1 }));
  });

  it("changes when the seed changes", () => {
    expect(recommendationSegmentKey({ seed: "seed-a", pcCount: 0, cycle: 1, resetNonce: 0 }))
      .not.toBe(recommendationSegmentKey({ seed: "seed-b", pcCount: 0, cycle: 1, resetNonce: 0 }));
  });
});
