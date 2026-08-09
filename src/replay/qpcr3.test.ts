import { describe, expect, it } from "vitest";
import { GameSession } from "../engine/game";
import type { PlacementEvent } from "../engine/placement";
import { createReplayV3Data, crc32c, decodeQpcr3Container, encodeQpcr3Container, packReplayEvents, packedReplayEvents, QPCR3_REPLAY_SEMANTICS_VERSION, verifyReplaySemantics } from "./qpcr3";

function event(overrides: Partial<PlacementEvent> = {}): PlacementEvent {
  return { kind: "lock", holds: 2, piece: "T", orientation: "W", x: 9, y: 7, ...overrides };
}

describe("QPCR3 binary replay", () => {
  it("packs the agreed 16-bit event little-endian", () => {
    const packed = packReplayEvents([event()]);
    expect([...packed.bytes]).toEqual([0xd7, 0x2b]);
    expect(packed.eventAt(0)).toEqual(event());
  });

  it("rejects reserved bits, forbidden HOLD code, and invalid x code", () => {
    expect(() => packedReplayEvents(Uint8Array.from([0x00, 0x40]), 1)).toThrow("event extension");
    expect(() => packedReplayEvents(Uint8Array.from([0x00, 0x30]), 1)).toThrow("HOLD count");
    expect(() => packedReplayEvents(Uint8Array.from([0x78, 0x00]), 1)).toThrow("x code");
  });

  it("round-trips the container and detects corruption", () => {
    const session = new GameSession("qpcr3-container-seed"); session.dispatch("hardDrop");
    const replay = createReplayV3Data(session.placementHistory.initialState(), session.placementHistory.eventLog(), "2026-08-08T00:00:00.000Z");
    expect(replay.replaySemanticsVersion).toBe(QPCR3_REPLAY_SEMANTICS_VERSION);
    expect(QPCR3_REPLAY_SEMANTICS_VERSION).toBe(2);
    const bytes = encodeQpcr3Container(replay); const decoded = decodeQpcr3Container(bytes);
    expect(decoded.events.eventAt(0)).toEqual(replay.events.eventAt(0));
    const verifiedRun = verifyReplaySemantics(decoded).run;
    expect(verifiedRun).toMatchObject({
      cycle: session.state.run.cycle,
      pcCount: session.state.run.pcCount,
      piecesLockedSinceLastPc: session.state.run.piecesLockedSinceLastPc,
      linesSinceLastPc: session.state.run.linesSinceLastPc,
      status: session.state.run.status,
    });
    expect(verifiedRun.message).toBe("Replay start.");
    const corrupted = bytes.slice(); corrupted[Math.floor(corrupted.length / 2)]! ^= 1;
    expect(() => decodeQpcr3Container(corrupted)).toThrow("CRC32C");
  });

  it("uses the standard CRC32C Castagnoli test vector", () => {
    expect(crc32c(new TextEncoder().encode("123456789")).toString(16)).toBe("e3069283");
  });

  it("encodes the terminal vertical-I height failure within the 8-row lock field", () => {
    const session = new GameSession("qpcr3-eight-row-height-failure");
    for (let y = 0; y < 4; y += 1) session.state.board[y]![5] = "T";
    session.state.active = { piece: "I", orientation: "E", x: 4, y: 18 };
    session.placementHistory.reset(session.state);

    expect(session.dispatch("hardDrop")).toBe(true);
    expect(session.state.run.status).toBe("failed");
    const replay = createReplayV3Data(session.placementHistory.initialState(), session.placementHistory.eventLog());
    expect(replay.events.eventAt(0).y).toBe(6);
    expect(verifyReplaySemantics(replay).board[7]![5]).toBe("I");
    expect(replay.checkpoints.at(-1)?.reason).toBe("failure");
  });

  it("rejects coordinates outside the compact event contract", () => {
    expect(() => packReplayEvents([event({ x: -2 })])).toThrow("x must be between -1 and 9");
    expect(() => packReplayEvents([event({ x: 10 })])).toThrow("x must be between -1 and 9");
    expect(() => packReplayEvents([event({ y: -1 })])).toThrow("y must be between 0 and 7");
    expect(() => packReplayEvents([event({ y: 8 })])).toThrow("y must be between 0 and 7");
  });
});

