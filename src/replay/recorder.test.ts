import { describe, expect, it } from "vitest";
import { GameSession } from "../engine/game";
import { ReplayRecorder } from "./recorder";
import { createReplayTimeline } from "./timeline";

function lastFrame(replay: ReturnType<ReplayRecorder["export"]>) {
  const timeline = createReplayTimeline(replay);
  return timeline.frameAt(timeline.length - 1);
}

describe("ReplayRecorder", () => {
  it("records the final lock position and follows Undo", () => {
    const session = new GameSession("recording-seed");
    const recorder = new ReplayRecorder(session.placementHistory);
    session.dispatch("moveLeft"); const before = session.state;
    expect(session.dispatch("hardDrop")).toBe(true);
    const replay = recorder.export();
    expect(replay.version).toBe(3);
    expect(replay.events.eventCount).toBe(1);
    expect(replay.events.eventAt(0).piece).toBe(before.active.piece);
    expect(replay.checkpoints.map(({ reason }) => reason)).toEqual(["start", "end"]);
    expect(createReplayTimeline(replay).frameAt(1).placement?.cells).toHaveLength(4);
    expect(session.dispatch("undo")).toBe(true);
    expect(recorder.export().events.eventCount).toBe(0);
  });

  it("records the normalized double-HOLD selection", () => {
    const session = new GameSession("double-hold-replay-seed");
    const recorder = new ReplayRecorder(session.placementHistory);
    session.dispatch("hold"); session.dispatch("hold"); session.dispatch("hardDrop");
    const replay = recorder.export();
    expect(replay.events.eventAt(0).holds).toBe(2);
    const frame = createReplayTimeline(replay).frameAt(1);
    expect(frame.snapshot.hold).toBe(session.state.hold);
    expect(frame.snapshot.next).toEqual(session.state.bag.queue.slice(0, 7));
  });

  it("ignores unfinished current-turn input after the last lock", () => {
    const session = new GameSession("unfinished-turn-seed");
    const recorder = new ReplayRecorder(session.placementHistory);
    session.dispatch("hardDrop");
    const afterLock = lastFrame(recorder.export()).snapshot;
    session.dispatch("moveLeft"); session.dispatch("rotateCW"); session.dispatch("hold");
    expect(lastFrame(recorder.export(session.state)).snapshot).toEqual(afterLock);
  });

  it("records a height-failure lock and removes it when Undo branches the history", () => {
    const session = new GameSession("height-failure-replay");
    const recorder = new ReplayRecorder(session.placementHistory);
    session.state.board[0]![5] = "T";
    session.state.active = { piece: "I", orientation: "E", x: 4, y: 18 };
    session.placementHistory.reset(session.state);
    session.dispatch("hardDrop");
    const failed = recorder.export();
    expect(failed.events.eventCount).toBe(1);
    expect(failed.checkpoints.at(-1)?.reason).toBe("failure");
    expect(lastFrame(failed).snapshot.run.status).toBe("failed");
    session.dispatch("undo");
    expect(recorder.export().events.eventCount).toBe(0);
    expect(session.state.run.status).toBe("playing");
  });
});
