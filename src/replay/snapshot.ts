import { createBoard } from "../engine/board";
import { spawnPiece } from "../engine/pieces";
import type { GameState } from "../engine/types";
import { deserializeBoard } from "./format";
import type { ReplayTimeline } from "./timeline";

export const SNAPSHOT_BOARD_HEIGHT = 8;

export function snapshotGameStateAt(replay: ReplayTimeline, position: number): GameState | null {
  const frame = replay.frameAt(position);
  if (frame.snapshot.run.status !== "playing") return null;
  const sourceBoard = deserializeBoard(frame.snapshot.board);
  if (sourceBoard.slice(SNAPSHOT_BOARD_HEIGHT).some((row) => row.some((cell) => cell !== null))) return null;

  const requiredNext = frame.snapshot.hold === null ? 10 : 9;
  const next = replay.nextQueueAt(position, requiredNext);
  if (!next) return null;

  const board = createBoard(SNAPSHOT_BOARD_HEIGHT);
  for (let y = 0; y < SNAPSHOT_BOARD_HEIGHT; y += 1) board[y] = [...sourceBoard[y]!];
  return {
    board,
    active: spawnPiece(frame.snapshot.active, SNAPSHOT_BOARD_HEIGHT),
    hold: frame.snapshot.hold,
    holdUsedThisTurn: false,
    bag: { rngState: 0, queue: next },
    run: { ...frame.snapshot.run, status: "playing", message: "Snapshot practice." },
    seed: `${replay.seed}:snapshot:${position}`,
  };
}
