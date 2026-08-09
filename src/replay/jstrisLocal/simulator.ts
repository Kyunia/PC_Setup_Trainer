import { clearFullLines, collides, createBoard, hardDropY, lockPiece } from "../../engine/board";
import { occupiedCells, spawnPiece } from "../../engine/pieces";
import type { ActivePiece, Board, Cycle, Orientation, Piece, RotationDirection, RunState } from "../../engine/types";
import { resolvePcModeLock } from "../../rules/pcMode";
import { tryRotate } from "../../rules/rotation";
import {
  MAX_REPLAY_PLACEMENTS,
  serializeBoard,
  type ReplayDataV1,
  type ReplayFrame,
  type ReplaySnapshot,
} from "../format";
import { QPCR1_VERSION, REPLAY_FORMAT } from "../schema";
import { createJstrisRandomizer } from "./randomizer";
import { ActionCode, AuxCode, type JstrisReplayObject, type ReplayAction } from "./types";

const PREVIEW_COUNT = 7;

function modeInfo(replay: JstrisReplayObject): { practiceMode: number; variant: number } {
  const packed = Number(replay.c.m ?? 0) >>> 0;
  const explicit = Number.isFinite(Number(replay.c.pmode)) ? Number(replay.c.pmode) : undefined;
  return { practiceMode: explicit ?? (packed >>> 16), variant: packed & 0xffff };
}

function metadata(replay: JstrisReplayObject): { createdAt: string; seed: string } {
  const timestamp = typeof replay.c.gameEnd === "number" ? replay.c.gameEnd
    : typeof replay.c.gameStart === "number" ? replay.c.gameStart : Date.now();
  const seed = replay.c.seed === undefined || replay.c.seed === null ? "jstris-import" : `jstris-${String(replay.c.seed)}`;
  return { createdAt: new Date(timestamp).toISOString(), seed };
}

function snapshot(board: Board, active: Piece, hold: Piece | null, next: readonly Piece[], run: RunState): ReplaySnapshot {
  return {
    board: serializeBoard(board), active, hold, next: next.slice(0, PREVIEW_COUNT),
    run: { ...run, message: run.message || "Imported locally from Jstris." },
  };
}

/** Jstris V3 spawns one hidden row above the trainer's live-game spawn origin. */
function jstrisSpawn(piece: Piece): ActivePiece {
  const active = spawnPiece(piece);
  return { ...active, y: active.y + 1 };
}

function moveToProjectOrigin(active: ActivePiece, boxX: number, boxTopY: number): { x: number; y: number } {
  let pivotX = 1; let pivotY = 1;
  if (active.piece === "O") {
    const offsets = { N: [1, 0], E: [2, 1], S: [1, 2], W: [0, 1] } as const;
    [pivotX, pivotY] = offsets[active.orientation];
  }
  return { x: boxX + pivotX, y: 39 - (boxTopY + pivotY) };
}

/**
 * QPCR1 historically follows Fumen operation-origin coordinates. Keep the live
 * engine/native QPCR3 anchor untouched and normalize only at the Jstris→QPCR1
 * materialization boundary. Occupied cells remain identical.
 */
export function normalizeJstrisQpcr1Pose(
  piece: Piece,
  orientation: Orientation,
  x: number,
  y: number,
): { x: number; y: number } {
  if (piece === "I") {
    if (orientation === "E") return { x: x + 1, y };
    if (orientation === "S") return { x: x + 1, y: y - 1 };
    if (orientation === "W") return { x, y: y - 1 };
  }
  if (piece === "O") {
    if (orientation === "E") return { x, y: y + 1 };
    if (orientation === "S") return { x: x + 1, y: y + 1 };
    if (orientation === "W") return { x: x + 1, y };
  }
  return { x, y };
}

export function simulateJstrisToQpcr1(replay: JstrisReplayObject, actions: readonly ReplayAction[]): ReplayDataV1 {
  const mode = modeInfo(replay);
  if (mode.practiceMode !== 8) throw new Error(`Only Jstris PC Mode replays are supported; got practiceMode=${mode.practiceMode}.`);
  if (replay.map !== undefined && replay.map !== null) throw new Error("Jstris replays with an initial map are not supported by the PC Mode importer.");

  const randomizer = createJstrisRandomizer(replay.c);
  const queue: Piece[] = [];
  const fillQueue = (minimum: number): void => { while (queue.length < minimum) queue.push(randomizer.next()); };

  let board = createBoard();
  let active: ActivePiece = jstrisSpawn("I");
  let activeReady = false;
  let hold: Piece | null = null;
  let canHold = true;
  let softDropActive = false;
  let run: RunState = {
    cycle: 1, pcCount: 0, piecesLockedSinceLastPc: 0, linesSinceLastPc: 0,
    status: "playing", message: "Imported locally from Jstris.",
  };
  const frames: ReplayFrame[] = [];
  let placements = 0;

  const valid = (candidate: ActivePiece): boolean => !collides(board, candidate);
  const move = (dx: number, dy: number): boolean => {
    const candidate = { ...active, x: active.x + dx, y: active.y + dy };
    if (!valid(candidate)) return false; active = candidate; return true;
  };
  const das = (dx: number): void => { while (move(dx, 0)) { /* move to wall */ } };
  const rotate = (direction: RotationDirection): void => { active = tryRotate(board, active, direction); };

  const beginTurn = (): void => {
    fillQueue(PREVIEW_COUNT + 1);
    const piece = queue.shift(); if (!piece) throw new Error("Jstris piece queue exhausted.");
    active = jstrisSpawn(piece);
    if (!valid(active)) throw new Error(`Jstris replay top-out at spawn after ${placements} locks.`);
    canHold = true; activeReady = true;
    if (frames.length === 0) {
      fillQueue(PREVIEW_COUNT);
      frames.push({
        kind: "pc-start", pcIndex: run.pcCount, cycle: run.cycle,
        pieceInPc: run.piecesLockedSinceLastPc,
        snapshot: snapshot(board, active.piece, hold, queue, run),
      });
    }
  };
  const ensureTurn = (): void => { if (!activeReady) beginTurn(); };

  const doHold = (): void => {
    if (!canHold) return;
    const outgoing = active.piece;
    if (hold === null) {
      hold = outgoing; fillQueue(PREVIEW_COUNT + 1);
      const piece = queue.shift(); if (!piece) throw new Error("Jstris queue exhausted during HOLD.");
      active = jstrisSpawn(piece);
    } else {
      const incoming = hold; hold = outgoing; active = jstrisSpawn(incoming);
    }
    if (!valid(active)) throw new Error("Jstris replay top-out during HOLD.");
    canHold = false;
  };

  const lock = (): void => {
    active = { ...active, y: hardDropY(board, active) };
    if (!valid(active)) throw new Error("Jstris lock position collides.");
    const cells = occupiedCells(active);
    if (cells.some(({ x, y }) => x < 0 || x >= 10 || y < 0 || y >= board.length)) throw new Error("Jstris lock is outside the supported board.");
    const lockedBoard = lockPiece(board, active);
    const cleared = clearFullLines(lockedBoard);
    const beforeRun = run;
    const resolved = resolvePcModeLock(run, cleared.board, cleared.cleared);
    run = resolved.run;
    board = cleared.board;
    placements += 1;
    if (placements > MAX_REPLAY_PLACEMENTS) throw new Error(`Jstris replay exceeds the ${MAX_REPLAY_PLACEMENTS} placement limit.`);

    fillQueue(PREVIEW_COUNT + 1);
    const activeAfter = queue[0]; if (!activeAfter) throw new Error("Jstris queue exhausted after lock.");
    const nextAfter = queue.slice(1, PREVIEW_COUNT + 1);
    const pose = normalizeJstrisQpcr1Pose(active.piece, active.orientation, active.x, active.y);
    frames.push({
      kind: "placement", pcIndex: beforeRun.pcCount, cycle: beforeRun.cycle,
      pieceInPc: beforeRun.piecesLockedSinceLastPc + 1,
      snapshot: snapshot(board, activeAfter, hold, nextAfter, run),
      displayBoard: serializeBoard(lockedBoard),
      placement: {
        piece: active.piece, orientation: active.orientation, x: pose.x, y: pose.y,
        cells, clearedLines: cleared.cleared, perfectClear: resolved.perfectClear,
      },
    });
    activeReady = false;
    // Jstris V3 soft-drop begin/end is an input-state toggle and persists across locks.
  };

  const needsActive = (action: ReplayAction): boolean => action.a <= ActionCode.Hold
    || action.a === ActionCode.ArrMove || (action.a === ActionCode.Aux && action.aux === AuxCode.MoveTo);

  for (const action of actions) {
    if (needsActive(action)) ensureTurn();
    switch (action.a) {
      case ActionCode.MoveLeft: move(-1, 0); break;
      case ActionCode.MoveRight: move(1, 0); break;
      case ActionCode.DasLeft: das(-1); break;
      case ActionCode.DasRight: das(1); break;
      case ActionCode.RotateLeft: rotate("CCW"); break;
      case ActionCode.RotateRight: rotate("CW"); break;
      case ActionCode.Rotate180: rotate("R180"); break;
      case ActionCode.HardDrop: lock(); break;
      case ActionCode.SoftDropBeginEnd: softDropActive = !softDropActive; break;
      case ActionCode.GravityStep:
        if (softDropActive && Number(replay.c.softDropId ?? -1) === 4) while (move(0, -1)) { /* instant soft drop */ }
        else move(0, -1);
        break;
      case ActionCode.Hold: doHold(); break;
      case ActionCode.ArrMove: move(action.d?.[0] === 0 ? -1 : 1, 0); break;
      case ActionCode.Aux:
        if (action.aux === AuxCode.Afk) break;
        if (action.aux === AuxCode.MoveTo) {
          const [boxX, boxTopY] = action.d ?? [];
          if (boxX === undefined || boxTopY === undefined) throw new Error("Jstris MOVE_TO action has no coordinates.");
          const origin = moveToProjectOrigin(active, boxX, boxTopY);
          const candidate = { ...active, ...origin };
          if (!valid(candidate)) throw new Error(`Jstris MOVE_TO maps to an invalid active position (${origin.x}, ${origin.y}).`);
          active = candidate; break;
        }
        throw new Error(`Unsupported mid-replay Jstris AUX action ${String(action.aux)}.`);
      case ActionCode.GarbageAdd:
      case ActionCode.SolidGarbageAdd:
      case ActionCode.RedBarSet:
        throw new Error(`Jstris PC Mode replay contains unsupported garbage/matrix action ${ActionCode[action.a]}.`);
      default: throw new Error(`Unsupported Jstris action ${action.a}.`);
    }
  }

  const hardDrops = actions.filter(({ a }) => a === ActionCode.HardDrop).length;
  if (placements !== hardDrops) throw new Error(`Jstris replay simulation ended incomplete (${placements}/${hardDrops} locks).`);
  if (frames.length === 0) throw new Error("Jstris replay contains no playable turn.");
  const meta = metadata(replay);
  return { format: REPLAY_FORMAT, version: QPCR1_VERSION, createdAt: meta.createdAt, seed: meta.seed, frames };
}


