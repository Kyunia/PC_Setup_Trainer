import { describe, expect, it } from "vitest";
import {
  analyzeSolveQueue,
  formatNextBagRemainder,
  formatSolveQueueGroups,
  liveSolveSessionKey,
  predictSavedPiece,
  shouldShowLiveSolveShadow,
} from "./solveQueue";

describe("live solve 7-bag analysis", () => {
  it("splits the Cycle 5 post-4P window as 5+2 and predicts No I/No J", () => {
    const analysis = analyzeSolveQueue("SILTJJI", 5, 4);
    expect(analysis.groups).toEqual([
      ["S", "I", "L", "T", "J"],
      ["J", "I"],
    ]);
    expect(formatSolveQueueGroups(analysis.groups)).toBe("SILTJ  JI");
    expect(formatNextBagRemainder(analysis)).toBe("[TOLSZ]!");
    expect(predictSavedPiece(analysis, "J").label).toBe("No I 6th (TOLJSZ)");
    expect(predictSavedPiece(analysis, "I").label).toBe("No J 6th (TOILSZ)");
  });

  it("identifies a save from the prior bag as a duplicate next-cycle pool", () => {
    const analysis = analyzeSolveQueue("SILTJJI", 5, 4);
    expect(predictSavedPiece(analysis, "S").label).toBe("Dupe S 6th (TOLSSZ)");
  });

  it("handles a solver window ending exactly at a bag boundary", () => {
    const analysis = analyzeSolveQueue("TOILJSZ", 2, 4);
    expect(analysis.groups).toEqual([["T", "O", "I", "L", "J", "S", "Z"]]);
    expect(analysis.nextBagRemainder).toEqual([]);
    expect(formatNextBagRemainder(analysis)).toBe("[TOILJSZ]!");
    expect(predictSavedPiece(analysis, "T").label).toBe("T 3rd");
  });

  it("keeps the solve session across line clears and resets it at a PC boundary", () => {
    const state = {
      seed: "seed",
      run: { cycle: 5 as const, pcCount: 4, linesSinceLastPc: 0 },
    };
    const before = liveSolveSessionKey(state, "setup", 0);
    const afterLineClear = liveSolveSessionKey({
      ...state,
      run: { ...state.run, linesSinceLastPc: 1 },
    }, "setup", 0);
    const afterPc = liveSolveSessionKey({
      ...state,
      run: { ...state.run, cycle: 6 as const, pcCount: 5 },
    }, "setup", 0);
    expect(afterLineClear).toBe(before);
    expect(afterPc).not.toBe(before);
    expect(shouldShowLiveSolveShadow(0, 0)).toBe(true);
    expect(shouldShowLiveSolveShadow(0, 1)).toBe(false);
  });
});
