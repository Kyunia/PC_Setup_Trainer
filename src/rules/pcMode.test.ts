import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import { advanceCycle, exceedsPcModeStackHeight, resolvePcModeLock } from "./pcMode";

const run = {
  cycle: 1 as const,
  pcCount: 0,
  piecesLockedSinceLastPc: 0,
  linesSinceLastPc: 0,
  status: "playing" as const,
  message: "test",
};

describe("PC mode rules", () => {
  it("advances 4-line PCs by one cycle and 2-line PCs by four", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((cycle) => advanceCycle(cycle as 1, 4))).toEqual([2, 3, 4, 5, 6, 7, 1]);
    expect([1, 2, 3, 4, 5, 6, 7].map((cycle) => advanceCycle(cycle as 1, 2))).toEqual([5, 6, 7, 1, 2, 3, 4]);
  });

  it("fails when the post-clear board occupies row 5 or above", () => {
    const board = createBoard();
    board[4]![0] = "T";
    expect(exceedsPcModeStackHeight(board)).toBe(true);
    const resolved = resolvePcModeLock(run, board, 0);
    expect(resolved.run.status).toBe("failed");
    expect(resolved.run.message).toContain("4-row PC field");
  });

  it("does not fail at exactly four occupied rows", () => {
    const board = createBoard();
    board[3]![9] = "I";
    expect(exceedsPcModeStackHeight(board)).toBe(false);
    expect(resolvePcModeLock(run, board, 0).run.status).toBe("playing");
  });

  it("keeps the existing ten-piece Perfect Clear failure below the height limit", () => {
    const board = createBoard();
    board[0]![0] = "J";
    const resolved = resolvePcModeLock({ ...run, piecesLockedSinceLastPc: 9 }, board, 0);
    expect(resolved.run.status).toBe("failed");
    expect(resolved.run.message).toContain("within 10 minos");
  });
});
