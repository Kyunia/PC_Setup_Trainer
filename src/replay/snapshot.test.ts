import { describe, expect, it, vi } from "vitest";
import { createBoard } from "../engine/board";
import type { Piece } from "../engine/types";
import { serializeBoard } from "./format";
import type { ReplayFrame } from "./schema";
import { snapshotGameStateAt } from "./snapshot";
import type { ReplayTimeline } from "./timeline";

function timeline(hold: Piece | null, next: Piece[], board = createBoard()): ReplayTimeline {
  const frame: ReplayFrame = {
    kind: "placement", pcIndex: 1, cycle: 2, pieceInPc: 4,
    snapshot: {
      board: serializeBoard(board), active: "I", hold, next: next.slice(0, 7),
      run: { cycle: 2, pcCount: 1, piecesLockedSinceLastPc: 4, linesSinceLastPc: 1, status: "playing", message: "Playing." },
    },
  };
  return {
    createdAt: new Date(0).toISOString(), seed: "snapshot-test", length: 1, segments: [],
    frameAt: () => frame,
    nextQueueAt: vi.fn((_position: number, minimum: number) => next.length >= minimum ? next.slice(0, minimum) : null),
  };
}

describe("replay Snapshot state", () => {
  it("requires ten NEXT pieces when HOLD is empty", () => {
    const next = "IJLOSTZIJL".split("") as Piece[];
    const replay = timeline(null, next);
    const state = snapshotGameStateAt(replay, 0)!;

    expect(replay.nextQueueAt).toHaveBeenCalledWith(0, 10);
    expect(state.board).toHaveLength(8);
    expect(state.active).toMatchObject({ piece: "I", y: 6 });
    expect(state.bag.queue).toEqual(next);
  });

  it("requires nine NEXT pieces when HOLD is occupied", () => {
    const next = "IJLOSTZIJ".split("") as Piece[];
    const replay = timeline("T", next);
    const state = snapshotGameStateAt(replay, 0)!;

    expect(replay.nextQueueAt).toHaveBeenCalledWith(0, 9);
    expect(state.hold).toBe("T");
    expect(state.bag.queue).toEqual(next);
  });

  it("fails closed when exact queue data or the 10x8 field is unavailable", () => {
    expect(snapshotGameStateAt(timeline(null, ["I"]), 0)).toBeNull();
    const board = createBoard(); board[8]![0] = "T";
    expect(snapshotGameStateAt(timeline(null, "IJLOSTZIJL".split("") as Piece[], board), 0)).toBeNull();
  });
});
