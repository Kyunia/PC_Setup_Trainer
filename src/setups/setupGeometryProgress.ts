import type { Board } from "../engine/types";
import type { SetupVariant } from "./schema";

export interface SetupGeometryProgress {
  status: "not-started" | "in-progress" | "complete" | "invalid";
  completedPlacementIds: string[];
  completedCount: number;
  totalCount: number;
  remainingSetup?: SetupVariant;
  reason?: "board-outside-setup" | "partial-or-mismatched-placement";
}

/** Projects a setup against locked board cells without performing reachability. */
export function setupGeometryProgress(
  setup: SetupVariant,
  board: Board,
): SetupGeometryProgress {
  const targetByCell = new Map(setup.placements.flatMap((placement) =>
    placement.cells.map(({ x, y }) => [`${x},${y}`, placement.piece] as const)));

  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y]!.length; x += 1) {
      const piece = board[y]![x];
      if (piece !== null && targetByCell.get(`${x},${y}`) !== piece) {
        return {
          status: "invalid",
          completedPlacementIds: [],
          completedCount: 0,
          totalCount: setup.placements.length,
          reason: "board-outside-setup",
        };
      }
    }
  }

  const completedPlacementIds: string[] = [];
  const remaining = [];
  for (const placement of setup.placements) {
    const matchingCells = placement.cells.filter(({ x, y }) => board[y]?.[x] === placement.piece).length;
    if (matchingCells === placement.cells.length) completedPlacementIds.push(placement.id);
    else if (matchingCells === 0) remaining.push(placement);
    else {
      return {
        status: "invalid",
        completedPlacementIds,
        completedCount: completedPlacementIds.length,
        totalCount: setup.placements.length,
        reason: "partial-or-mismatched-placement",
      };
    }
  }

  const completedCount = completedPlacementIds.length;
  const status = completedCount === 0
    ? "not-started"
    : remaining.length === 0
      ? "complete"
      : "in-progress";
  return {
    status,
    completedPlacementIds,
    completedCount,
    totalCount: setup.placements.length,
    remainingSetup: remaining.length === 0 ? undefined : {
      ...setup,
      placements: remaining,
      pieceSignature: remaining.map(({ piece }) => piece).sort(),
    },
  };
}
