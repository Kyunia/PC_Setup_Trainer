import { describe, expect, it } from "vitest";
import type { Cycle, Piece } from "../engine/types";
import { replaySidebarQueue, splitReplayQueueByBag } from "./queueBag";

const queue = [..."LSOTZJI"] as Piece[];

describe("replay sidebar bag grouping", () => {
  it("uses ACTIVE followed by six NEXT pieces when HOLD is empty", () => {
    expect(replaySidebarQueue("T", null, [..."IOLJSZT"] as Piece[]).join(""))
      .toBe("TIOLJSZ");
  });

  it("uses HOLD, ACTIVE, and five NEXT pieces when HOLD is occupied", () => {
    expect(replaySidebarQueue("T", "I", [..."OLJSZTI"] as Piece[]).join(""))
      .toBe("ITOLJSZ");
  });

  it("does not invent missing NEXT pieces", () => {
    expect(replaySidebarQueue("T", "I", ["O", "L"])).toEqual(["I", "T", "O", "L"]);
  });

  it.each([
    [1, ["LSOTZJI"]],
    [2, ["LSOT", "ZJI"]],
    [3, ["L", "SOTZJI"]],
    [4, ["LSOTZ", "JI"]],
    [5, ["LS", "OTZJI"]],
    [6, ["LSOTZJ", "I"]],
    [7, ["LSO", "TZJI"]],
  ] as Array<[Cycle, string[]]>)('splits Cycle %s at its 7-bag boundary', (cycle, expected) => {
    expect(splitReplayQueueByBag(cycle, queue, true)?.map((group) => group.join(""))).toEqual(expected);
  });

  it("falls back when the PC start or seven-piece queue is not trustworthy", () => {
    expect(splitReplayQueueByBag(2, queue.slice(0, 6), true)).toBeNull();
    expect(splitReplayQueueByBag(2, queue, false)).toBeNull();
  });
});
