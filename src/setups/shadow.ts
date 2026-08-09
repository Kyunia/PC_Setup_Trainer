import type { Board } from "../engine/types";
import type { SetupVariant } from "./schema";

export function countSetupShadowWrongCells(board: Board, setup: SetupVariant): number {
  const targets = new Map(
    setup.placements.flatMap((placement) =>
      placement.cells.map(({ x, y }) => [`${x},${y}`, placement.piece] as const),
    ),
  );
  let wrong = 0;
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      const piece = board[y][x];
      if (piece && targets.get(`${x},${y}`) !== piece) wrong += 1;
    }
  }
  return wrong;
}

export function shouldAutoHideSetupShadow(
  board: Board,
  setup: SetupVariant,
  piecesLockedSinceLastPc: number,
): boolean {
  return piecesLockedSinceLastPc >= 3 && countSetupShadowWrongCells(board, setup) > 0;
}
