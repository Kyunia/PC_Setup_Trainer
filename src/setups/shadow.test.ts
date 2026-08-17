import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import type { Piece } from "../engine/types";
import type { SetupVariant } from "./schema";
import { countSetupShadowDifferenceCells, countSetupShadowWrongCells, shouldAutoHideSetupShadow } from "./shadow";

const setup: SetupVariant = {
  id: "shadow-test",
  cycle: 1,
  family: "test",
  displayName: "Test setup",
  pieceSignature: ["I", "O", "T", "J"],
  placements: [
    { id: "i", piece: "I", cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
    { id: "o", piece: "O", cells: [{ x: 4, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 1 }] },
    { id: "t", piece: "T", cells: [{ x: 6, y: 0 }, { x: 7, y: 0 }, { x: 8, y: 0 }, { x: 7, y: 1 }] },
    { id: "j", piece: "J", cells: [{ x: 0, y: 2 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
  ],
  difficulty: 1,
  reviewStatus: "reviewed",
};

function fillPlacement(board: ReturnType<typeof createBoard>, placementIndex: number, piece?: Piece): void {
  const placement = setup.placements[placementIndex];
  for (const { x, y } of placement.cells) board[y][x] = piece ?? placement.piece;
}

describe("setup shadow auto-hide", () => {
  it("keeps the shadow after four matching placements", () => {
    const board = createBoard();
    fillPlacement(board, 0);
    fillPlacement(board, 1);
    fillPlacement(board, 2);
    fillPlacement(board, 3);
    expect(countSetupShadowWrongCells(board, setup)).toBe(0);
    expect(countSetupShadowDifferenceCells(board, setup, 4)).toBe(0);
    expect(shouldAutoHideSetupShadow(board, setup, 4)).toBe(false);
  });

  it("keeps the shadow when four placements differ by fewer than eight cells", () => {
    const board = createBoard();
    fillPlacement(board, 0);
    fillPlacement(board, 1);
    fillPlacement(board, 2, "J");
    fillPlacement(board, 3);
    expect(countSetupShadowWrongCells(board, setup)).toBe(4);
    expect(countSetupShadowDifferenceCells(board, setup, 4)).toBe(4);
    expect(shouldAutoHideSetupShadow(board, setup, 4)).toBe(false);
  });

  it("hides the shadow when four placements differ by eight cells", () => {
    const board = createBoard();
    fillPlacement(board, 0);
    fillPlacement(board, 1, "J");
    fillPlacement(board, 2, "J");
    fillPlacement(board, 3);
    expect(countSetupShadowDifferenceCells(board, setup, 4)).toBe(8);
    expect(shouldAutoHideSetupShadow(board, setup, 4)).toBe(true);
  });

  it("hides the stale shadow when a line clear removes eight target cells", () => {
    const board = createBoard();
    fillPlacement(board, 2);
    fillPlacement(board, 3);
    expect(countSetupShadowWrongCells(board, setup)).toBe(0);
    expect(countSetupShadowDifferenceCells(board, setup, 4)).toBe(8);
    expect(shouldAutoHideSetupShadow(board, setup, 4)).toBe(true);
  });

  it("shows the shadow again when undo returns progress below four pieces", () => {
    const board = createBoard();
    fillPlacement(board, 0, "J");
    fillPlacement(board, 1, "J");
    fillPlacement(board, 2);
    expect(countSetupShadowDifferenceCells(board, setup, 3)).toBeGreaterThanOrEqual(8);
    expect(shouldAutoHideSetupShadow(board, setup, 3)).toBe(false);
  });

  it("does not count unbuilt placements of a longer setup as differences", () => {
    const longer = {
      ...setup,
      id: "shadow-test-6p",
      pieceSignature: [...setup.pieceSignature, "S", "Z"] as Piece[],
      placements: [
        ...setup.placements,
        { id: "s", piece: "S" as const, cells: [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 3 }, { x: 5, y: 3 }] },
        { id: "z", piece: "Z" as const, cells: [{ x: 6, y: 2 }, { x: 7, y: 2 }, { x: 7, y: 3 }, { x: 8, y: 3 }] },
      ],
    } satisfies SetupVariant;
    const board = createBoard();
    for (let index = 0; index < 4; index += 1) fillPlacement(board, index);
    expect(countSetupShadowDifferenceCells(board, longer, 4)).toBe(0);
    expect(shouldAutoHideSetupShadow(board, longer, 4)).toBe(false);
  });
});
