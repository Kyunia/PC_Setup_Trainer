import { describe, expect, it } from "vitest";
import { GameSession } from "../engine/game";
import { spawnPiece } from "../engine/pieces";
import type { Piece } from "../engine/types";
import { createReplayData, snapshotFromGameState } from "./format";
import { ReplayRecorder } from "./recorder";
import { createReplayTimeline } from "./timeline";

describe("replay timeline", () => {
  it("derives QPCR3 frames lazily from one lock event per position", () => {
    const session = new GameSession("timeline-seed");
    const initialNext = [...session.state.bag.queue];
    const recorder = new ReplayRecorder(session.placementHistory);
    session.dispatch("hardDrop");
    session.dispatch("hardDrop");

    const timeline = createReplayTimeline(recorder.export(session.state));
    expect(timeline.length).toBe(3);
    expect(timeline.frameAt(0).kind).toBe("pc-start");
    expect(timeline.frameAt(1).kind).toBe("placement");
    expect(timeline.frameAt(2).pieceInPc).toBe(2);
    expect(timeline.segments).toHaveLength(1);
    expect(timeline.nextQueueAt(0, 10)).toHaveLength(10);
    expect(timeline.nextQueueAt(0, 10)).toEqual(initialNext.slice(0, 10));
  });

  it("includes HOLD before ACTIVE in a QPCR3 sidebar queue", () => {
    const session = new GameSession("timeline-hold-seed");
    session.state.hold = "I";
    session.state.active = spawnPiece("T");
    session.state.bag.queue = ["O", "L", "J", "S", "Z", "I", "T"];
    session.placementHistory.reset(session.state);

    const timeline = createReplayTimeline(new ReplayRecorder(session.placementHistory).export(session.state));
    expect(timeline.segments[0]?.queue).toEqual(["I", "T", "O", "L", "J", "S", "Z"]);
  });

  it("rejects checkpoint corruption while building the QPCR3 index", () => {
    const session = new GameSession("timeline-checksum-seed");
    const recorder = new ReplayRecorder(session.placementHistory);
    session.dispatch("hardDrop");
    const replay = recorder.export(session.state);
    replay.checkpoints.at(-1)!.checksum ^= 1;

    expect(() => createReplayTimeline(replay)).toThrow("integrity check failed");
  });

  it("inserts a navigable 0P stop between QPCR3 PCs", () => {
    const session = new GameSession("qpcr3-boundary-seed");
    for (let y = 0; y < 2; y += 1) {
      session.state.board[y] = Array.from({ length: 10 }, (_, x) => x === 4 || x === 5 ? null : "I");
    }
    session.state.active = spawnPiece("O");
    session.state.run.piecesLockedSinceLastPc = 9;
    session.placementHistory.reset(session.state);
    session.dispatch("hardDrop");
    session.dispatch("hardDrop");

    const timeline = createReplayTimeline(new ReplayRecorder(session.placementHistory).export(session.state));
    expect(timeline.length).toBe(4);
    expect([0, 1, 2, 3].map((position) => ({
      kind: timeline.frameAt(position).kind,
      pcIndex: timeline.frameAt(position).pcIndex,
      pieceInPc: timeline.frameAt(position).pieceInPc,
    }))).toEqual([
      { kind: "pc-start", pcIndex: 0, pieceInPc: 9 },
      { kind: "placement", pcIndex: 0, pieceInPc: 10 },
      { kind: "pc-start", pcIndex: 1, pieceInPc: 0 },
      { kind: "placement", pcIndex: 1, pieceInPc: 1 },
    ]);
    expect(timeline.segments.map(({ startFrame }) => startFrame)).toEqual([0, 2]);
    expect(timeline.segments.map(({ hasTrustworthyStart }) => hasTrustworthyStart)).toEqual([false, true]);
  });

  it("keeps QPCR1 PC-start frames as navigation stops", () => {
    const session = new GameSession("qpcr1-boundary-seed");
    const replay = createReplayData(session.state);
    const firstPcStart = replay.frames[0]!;
    const nextPcSnapshot = {
      ...snapshotFromGameState(session.state),
      active: "I" as const,
      next: ["T", "O", "S", "Z", "J"] as Piece[],
      run: { ...snapshotFromGameState(session.state).run, pcCount: 1, cycle: 2 as const },
    };
    replay.frames.push(
      { ...firstPcStart, kind: "placement", pieceInPc: 10, snapshot: nextPcSnapshot },
      { ...firstPcStart, pcIndex: 1, cycle: 2, snapshot: nextPcSnapshot },
      { ...firstPcStart, kind: "placement", pcIndex: 1, cycle: 2, pieceInPc: 1, snapshot: nextPcSnapshot },
    );

    const timeline = createReplayTimeline(replay);
    expect(timeline.length).toBe(4);
    expect(timeline.segments.map(({ startFrame }) => startFrame)).toEqual([0, 2]);
    expect(timeline.segments[1]?.hasTrustworthyStart).toBe(true);
    expect(timeline.segments[1]?.queue[0]).toBe("I");
    expect(timeline.frameAt(2).kind).toBe("pc-start");
    expect(timeline.frameAt(2).pieceInPc).toBe(0);
    expect(timeline.frameAt(3).kind).toBe("placement");
  });

  it("derives a QPCR1 0P stop when imported frames omit explicit PC boundaries", () => {
    const session = new GameSession("qpcr1-derived-boundary-seed");
    const replay = createReplayData(session.state);
    const initial = replay.frames[0]!;
    const nextPcSnapshot = {
      ...snapshotFromGameState(session.state),
      active: "I" as const,
      run: { ...snapshotFromGameState(session.state).run, pcCount: 1, cycle: 2 as const },
    };
    replay.frames.push(
      { ...initial, kind: "placement", pieceInPc: 10, snapshot: nextPcSnapshot },
      { ...initial, kind: "placement", pcIndex: 1, cycle: 2, pieceInPc: 1, snapshot: nextPcSnapshot },
    );

    const timeline = createReplayTimeline(replay);
    expect(timeline.length).toBe(4);
    expect(timeline.frameAt(2)).toMatchObject({ kind: "pc-start", pcIndex: 1, pieceInPc: 0 });
    expect(timeline.frameAt(3)).toMatchObject({ kind: "placement", pcIndex: 1, pieceInPc: 1 });
  });

  it("does not expose a trailing empty QPCR1 PC-start frame", () => {
    const session = new GameSession("qpcr1-trailing-boundary-seed");
    const replay = createReplayData(session.state);
    const initial = replay.frames[0]!;
    replay.frames.push({ ...initial, pcIndex: 1, cycle: 2, pieceInPc: 0 });

    const timeline = createReplayTimeline(replay);
    expect(timeline.length).toBe(1);
    expect(timeline.segments).toHaveLength(1);
    expect(() => timeline.frameAt(1)).toThrow("out of range");
  });

  it("extends a QPCR1 NEXT window from later placement frames", () => {
    const session = new GameSession("qpcr1-snapshot-queue");
    const replay = createReplayData(session.state);
    const initial = replay.frames[0]!;
    const windows = ["IJLOSTZ", "JLOSTZI", "LOSTZIJ", "OSTZIJL"] as const;
    replay.frames[0] = { ...initial, snapshot: { ...initial.snapshot, next: windows[0].split("") as Piece[] } };
    for (let index = 1; index < windows.length; index += 1) {
      replay.frames.push({
        ...initial, kind: "placement", pieceInPc: index,
        snapshot: { ...initial.snapshot, next: windows[index]!.split("") as Piece[] },
      });
    }

    const timeline = createReplayTimeline(replay);
    expect(timeline.nextQueueAt(0, 10)).toEqual("IJLOSTZIJL".split(""));
  });
});
