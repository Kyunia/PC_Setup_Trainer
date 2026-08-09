import type { ActivePiece, Cell, Cycle, Orientation, Piece } from "../engine/types";
import type { PlacementEvent } from "../engine/placement";

export const REPLAY_FORMAT = "qpcr-replay" as const;
export const QPCR1_VERSION = 1 as const;
export const QPCR3_VERSION = 3 as const;

export interface ReplaySnapshot {
  board: string[];
  active: Piece;
  hold: Piece | null;
  next: Piece[];
  run: {
    cycle: Cycle;
    pcCount: number;
    piecesLockedSinceLastPc: number;
    linesSinceLastPc: number;
    status: "playing" | "failed";
    message: string;
  };
}

export interface ReplayPlacement {
  piece: Piece;
  orientation: Orientation;
  x: number;
  y: number;
  cells: Cell[];
  clearedLines: number;
  perfectClear: boolean;
}

export interface ReplayFrame {
  kind: "pc-start" | "placement";
  pcIndex: number;
  cycle: Cycle;
  pieceInPc: number;
  snapshot: ReplaySnapshot;
  /** Lock 직후, line clear 전 보드. */
  displayBoard?: string[];
  placement?: ReplayPlacement;
}

export interface ReplayDataV1 {
  format: typeof REPLAY_FORMAT;
  version: typeof QPCR1_VERSION;
  createdAt: string;
  seed: string;
  frames: ReplayFrame[];
}

export interface ReplayInitialState {
  board: string[];
  active: ActivePiece;
  hold: Piece | null;
  bag: { rngState: number; queue: Piece[] };
  run: {
    cycle: Cycle;
    pcCount: number;
    piecesLockedSinceLastPc: number;
    linesSinceLastPc: number;
    status: "playing" | "failed";
  };
}

export type ReplayLockEvent = PlacementEvent;

export interface ReplayCheckpoint {
  eventIndex: number;
  pcCount: number;
  checksum: number;
  reason: "start" | "interval" | "failure" | "end";
}

export interface PackedReplayEvents {
  readonly bytes: Uint8Array;
  readonly eventCount: number;
  eventAt(index: number): ReplayLockEvent;
}

export interface ReplayDataV3 {
  format: typeof REPLAY_FORMAT;
  version: typeof QPCR3_VERSION;
  createdAt: string;
  seed: string;
  initial: ReplayInitialState;
  events: PackedReplayEvents;
  checkpoints: ReplayCheckpoint[];
  containerVersion: number;
  replaySemanticsVersion: number;
  checkpointSchemaVersion: number;
}

export type ReplayData = ReplayDataV1 | ReplayDataV3;


