import { describe, expect, it } from "vitest";
import {
  analyzeSolveQueue,
  formatNextBagRemainder,
  formatSolveQueueGroups,
  liveSolveSessionKey,
  predictSavedPiece,
  shouldShowLiveSolveShadow,
} from "./solveQueue";
import type { Cycle, Piece } from "../engine/types";

function bagHistory(
  pieces: readonly Piece[],
  initialHasHold = false,
  holds: readonly (0 | 1 | 2)[] = [],
) {
  return {
    initialHasHold,
    locks: pieces.map((piece, index) => ({ piece, holds: holds[index] ?? 0 })),
    pendingHolds: 0 as const,
  };
}

describe("live solve 7-bag analysis", () => {
  it("splits the Cycle 5 post-4P window as 5+2 and predicts No I/No J", () => {
    const analysis = analyzeSolveQueue("SILTJJI", 5, bagHistory(["S", "Z", "T", "I"]));
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
    const analysis = analyzeSolveQueue("SILTJJI", 5, bagHistory(["S", "Z", "T", "I"]));
    expect(predictSavedPiece(analysis, "S").label).toBe("Dupe S 6th (TOLSSZ)");
  });

  it("handles a solver window ending exactly at a bag boundary", () => {
    const analysis = analyzeSolveQueue("TOILJSZ", 2, bagHistory(["J", "O", "S", "Z"]));
    expect(analysis.groups).toEqual([["T", "O", "I", "L", "J", "S", "Z"]]);
    expect(analysis.nextBagRemainder).toEqual([]);
    expect(formatNextBagRemainder(analysis)).toBe("[TOILJSZ]!");
    expect(predictSavedPiece(analysis, "T").label).toBe("T 3rd");
  });

  it("treats a shortened initial segment as a completed bag for Cycle 2 6P", () => {
    const analysis = analyzeSolveQueue("TJOIS", 2, bagHistory(["J", "O", "S", "Z", "L", "Z"]));
    expect(analysis.groups).toEqual([["T", "J", "O", "I", "S"]]);
    expect(analysis.nextBagRemainder).toEqual([]);
    expect(formatNextBagRemainder(analysis)).toBe("[TOILJSZ]!");
  });

  it.each([
    [1, "[OSZ]!"],
    [2, "[TOILJSZ]!"],
    [3, "[OJSZ]!"],
    [4, "[Z]!"],
    [5, "[OLJSZ]!"],
    [6, "[SZ]!"],
    [7, "[OILJSZ]!"],
  ] as const)("keeps the following-bag prediction stable across 4P-9P in Cycle %i", (cycle, expected) => {
    const canonicalBag = [..."TILJOSZ"] as Piece[];
    for (let placed = 4; placed <= 9; placed += 1) {
      const pcStartOffset = (cycle - 1) * 10;
      const placedPieces = Array.from(
        { length: placed },
        (_, index) => canonicalBag[(pcStartOffset + index) % canonicalBag.length],
      );
      const absoluteOffset = pcStartOffset + placed;
      const pattern = Array.from(
        { length: 11 - placed },
        (_, index) => canonicalBag[(absoluteOffset + index) % canonicalBag.length],
      ).join("");
      const analysis = analyzeSolveQueue(pattern, cycle as Cycle, bagHistory(placedPieces));
      expect(formatNextBagRemainder(analysis), `${placed}P pattern ${pattern}`).toBe(expected);
    }
  });

  it("keeps a skipped prior-bag piece separate after consuming a next-bag piece", () => {
    const fourPieceHistory = bagHistory(["J", "I", "J", "O"], true);
    const before = analyzeSolveQueue("LSZTILJ", 6, fourPieceHistory);
    expect(formatSolveQueueGroups(before.groups)).toBe("LS  ZTILJ");
    expect(formatNextBagRemainder(before)).toBe("[OS]!");

    const after = analyzeSolveQueue("LTILJ", 6, bagHistory(["J", "I", "J", "O", "S", "Z"], true));
    expect(formatSolveQueueGroups(after.groups)).toBe("L  TILJ");
    expect(formatNextBagRemainder(after)).toBe("[OS]!");
  });

  it("tracks empty HOLD and a second HOLD without losing bag ownership", () => {
    const locks = ["T", "I", "L", "J", "O", "S"] as Piece[];
    const once = analyzeSolveQueue("ZTILJ", 1, {
      ...bagHistory(locks),
      pendingHolds: 1,
    });
    expect(formatSolveQueueGroups(once.groups)).toBe("Z  TILJ");
    expect(formatNextBagRemainder(once)).toBe("[OSZ]!");

    const twice = analyzeSolveQueue("TZILJ", 1, {
      ...bagHistory(locks),
      pendingHolds: 2,
    });
    expect(formatSolveQueueGroups(twice.groups)).toBe("T  Z  ILJ");
    expect(formatNextBagRemainder(twice)).toBe("[OSZ]!");
  });

  it("keeps the solve session across line clears and resets it at a PC boundary", () => {
    const state = {
      seed: "seed",
      run: { cycle: 5 as const, pcCount: 4, linesSinceLastPc: 0 },
    };
    const before = liveSolveSessionKey(state, "setup", 0);
    const lineClearState = {
      ...state,
      run: { ...state.run, linesSinceLastPc: 1 },
    };
    const afterLineClear = liveSolveSessionKey(lineClearState, "setup", 0);
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
