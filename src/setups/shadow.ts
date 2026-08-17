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

function countBoardDifference(
  board: Board,
  setup: SetupVariant,
  placementIndexes: readonly number[],
): number {
  const targets = new Map<string, string>();
  for (const index of placementIndexes) {
    const placement = setup.placements[index];
    for (const { x, y } of placement.cells) targets.set(`${x},${y}`, placement.piece);
  }

  let difference = 0;
  for (const [key, piece] of targets) {
    const [x, y] = key.split(",").map(Number);
    if (board[y]?.[x] !== piece) difference += 1;
  }
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      if (board[y][x] && !targets.has(`${x},${y}`)) difference += 1;
    }
  }
  return difference;
}

/**
 * Returns the smallest coordinate-level difference from any setup progress
 * containing exactly the number of placements already locked this PC.
 * Empty cells belonging only to later setup placements are not mismatches.
 */
export function countSetupShadowDifferenceCells(
  board: Board,
  setup: SetupVariant,
  piecesLockedSinceLastPc: number,
): number {
  const targetCount = Math.min(piecesLockedSinceLastPc, setup.placements.length);
  let minimum = Number.POSITIVE_INFINITY;
  const selected: number[] = [];

  const visit = (start: number): void => {
    if (selected.length === targetCount) {
      minimum = Math.min(minimum, countBoardDifference(board, setup, selected));
      return;
    }
    const remaining = targetCount - selected.length;
    for (let index = start; index <= setup.placements.length - remaining; index += 1) {
      selected.push(index);
      visit(index + 1);
      selected.pop();
    }
  };
  visit(0);
  return Number.isFinite(minimum) ? minimum : 0;
}

export function shouldAutoHideSetupShadow(
  board: Board,
  setup: SetupVariant,
  piecesLockedSinceLastPc: number,
): boolean {
  return piecesLockedSinceLastPc >= 4
    && countSetupShadowDifferenceCells(board, setup, piecesLockedSinceLastPc) >= 8;
}
