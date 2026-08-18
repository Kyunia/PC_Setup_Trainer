import { describe, expect, it } from "vitest";
import { GameSession } from "../engine/game";
import { MAX_SEED_UTF8_BYTES } from "../engine/seed";
import { createReplayV3Data } from "./qpcr3";
import { replayExportCounts, safeEncodeReplayCode } from "./ReplayExportDialog";

describe("replay export encoding", () => {
  it("reports completed PCs and lock events compactly", () => {
    const session = new GameSession("export-counts");
    const empty = createReplayV3Data(session.placementHistory.initialState(), session.placementHistory.eventLog());
    expect(replayExportCounts(empty)).toEqual({ pc: 0, locks: 0 });

    session.dispatch("hardDrop");
    const oneLock = createReplayV3Data(session.placementHistory.initialState(), session.placementHistory.eventLog());
    expect(replayExportCounts(oneLock)).toEqual({ pc: 0, locks: 1 });
  });

  it("returns an error result instead of throwing for an invalid replay seed", () => {
    const session = new GameSession("export-seed");
    const replay = createReplayV3Data(session.placementHistory.initialState(), session.placementHistory.eventLog());
    const invalid = { ...replay, seed: "a".repeat(MAX_SEED_UTF8_BYTES + 1) };
    expect(safeEncodeReplayCode(invalid)).toEqual({ code: "", error: "QPCR3 seed is too long." });
  });
});
