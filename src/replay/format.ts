import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  ORIENTATIONS,
  PIECES,
  type ActivePiece,
  type Board,
  type BoardCell,
  type GameState,
  type Orientation,
  type Piece,
} from "../engine/types";
import {
  QPCR1_VERSION,
  QPCR3_VERSION,
  REPLAY_FORMAT,
  type ReplayData,
  type ReplayDataV1,
  type ReplayFrame,
  type ReplaySnapshot,
} from "./schema";
import { decodeQpcr3Container, encodeQpcr3Container } from "./qpcr3";

export * from "./schema";

export const QPCR1_CODE_PREFIX = "QPCR1.";
export const QPCR3_CODE_PREFIX = "QPCR3.";
export const REPLAY_TRANSFER_STORAGE_KEY = "qpcr-replay-transfer-v1";
export const MAX_REPLAY_INPUT_SIZE = 3_000_000;
export const MAX_REPLAY_PLACEMENTS = 100_000;

export function isPiece(value: unknown): value is Piece {
  return typeof value === "string" && (PIECES as readonly string[]).includes(value);
}

export function isOrientation(value: unknown): value is Orientation {
  return typeof value === "string" && (ORIENTATIONS as readonly string[]).includes(value);
}

export function isCycle(value: unknown): value is 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 7;
}

export function serializeBoard(board: Board): string[] {
  return board.slice(0, BOARD_HEIGHT).map((row) => row.map((cell) => cell ?? ".").join(""));
}

export function deserializeBoard(rows: string[]): Board {
  return rows.map((row) => [...row].map((cell): BoardCell => cell === "." ? null : cell as BoardCell));
}

export function snapshotFromGameState(state: GameState): ReplaySnapshot {
  return {
    board: serializeBoard(state.board),
    active: state.active.piece,
    hold: state.hold,
    next: state.bag.queue.slice(0, 7),
    run: { ...state.run },
  };
}

export function createReplayData(state: GameState): ReplayDataV1 {
  return {
    format: REPLAY_FORMAT,
    version: QPCR1_VERSION,
    createdAt: new Date().toISOString(),
    seed: state.seed,
    frames: [{
      kind: "pc-start",
      pcIndex: state.run.pcCount,
      cycle: state.run.cycle,
      pieceInPc: state.run.piecesLockedSinceLastPc,
      snapshot: snapshotFromGameState(state),
    }],
  };
}

function assertBoardRows(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length !== BOARD_HEIGHT
    || value.some((row) => typeof row !== "string" || row.length !== BOARD_WIDTH || !/^[.IJLOSTZX]+$/.test(row))) {
    throw new Error(`${label} must contain ${BOARD_HEIGHT} rows of ${BOARD_WIDTH} cells.`);
  }
}

function assertSnapshot(value: unknown, label: string): asserts value is ReplaySnapshot {
  if (!value || typeof value !== "object") throw new Error(`${label} is missing.`);
  const snapshot = value as Partial<ReplaySnapshot>;
  assertBoardRows(snapshot.board, `${label}.board`);
  if (!isPiece(snapshot.active)) throw new Error(`${label}.active is invalid.`);
  if (snapshot.hold !== null && !isPiece(snapshot.hold)) throw new Error(`${label}.hold is invalid.`);
  if (!Array.isArray(snapshot.next) || snapshot.next.length > 7 || snapshot.next.some((piece) => !isPiece(piece))) {
    throw new Error(`${label}.next is invalid.`);
  }
  const run = snapshot.run;
  if (!run || !isCycle(run.cycle) || !Number.isInteger(run.pcCount) || run.pcCount < 0
    || !Number.isInteger(run.piecesLockedSinceLastPc) || run.piecesLockedSinceLastPc < 0
    || !Number.isInteger(run.linesSinceLastPc) || run.linesSinceLastPc < 0
    || (run.status !== "playing" && run.status !== "failed") || typeof run.message !== "string") {
    throw new Error(`${label}.run is invalid.`);
  }
}

function assertFrame(value: unknown, index: number): asserts value is ReplayFrame {
  if (!value || typeof value !== "object") throw new Error(`frames[${index}] is invalid.`);
  const frame = value as Partial<ReplayFrame>;
  if (frame.kind !== "pc-start" && frame.kind !== "placement") throw new Error(`frames[${index}].kind is invalid.`);
  if (!Number.isInteger(frame.pcIndex) || Number(frame.pcIndex) < 0 || !isCycle(frame.cycle)
    || !Number.isInteger(frame.pieceInPc) || Number(frame.pieceInPc) < 0) {
    throw new Error(`frames[${index}] position is invalid.`);
  }
  assertSnapshot(frame.snapshot, `frames[${index}].snapshot`);
  if (frame.displayBoard !== undefined) assertBoardRows(frame.displayBoard, `frames[${index}].displayBoard`);
  if (frame.kind === "placement") {
    const placement = frame.placement;
    if (!placement || !isPiece(placement.piece) || !isOrientation(placement.orientation)
      || !Number.isInteger(placement.x) || !Number.isInteger(placement.y)
      || !Array.isArray(placement.cells) || placement.cells.length !== 4
      || placement.cells.some(({ x, y }) => !Number.isInteger(x) || !Number.isInteger(y))
      || !Number.isInteger(placement.clearedLines) || placement.clearedLines < 0 || placement.clearedLines > 4
      || typeof placement.perfectClear !== "boolean") {
      throw new Error(`frames[${index}].placement is invalid.`);
    }
  }
}

function assertReplayMetadata(replay: { createdAt?: unknown; seed?: unknown }): void {
  if (typeof replay.createdAt !== "string" || Number.isNaN(Date.parse(replay.createdAt))
    || typeof replay.seed !== "string" || replay.seed.length > 200) {
    throw new Error("Replay metadata is invalid.");
  }
}

export function validateReplayDataV1(value: unknown): ReplayDataV1 {
  if (!value || typeof value !== "object") throw new Error("Replay data is not an object.");
  const replay = value as Partial<ReplayDataV1>;
  if (replay.format !== REPLAY_FORMAT || replay.version !== QPCR1_VERSION) throw new Error("Unsupported replay format or version.");
  assertReplayMetadata(replay);
  if (!Array.isArray(replay.frames) || replay.frames.length === 0) throw new Error("QPCR1 replay has no frames.");
  const placementCount = replay.frames.filter((frame) => frame?.kind === "placement").length;
  if (placementCount > MAX_REPLAY_PLACEMENTS || replay.frames.length > MAX_REPLAY_PLACEMENTS * 2 + 1) {
    throw new Error(`QPCR1 replay exceeds the ${MAX_REPLAY_PLACEMENTS} placement limit.`);
  }
  replay.frames.forEach(assertFrame);
  return replay as ReplayDataV1;
}

export function validateReplayData(value: unknown): ReplayData {
  if (!value || typeof value !== "object") throw new Error("Replay data is not an object.");
  const replay = value as { format?: unknown; version?: unknown };
  if (replay.format !== REPLAY_FORMAT) throw new Error("Unsupported replay format.");
  if (replay.version === QPCR1_VERSION) return validateReplayDataV1(value);
  if (replay.version === QPCR3_VERSION) throw new Error("QPCR3 JSON is not a portable container; use a QPCR3 code or binary file.");
  throw new Error("Unsupported replay format or version.");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(encoded) || encoded.length % 4 === 1) throw new Error("Invalid Base64url replay payload.");
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  let binary: string;
  try { binary = atob(padded); } catch { throw new Error("Invalid Base64url replay payload."); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  // Canonical form check rejects non-canonical trailing bits/alternate padding forms.
  if (bytesToBase64Url(bytes) !== encoded) throw new Error("Non-canonical Base64url replay payload.");
  return bytes;
}

export function encodeReplayCode(replay: ReplayData): string {
  if (replay.version === QPCR3_VERSION) return `${QPCR3_CODE_PREFIX}${bytesToBase64Url(encodeQpcr3Container(replay))}`;
  const json = JSON.stringify(validateReplayDataV1(replay));
  return `${QPCR1_CODE_PREFIX}${bytesToBase64Url(new TextEncoder().encode(json))}`;
}

export function replayToText(replay: ReplayData): string {
  return replay.version === QPCR3_VERSION ? encodeReplayCode(replay) : JSON.stringify(validateReplayDataV1(replay), null, 2);
}

export function parseReplayInput(input: string): ReplayData {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Paste a replay code or choose a replay file.");
  if (trimmed.length > MAX_REPLAY_INPUT_SIZE) throw new Error("Replay input is too large.");
  if (trimmed.startsWith("{")) return validateReplayData(JSON.parse(trimmed));
  if (trimmed.startsWith(QPCR1_CODE_PREFIX)) {
    const bytes = base64UrlToBytes(trimmed.slice(QPCR1_CODE_PREFIX.length));
    let json: string;
    try { json = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("QPCR1 code is not valid UTF-8."); }
    return validateReplayDataV1(JSON.parse(json));
  }
  if (trimmed.startsWith(QPCR3_CODE_PREFIX)) {
    return decodeQpcr3Container(base64UrlToBytes(trimmed.slice(QPCR3_CODE_PREFIX.length)));
  }
  throw new Error("Unknown replay code prefix.");
}

export function replayFileName(replay: ReplayData): string {
  const safeSeed = replay.seed.replace(/[^a-z0-9_-]/gi, "-").slice(0, 40) || "run";
  return `qpcr-replay-${safeSeed}.txt`;
}

export function landedActivePiece(state: GameState, y: number): ActivePiece {
  return { ...state.active, y };
}
