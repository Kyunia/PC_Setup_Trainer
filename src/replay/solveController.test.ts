import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import { prepareLiveSolveRequest } from "../solver/liveSolver";
import type { ReplayFrame } from "./schema";
import {
  formatReplaySolvePrediction,
  matchesReplaySeeSolveBinding,
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

function replay(next: ReplayFrame["snapshot"]["next"] | null, frames: ReplayFrame[] = [frame()]) {
  return {
    frameAt: (position: number) => frames[position]!,
    nextQueueAt: () => next,
    createdAt: "",
    seed: "seed",
    length: 1,
    segments: [],
  } as never;
}

describe("Replay solves controller", () => {
  it("matches the configured See Solve shortcut, including modifiers", () => {
    expect(matchesReplaySeeSolveBinding("KeyV", { code: "KeyV" })).toBe(true);
    expect(matchesReplaySeeSolveBinding("Ctrl+KeyX", { code: "KeyX", ctrlKey: true })).toBe(true);
    expect(matchesReplaySeeSolveBinding("Ctrl+KeyX", { code: "KeyX" })).toBe(false);
  });

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
    const snapshot = (active: "O" | "S" | "Z" | "T", next: ReplayFrame["snapshot"]["next"], pieces: number) => ({
      ...current.snapshot,
      active,
      next,
      run: { ...current.snapshot.run, piecesLockedSinceLastPc: pieces },
    });
    const start: ReplayFrame = {
      ...current,
      kind: "pc-start",
      pieceInPc: 0,
      placement: undefined,
      snapshot: snapshot("O", ["S", "Z", "T", "J", "L", "O", "I"], 0),
    };
    const placed: ReplayFrame[] = [
      { ...current, pieceInPc: 1, snapshot: snapshot("S", ["Z", "T", "J", "L", "O", "I", "S"], 1), placement: { piece: "O", orientation: "N", x: 0, y: 0, cells: [], clearedLines: 0, perfectClear: false } },
      { ...current, pieceInPc: 2, snapshot: snapshot("Z", ["T", "J", "L", "O", "I", "S", "Z"], 2), placement: { piece: "S", orientation: "N", x: 0, y: 0, cells: [], clearedLines: 0, perfectClear: false } },
      { ...current, pieceInPc: 3, snapshot: snapshot("T", ["J", "L", "O", "I", "S", "Z"], 3), placement: { piece: "Z", orientation: "N", x: 0, y: 0, cells: [], clearedLines: 0, perfectClear: false } },
    ];
    const frames = [start, ...placed];
    const context = replaySolveContext(replay(["J", "L", "O", "S", "Z"], frames), 3, frames[3]!, null);
    expect(context).toMatchObject({ active: "T", hold: "I", next: ["J", "L", "O", "S", "Z"] });
    expect(context?.bagHistory.locks).toEqual([
      { piece: "O", holds: 0 },
      { piece: "S", holds: 0 },
      { piece: "Z", holds: 0 },
    ]);
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
