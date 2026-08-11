import { describe, expect, it } from "vitest";
import type { Cycle } from "../engine/types";
import { parseSetupTestQueue, parseSetupTestState, setupTestBagSegments } from "./queueInput";

describe("setup recommendation test queue input", () => {
  it.each([
    [1, [7]],
    [2, [4, 3]],
    [3, [1, 6]],
    [4, [5, 2]],
    [5, [2, 5]],
    [6, [6, 1]],
    [7, [3, 4]],
  ] as Array<[Cycle, number[]]>)
  ("splits Cycle %s at the real bag boundary", (cycle, expected) => {
    expect(setupTestBagSegments(cycle).map(({ length }) => length)).toEqual(expected);
  });

  it("maps the occupied-HOLD convention to Replay's recommendation input", () => {
    const parsed = parseSetupTestQueue(4, ["TOILJ", "LJ"], true);
    expect(parsed.groups).toEqual(["TOILJ", "LJ"]);
    expect(parsed.input.hold).toBe("T");
    expect(parsed.input.active).toBe("O");
    expect(parsed.input.next.join("")).toBe("ILJLJ");
    expect(parsed.input.board.flat().every((cell) => cell === null)).toBe(true);
  });

  it("supports an empty HOLD without changing the entered bag order", () => {
    const parsed = parseSetupTestQueue(2, ["toil", "jsz"], false);
    expect(parsed.visibleQueue.join("")).toBe("TOILJSZ");
    expect(parsed.input.hold).toBeNull();
    expect(parsed.input.active).toBe("T");
    expect(parsed.input.next.join("")).toBe("OILJS");
  });

  it("rejects malformed bag lengths and non-tetromino symbols", () => {
    expect(() => parseSetupTestQueue(4, ["TOIL", "LJ"], true))
      .toThrow("Current bag requires exactly 5 pieces.");
    expect(() => parseSetupTestQueue(4, ["TOILJ", "LX"], true))
      .toThrow('Unknown piece "X"');
  });

  it("also accepts a reconstructed HOLD, ACTIVE, and NEXT state", () => {
    const parsed = parseSetupTestState(4, "t", "o", "iljljsz");
    expect(parsed.input.hold).toBe("T");
    expect(parsed.input.active).toBe("O");
    expect(parsed.input.next.join("")).toBe("ILJLJSZ");
  });

  it("allows an empty HOLD and rejects malformed direct state input", () => {
    expect(parseSetupTestState(2, "", "T", "OILJS").input.hold).toBeNull();
    expect(() => parseSetupTestState(2, "TO", "I", "LJSZ")).toThrow("HOLD requires 0-1 piece");
    expect(() => parseSetupTestState(2, "", "", "LJSZ")).toThrow("ACTIVE requires exactly 1 piece");
  });
});
