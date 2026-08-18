import { clearFullLines, collides, hardDropY, isLockable, lockPiece } from "./board";
import { occupiedCells, spawnPiece } from "./pieces";
import { drawPiece } from "./randomizer";
import { BOARD_HEIGHT, VISIBLE_HEIGHT, type BagState, type GameState, type Orientation, type Piece } from "./types";
import { resolvePcModeLock } from "../rules/pcMode";

export interface PlacementEvent {
  kind: "lock";
  /** Minimum HOLD operations needed to reproduce the selected piece. */
  holds: 0 | 1 | 2;
  piece: Piece;
  orientation: Orientation;
  x: number;
  y: number;
}
export interface AppliedPlacement {
  before: GameState;
  after: GameState;
  lockedBoard: GameState["board"];
  clearedLines: number;
  perfectClear: boolean;
}

export interface PlacementTransitionOptions {
  refillBag?: boolean;
  spawnAfterTerminal?: boolean;
}

export function copyGameState(state: GameState): GameState {
  return {
    ...state,
    board: state.board.map((row) => [...row]),
    active: { ...state.active },
    bag: { ...state.bag, queue: [...state.bag.queue] },
    run: { ...state.run },
  };
}
function takeNextPiece(bag: BagState, refillBag: boolean): { piece: Piece; bag: BagState } | null {
  if (refillBag) return drawPiece(bag);
  const [piece, ...queue] = bag.queue;
  return piece ? { piece, bag: { ...bag, queue } } : null;
}

function spawnNext(state: GameState, options: PlacementTransitionOptions = {}): GameState {
  const next = takeNextPiece(state.bag, options.refillBag !== false);
  if (!next) return { ...state, run: { ...state.run, status: "failed", message: "Snapshot queue exhausted." } };
  const active = spawnPiece(next.piece, state.board.length);
  const failed = collides(state.board, active);
  return {
    ...state,
    active,
    bag: next.bag,
    holdUsedThisTurn: false,
    run: failed ? { ...state.run, status: "failed", message: "Spawn blocked." } : state.run,
  };
}

export function applyUnlimitedHold(state: GameState, options: PlacementTransitionOptions = {}): GameState {
  if (state.hold === null) {
    const next = takeNextPiece(state.bag, options.refillBag !== false);
    if (!next) return { ...state, run: { ...state.run, status: "failed", message: "Snapshot queue exhausted after hold." } };
    const active = spawnPiece(next.piece, state.board.length);
    const failed = collides(state.board, active);
    return {
      ...state,
      active,
      hold: state.active.piece,
      holdUsedThisTurn: false,
      bag: next.bag,
      run: failed ? { ...state.run, status: "failed", message: "Spawn blocked after hold." } : state.run,
    };
  }
  const held = state.hold;
  const active = spawnPiece(held, state.board.length);
  return {
    ...state,
    active,
    hold: state.active.piece,
    holdUsedThisTurn: false,
    run: collides(state.board, active)
      ? { ...state.run, status: "failed", message: "Spawn blocked after hold." }
      : state.run,
  };
}

export function lockGameState(state: GameState, options: PlacementTransitionOptions = {}): GameState {
  const cells = occupiedCells(state.active);
  const lockCeiling = state.board.length === BOARD_HEIGHT ? VISIBLE_HEIGHT : state.board.length;
  if (cells.some(({ y }) => y >= lockCeiling)) {
    return { ...state, run: { ...state.run, status: "failed", message: "Piece locked above the field." } };
  }
  const locked = lockPiece(state.board, state.active);
  const cleared = clearFullLines(locked);
  const resolved = resolvePcModeLock(state.run, cleared.board, cleared.cleared);

  // Native play/replay keeps deriving the next piece after a terminal lock.
  // Finite Snapshot practice can stop before that unused draw.
  const terminal = resolved.perfectClear || resolved.run.status === "failed";
  if (terminal && options.spawnAfterTerminal === false) {
    return { ...state, board: cleared.board, run: resolved.run, holdUsedThisTurn: false };
  }
  return spawnNext({ ...state, board: cleared.board, run: resolved.run }, options);
}

function sameSelectionState(left: GameState, right: GameState): boolean {
  return left.active.piece === right.active.piece
    && left.hold === right.hold
    && left.bag.rngState === right.bag.rngState
    && left.bag.queue.join("") === right.bag.queue.join("");
}

export function selectionHoldCount(turnStart: GameState, beforeLock: GameState, options: PlacementTransitionOptions = {}): 0 | 1 | 2 {
  let selected = copyGameState(turnStart);
  for (let holds = 0 as 0 | 1 | 2; holds <= 2; holds = (holds + 1) as 0 | 1 | 2) {
    if (sameSelectionState(selected, beforeLock)) return holds;
    if (holds < 2) selected = applyUnlimitedHold(selected, options);
  }
  throw new Error("Placement history could not normalize the HOLD selection state.");
}

export function placementEventFromStates(turnStart: GameState, beforeLock: GameState, options: PlacementTransitionOptions = {}): PlacementEvent {
  return {
    kind: "lock",
    holds: selectionHoldCount(turnStart, beforeLock, options),
    piece: beforeLock.active.piece,
    orientation: beforeLock.active.orientation,
    x: beforeLock.active.x,
    y: hardDropY(beforeLock.board, beforeLock.active),
  };
}

export function applyPlacementEvent(state: GameState, event: PlacementEvent, eventIndex?: number): AppliedPlacement {
  let selected = copyGameState(state);
  for (let holds = 0; holds < event.holds; holds += 1) selected = applyUnlimitedHold(selected);
  const label = eventIndex === undefined ? "Placement" : `Replay event ${eventIndex}`;
  if (selected.active.piece !== event.piece || selected.run.status !== "playing") {
    throw new Error(`${label} cannot select piece ${event.piece}.`);
  }
  selected = {
    ...selected,
    active: { piece: event.piece, orientation: event.orientation, x: event.x, y: event.y },
  };
  if (collides(selected.board, selected.active) || !isLockable(selected.board, selected.active)) {
    throw new Error(`${label} is not a legal grounded placement.`);
  }
  const before = copyGameState(selected);
  const lockedBoard = lockPiece(before.board, before.active);
  const clearedLines = clearFullLines(lockedBoard).cleared;
  const after = copyGameState(lockGameState(before));
  return {
    before,
    after,
    lockedBoard,
    clearedLines,
    perfectClear: after.run.pcCount > before.run.pcCount,
  };
}
