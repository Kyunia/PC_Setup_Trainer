import { describe, expect, it } from "vitest";
import { GameSession, createGameState } from "../engine/game";
import { createReplayData, encodeReplayCode, parseReplayInput, replayToText } from "./format";
import { ReplayRecorder } from "./recorder";

describe("QPCR replay format", () => {
  it("round-trips QPCR1 code and TXT JSON", () => {
    const replay = createReplayData(createGameState("qpcr1-roundtrip-seed"));
    expect(encodeReplayCode(replay).startsWith("QPCR1.")).toBe(true);
    expect(parseReplayInput(encodeReplayCode(replay))).toEqual(replay);
    expect(parseReplayInput(replayToText(replay))).toEqual(replay);
  });

  it("round-trips QPCR3 binary code", () => {
    const session = new GameSession("qpcr3-roundtrip-seed");
    session.dispatch("hardDrop");
    const replay = new ReplayRecorder(session.placementHistory).export();
    const code = encodeReplayCode(replay);
    expect(code.startsWith("QPCR3.")).toBe(true);
    const parsed = parseReplayInput(code);
    expect(parsed.version).toBe(3);
    if (parsed.version !== 3) throw new Error("Expected QPCR3 replay.");
    expect(parsed.events.eventCount).toBe(1);
    expect(parsed.events.eventAt(0)).toEqual(replay.events.eventAt(0));
    expect(parsed.checkpoints).toEqual(replay.checkpoints);
  });

  it("rejects unsupported input without obsolete-format compatibility", () => {
    expect(() => parseReplayInput("unknown-code")).toThrow("Unknown replay code prefix");
    expect(() => parseReplayInput('{"format":"other"}')).toThrow("Unsupported replay format");
  });
});
