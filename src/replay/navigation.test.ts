import { describe, expect, it } from "vitest";
import { createGameState } from "../engine/game";
import { createReplayData, snapshotFromGameState } from "./format";
import { buildReplayPcSegments, segmentForFrame } from "./navigation";

describe("replay PC navigation", () => {
  it("maps every sidebar PC to the first frame of that PC", () => {
    const state = createGameState("navigation-seed");
    const replay = createReplayData(state);
    replay.frames.push({
      kind: "placement",
      pcIndex: 0,
      cycle: 1,
      pieceInPc: 1,
      snapshot: snapshotFromGameState(state),
      placement: { piece: state.active.piece, orientation: "N", x: 3, y: 0, cells: [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }], clearedLines: 0, perfectClear: false },
    });
    replay.frames.push({ kind: "pc-start", pcIndex: 1, cycle: 2, pieceInPc: 0, snapshot: snapshotFromGameState(state) });
    replay.frames.push({
      kind: "placement",
      pcIndex: 1,
      cycle: 2,
      pieceInPc: 1,
      snapshot: snapshotFromGameState(state),
      placement: { piece: state.active.piece, orientation: "N", x: 3, y: 0, cells: [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }], clearedLines: 0, perfectClear: false },
    });

    const segments = buildReplayPcSegments(replay);
    expect(segments.map(({ startFrame }) => startFrame)).toEqual([0, 2]);
    expect(segments[0]?.hasTrustworthyStart).toBe(true);
    expect(segments[1]?.hasTrustworthyStart).toBe(false);
    expect(segmentForFrame(segments, 2)?.pcIndex).toBe(1);
  });

  it("does not expose a trailing PC boundary as a navigable PC", () => {
    const state = createGameState("trailing-boundary-seed");
    const replay = createReplayData(state);
    replay.frames.push({ kind: "pc-start", pcIndex: 1, cycle: 2, pieceInPc: 0, snapshot: snapshotFromGameState(state) });

    expect(buildReplayPcSegments(replay)).toHaveLength(1);
  });

  it("marks a mid-PC initial frame as unavailable for 0P-only features", () => {
    const state = createGameState("partial-navigation-seed");
    state.run.piecesLockedSinceLastPc = 2;
    const replay = createReplayData(state);
    expect(buildReplayPcSegments(replay)[0]?.hasTrustworthyStart).toBe(false);
  });

  it("includes HOLD before ACTIVE in a QPCR1 sidebar queue", () => {
    const state = createGameState("navigation-hold-seed");
    state.hold = "I";
    state.active.piece = "T";
    state.bag.queue = ["O", "L", "J", "S", "Z", "I", "T"];
    const segment = buildReplayPcSegments(createReplayData(state))[0];

    expect(segment?.queue).toEqual(["I", "T", "O", "L", "J", "S", "Z"]);
  });
});
