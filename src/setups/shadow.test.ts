import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import type { Piece } from "../engine/types";
import type { SetupVariant } from "./schema";
import { countSetupShadowWrongCells, shouldAutoHideSetupShadow } from "./shadow";

const setup: SetupVariant = {
  id: "shadow-test",
  cycle: 1,
  family: "test",
  displayName: "Test setup",
  pieceSignature: ["I", "O", "T"],
  placements: [
    { id: "i", piece: "I", cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
    { id: "o", piece: "O", cells: [{ x: 4, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 1 }] },
    { id: "t", piece: "T", cells: [{ x: 6, y: 0 }, { x: 7, y: 0 }, { x: 8, y: 0 }, { x: 7, y: 1 }] },
  ],
  difficulty: 1,
  reviewStatus: "reviewed",
};

function fillPlacement(board: ReturnType<typeof createBoard>, placementIndex: number, piece?: Piece): void {
  const placement = setup.placements[placementIndex];
  for (const { x, y } of placement.cells) board[y][x] = piece ?? placement.piece;
}

describe("setup shadow auto-hide", () => {
  it("keeps the shadow after three matching placements", () => {
    const board = createBoard();
    fillPlacement(board, 0);
    fillPlacement(board, 1);
    fillPlacement(board, 2);
    expect(countSetupShadowWrongCells(board, setup)).toBe(0);
    expect(shouldAutoHideSetupShadow(board, setup, 3)).toBe(false);
  });

  it("hides the shadow after a third placement when the board diverges", () => {
    const board = createBoard();
    fillPlacement(board, 0);
    fillPlacement(board, 1);
    fillPlacement(board, 2, "J");
    expect(countSetupShadowWrongCells(board, setup)).toBe(4);
    expect(shouldAutoHideSetupShadow(board, setup, 3)).toBe(true);
  });

  it("shows the shadow again when undo returns progress to two pieces", () => {
    const board = createBoard();
    fillPlacement(board, 0);
    fillPlacement(board, 1, "J");
    expect(shouldAutoHideSetupShadow(board, setup, 3)).toBe(true);
    expect(shouldAutoHideSetupShadow(board, setup, 2)).toBe(false);
  });
});
