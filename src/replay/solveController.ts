import { cloneBoard } from "../engine/board";
import type { GameState, Piece } from "../engine/types";
import { deserializeBoard } from "./format";
import type { ReplayFrame } from "./schema";
import type { ReplayTimeline } from "./timeline";
import type { LiveSolveRequestContext } from "../solver/liveSolver";
import type { SolveQueueBagHistory } from "../solver/solveQueue";
import { createBinding, type BindingModifiers } from "../input/settings";

export interface ReplaySolveContext extends LiveSolveRequestContext {
  bagHistory: SolveQueueBagHistory;
}

export function matchesReplaySeeSolveBinding(
  configured: string,
  event: BindingModifiers & { code: string },
): boolean {
  const pressed = createBinding(event.code, event);
  return configured === pressed || configured === event.code;
}

interface ReplaySelection {
  active: Piece;
  hold: Piece | null;
  next: Piece[];
}

function applyReplayHold(selection: ReplaySelection): ReplaySelection | null {
  if (selection.hold === null) {
    const [active, ...next] = selection.next;
    return active ? { active, hold: selection.active, next } : null;
  }
  return { active: selection.hold, hold: selection.active, next: [...selection.next] };
}

function inferReplayHolds(before: ReplayFrame, after: ReplayFrame): 0 | 1 | 2 | null {
  if (!after.placement) return null;
  let selection: ReplaySelection | null = {
    active: before.snapshot.active,
    hold: before.snapshot.hold,
    next: [...before.snapshot.next],
  };
  for (let holds = 0 as 0 | 1 | 2; holds <= 2 && selection; holds = (holds + 1) as 0 | 1 | 2) {
    if (selection.active === after.placement.piece) {
      const [spawned, ...remaining] = selection.next;
      const comparable = Math.min(remaining.length, after.snapshot.next.length);
      if (spawned === after.snapshot.active
        && selection.hold === after.snapshot.hold
        && remaining.slice(0, comparable).every((piece, index) => piece === after.snapshot.next[index])) return holds;
    }
    if (holds < 2) selection = applyReplayHold(selection);
  }
  return null;
}

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
  snapshotBagHistory: SolveQueueBagHistory | null = null,
): ReplaySolveContext | null {
  if (snapshotState) {
    if (!snapshotBagHistory) return null;
    return {
      board: cloneBoard(snapshotState.board),
      active: snapshotState.active.piece,
      hold: snapshotState.hold,
      next: snapshotState.bag.queue.slice(0, 5),
      piecesLockedSinceLastPc: snapshotState.run.piecesLockedSinceLastPc,
      linesSinceLastPc: snapshotState.run.linesSinceLastPc,
      bagHistory: snapshotBagHistory,
    };
  }
  if (!replay || !frame) return null;
  const next = replay.nextQueueAt(position, 5);
  if (!next) return null;
  const pcFrames: ReplayFrame[] = [];
  for (let cursor = position; cursor >= 0; cursor -= 1) {
    const previous = replay.frameAt(cursor);
    if (previous.pcIndex !== frame.pcIndex) break;
    pcFrames.unshift(previous);
    if (previous.kind === "pc-start") break;
  }
  const start = pcFrames[0];
  if (!start || start.kind !== "pc-start") return null;
  const locks: SolveQueueBagHistory["locks"] = [];
  for (let index = 1; index < pcFrames.length; index += 1) {
    const current = pcFrames[index]!;
    const holds = inferReplayHolds(pcFrames[index - 1]!, current);
    if (holds === null || !current.placement) return null;
    locks.push({ piece: current.placement.piece, holds });
  }
  if (locks.length !== frame.snapshot.run.piecesLockedSinceLastPc) return null;
  return {
    board: deserializeBoard(frame.snapshot.board),
    active: frame.snapshot.active,
    hold: frame.snapshot.hold,
    next,
    piecesLockedSinceLastPc: frame.snapshot.run.piecesLockedSinceLastPc,
    linesSinceLastPc: frame.snapshot.run.linesSinceLastPc,
    bagHistory: { initialHasHold: start.snapshot.hold !== null, locks, pendingHolds: 0 },
  };
}

export function replaySolveUnavailableReason(snapshotActive: boolean): string {
  return snapshotActive
    ? "Snapshot solve is unavailable without an exact finite queue."
    : "Replay solve is unavailable without an exact current-frame queue.";
}
