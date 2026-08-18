import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import { prepareLiveSolveRequest } from "../solver/liveSolver";
import type { ReplayFrame } from "./schema";
import {
  formatReplaySolvePrediction,
  replayFeaturePanelVisibility,
  replaySolveContext,
  replaySolveSessionKey,
} from "./solveController";

function frame(): ReplayFrame {
  const board = createBoard(24);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 9; x += 1) board[y]![x] = "I";
  }
  return {
    kind: "placement",
    pcIndex: 0,
    cycle: 1,
    pieceInPc: 3,
    snapshot: {
      board: board.map((row) => row.map((cell) => cell ?? ".").join("")),
      active: "T",
      hold: "I",
      next: ["J", "L", "O", "S", "Z"],
      run: {
        cycle: 1,
        pcCount: 0,
        piecesLockedSinceLastPc: 3,
        linesSinceLastPc: 0,
        status: "playing",
        message: "",
      },
    },
  };
}

function replay(next: ReplayFrame["snapshot"]["next"] | null) {
  return {
    frameAt: () => frame(),
    nextQueueAt: () => next,
    createdAt: "",
    seed: "seed",
    length: 1,
    segments: [],
  } as never;
}

describe("Replay solves controller", () => {
  it("keeps piece pools only for duplicate next-cycle labels", () => {
    expect(formatReplaySolvePrediction("No JS 4th (TOILZ)")).toBe("No JS 4th");
    expect(formatReplaySolvePrediction("7-bag 1st (TOILJSZ)")).toBe("7-bag 1st");
    expect(formatReplaySolvePrediction("Dupe T 2nd (TTSZ)")).toBe("Dupe T 2nd (TTSZ)");
    expect(formatReplaySolvePrediction("TOJ 2nd")).toBe("TOJ 2nd");
  });

  it("keeps setup and solve panels independently visible", () => {
    expect(replayFeaturePanelVisibility(true, true)).toEqual({ setups: true, solves: true });
    expect(replayFeaturePanelVisibility(true, false)).toEqual({ setups: true, solves: false });
    expect(replayFeaturePanelVisibility(false, true)).toEqual({ setups: false, solves: true });
    expect(replayFeaturePanelVisibility(false, false)).toEqual({ setups: false, solves: false });
  });

  it("prepares the displayed frame with the exact timeline queue", () => {
    const current = frame();
    const context = replaySolveContext(replay(["J", "L", "O", "S", "Z"]), 0, current, null);
    expect(context).toMatchObject({ active: "T", hold: "I", next: ["J", "L", "O", "S", "Z"] });
    expect(context && prepareLiveSolveRequest(context)).toMatchObject({ ready: true });
  });

  it("fails closed when the frame queue cannot be extended exactly", () => {
    expect(replaySolveContext(replay(null), 0, frame(), null)).toBeNull();
  });

  it("changes reset identity for replay position, selection, and snapshot revisions", () => {
    const base = {
      replayIdentity: "replay-a",
      position: 0,
      snapshotRevision: 0,
      snapshotActive: false,
      showSolves: true,
    } as const;
    const key = replaySolveSessionKey(base);
    expect(replaySolveSessionKey({ ...base, position: 1 })).not.toBe(key);
    expect(replaySolveSessionKey({ ...base, replayIdentity: "replay-b" })).not.toBe(key);
    expect(replaySolveSessionKey({ ...base, snapshotRevision: 1, snapshotActive: true })).not.toBe(key);
    expect(replaySolveSessionKey({ ...base, showSolves: false })).not.toBe(key);
  });
});
