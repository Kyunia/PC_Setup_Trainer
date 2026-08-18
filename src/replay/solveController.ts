import { cloneBoard } from "../engine/board";
import type { GameState } from "../engine/types";
import { deserializeBoard } from "./format";
import type { ReplayFrame } from "./schema";
import type { ReplayTimeline } from "./timeline";
import type { LiveSolveRequestContext } from "../solver/liveSolver";

export function replayFeaturePanelVisibility(
  showSetupRecommendations: boolean,
  showSolves: boolean,
): { setups: boolean; solves: boolean } {
  return { setups: showSetupRecommendations, solves: showSolves };
}

export function formatReplaySolvePrediction(label: string): string {
  return label.startsWith("Dupe ") ? label : label.replace(/\s+\([^)]*\)$/, "");
}

export function replaySolveSessionKey(input: {
  replayIdentity: string;
  position: number;
  snapshotRevision: number;
  snapshotActive: boolean;
  showSolves: boolean;
}): string {
  return [
    input.replayIdentity,
    input.position,
    input.snapshotRevision,
    input.snapshotActive ? "snapshot" : "replay",
    input.showSolves ? "solves-on" : "solves-off",
  ].join(":");
}

/** Returns only exact current-frame state; an unavailable queue fails closed. */
export function replaySolveContext(
  replay: ReplayTimeline | null,
  position: number,
  frame: ReplayFrame | null,
  snapshotState: GameState | null,
): LiveSolveRequestContext | null {
  if (snapshotState) {
    return {
      board: cloneBoard(snapshotState.board),
      active: snapshotState.active.piece,
      hold: snapshotState.hold,
      next: snapshotState.bag.queue.slice(0, 5),
      piecesLockedSinceLastPc: snapshotState.run.piecesLockedSinceLastPc,
      linesSinceLastPc: snapshotState.run.linesSinceLastPc,
    };
  }
  if (!replay || !frame) return null;
  const next = replay.nextQueueAt(position, 5);
  if (!next) return null;
  return {
    board: deserializeBoard(frame.snapshot.board),
    active: frame.snapshot.active,
    hold: frame.snapshot.hold,
    next,
    piecesLockedSinceLastPc: frame.snapshot.run.piecesLockedSinceLastPc,
    linesSinceLastPc: frame.snapshot.run.linesSinceLastPc,
  };
}

export function replaySolveUnavailableReason(snapshotActive: boolean): string {
  return snapshotActive
    ? "Snapshot solve is unavailable without an exact finite queue."
    : "Replay solve is unavailable without an exact current-frame queue.";
}
