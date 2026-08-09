import { describe, expect, it, vi } from "vitest";
import fixture01 from "./fixtures/jstris-pc-01.replay.txt?raw";
import fixture02 from "./fixtures/jstris-pc-02.replay.txt?raw";
import fixture03 from "./fixtures/jstris-pc-03.replay.txt?raw";
import fixture04 from "./fixtures/jstris-pc-04.replay.txt?raw";
import fixture05 from "./fixtures/jstris-pc-05.replay.txt?raw";
import fixture06 from "./fixtures/jstris-pc-06.replay.txt?raw";
import { importJstrisReplay } from "./jstris";
import { convertJstrisCodeToQpcr1 } from "./jstrisLocal";
import { decodeJstrisReplayCode } from "./jstrisLocal/decode";
import { JstrisSevenBag } from "./jstrisLocal/randomizer";
import { normalizeJstrisQpcr1Pose } from "./jstrisLocal/simulator";
import type { ReplayDataV1 } from "./schema";

const FIXTURES = [
  { code: fixture01, locks: 865, pcs: 86, lines: 344, golden: "37bf5a98" },
  { code: fixture02, locks: 820, pcs: 81, lines: 327, golden: "78de2616" },
  { code: fixture03, locks: 785, pcs: 78, lines: 313, golden: "8754d62f" },
  { code: fixture04, locks: 688, pcs: 69, lines: 272, golden: "849a0b44" },
  { code: fixture05, locks: 219, pcs: 21, lines: 85, golden: "e9b83e85" },
  { code: fixture06, locks: 914, pcs: 91, lines: 364, golden: "b5403a0d" },
] as const;

function fnvText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function boardKey(rows: readonly string[]): string {
  const cells: string[] = [];
  for (let y = 0; y < Math.min(23, rows.length); y += 1) for (let x = 0; x < 10; x += 1) {
    const piece = rows[y]?.[x]; if (piece && piece !== ".") cells.push(`${x},${y}:${piece}`);
  }
  return cells.sort().join(";");
}

function cellsKey(cells: readonly { x: number; y: number }[]): string {
  return cells.map(({ x, y }) => `${x},${y}`).sort().join(";");
}

function savedFumenSemanticDigest(replay: ReplayDataV1): string {
  const rotation = { N: "spawn", E: "right", S: "reverse", W: "left" } as const;
  const placements = replay.frames.filter((frame) => frame.kind === "placement");
  let before = replay.frames[0]!.snapshot.board;
  let text = "";
  for (const frame of placements) {
    const placement = frame.placement!;
    text += `${placement.piece},${rotation[placement.orientation]},${placement.x},${placement.y}`
      + `|${cellsKey(placement.cells)}|${boardKey(before)}|${boardKey(frame.displayBoard!)}|${boardKey(frame.snapshot.board)}`
      + `|${placement.clearedLines}|${placement.perfectClear ? 1 : 0}\n`;
    before = frame.snapshot.board;
  }
  return fnvText(text);
}

describe("local Jstris PC Mode replay import", () => {
  it.each(FIXTURES.map((fixture, index) => [index + 1, fixture] as const))(
    "matches saved Fumen golden semantics for fixture %s",
    (_index, fixture) => {
      const replay = convertJstrisCodeToQpcr1(fixture.code);
      const placements = replay.frames.filter((frame) => frame.kind === "placement");
      expect(placements).toHaveLength(fixture.locks);
      expect(placements.filter((frame) => frame.placement?.perfectClear)).toHaveLength(fixture.pcs);
      expect(placements.reduce((sum, frame) => sum + (frame.placement?.clearedLines ?? 0), 0)).toBe(fixture.lines);
      // These digests were generated from the six saved reference Fumen outputs and include
      // operation pose, occupied cells, before/locked/after boards, line clears and PC flags.
      expect(savedFumenSemanticDigest(replay)).toBe(fixture.golden);
    },
  );

  it("normalizes only QPCR1 pose coordinates, not occupied cells/native engine anchors", () => {
    expect(normalizeJstrisQpcr1Pose("I", "E", -1, 2)).toEqual({ x: 0, y: 2 });
    expect(normalizeJstrisQpcr1Pose("I", "S", 4, 1)).toEqual({ x: 5, y: 0 });
    expect(normalizeJstrisQpcr1Pose("I", "W", 5, 2)).toEqual({ x: 5, y: 1 });
    expect(normalizeJstrisQpcr1Pose("O", "S", 4, 0)).toEqual({ x: 5, y: 1 });
    expect(normalizeJstrisQpcr1Pose("T", "E", 4, 1)).toEqual({ x: 4, y: 1 });
  });

  it("uses the replay-significant Jstris repeated-removal 7-bag", () => {
    const randomizer = new JstrisSevenBag("rbvykr");
    expect(Array.from({ length: 42 }, () => randomizer.next()).join("")).toBe("JIOTSLZIJLOZSTTSOLIZJTZSOLJIZITJSOLITZJLSO");
  });

  it("loads a Jstris URL through the proxy then converts locally", async () => {
    const rawJson = JSON.stringify(decodeJstrisReplayCode(fixture05));
    const fetcher = vi.fn(async () => new Response(rawJson, { status: 200, headers: { "Content-Type": "application/json" } }));
    const replay = await importJstrisReplay("https://jstris.jezevec10.com/replay/105149731", fetcher as typeof fetch);
    expect(replay.frames.filter((frame) => frame.kind === "placement")).toHaveLength(219);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("/api/jstris-replay?id=105149731&type=0");
  });

  it("does not contact the server for a raw replay code", async () => {
    const fetcher = vi.fn();
    const replay = await importJstrisReplay(fixture05, fetcher as typeof fetch);
    expect(replay.frames.filter((frame) => frame.kind === "placement")).toHaveLength(219);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed for unsupported modes, initial maps, randomizers and future versions", () => {
    const decoded = decodeJstrisReplayCode(fixture05);
    expect(() => convertJstrisCodeToQpcr1(JSON.stringify({ ...decoded, c: { ...decoded.c, m: 1 } }))).toThrow("PC Mode");
    expect(() => convertJstrisCodeToQpcr1(JSON.stringify({ ...decoded, map: [[1]] }))).toThrow("initial map");
    expect(() => convertJstrisCodeToQpcr1(JSON.stringify({ ...decoded, c: { ...decoded.c, r: 1 } }))).toThrow("seeded 7-bag");
    expect(() => convertJstrisCodeToQpcr1(JSON.stringify({ ...decoded, c: { ...decoded.c, v: 4 } }))).toThrow("Unsupported Jstris replay version");
  });
});
