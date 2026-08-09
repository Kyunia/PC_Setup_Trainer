import { describe, expect, it } from "vitest";
import { GameSession } from "../engine/game";
import { cycle4ClassLabel } from "../setups/cycle4Catalog";
import { cycle4QueueContext } from "../setups/cycle4Context";
import { cycle5QueueContext } from "../setups/cycle5Context";
import { parseQueueJumpInput } from "./queueJump";

describe("queue jump", () => {
  it.each([
    ["I", 3],
    ["TS", 5],
    ["ISZ", 7],
    ["ILOT", 2],
    ["TOSIZ", 4],
    ["IJLOST", 6],
    ["IJLOSTZ", 1],
  ] as const)("maps %s to Cycle %i", (input, cycle) => {
    expect(parseQueueJumpInput(input).cycle).toBe(cycle);
  });

  it("loads TS as a playable Cycle 5 class", () => {
    const session = new GameSession("queue-jump-test");
    session.jumpToQueue("ts");

    expect(session.state.run.cycle).toBe(5);
    expect(session.state.hold).toBe("T");
    expect(session.state.active.piece).toBe("S");
    expect(cycle5QueueContext({
      cycle: 5,
      board: session.state.board,
      active: session.state.active.piece,
      hold: session.state.hold,
      next: session.state.bag.queue.slice(0, 5),
      holdAvailable: true,
    })?.classPieces).toEqual(["T", "S"]);
  });

  it("loads TOSIZ as No LJ Cycle 4", () => {
    const session = new GameSession("queue-jump-test");
    session.jumpToQueue("T O S I Z");
    const context = cycle4QueueContext({
      cycle: 4,
      board: session.state.board,
      active: session.state.active.piece,
      hold: session.state.hold,
      next: session.state.bag.queue.slice(0, 5),
      holdAvailable: true,
    });

    expect(session.state.run.cycle).toBe(4);
    expect(context?.buildPieces).toEqual(["T", "O", "S", "I", "Z"]);
    expect(cycle4ClassLabel(context?.missingPieces ?? [])).toBe("LJ");
  });

  it("rejects invalid queue text", () => {
    expect(() => parseQueueJumpInput("")).toThrow("between 1 and 7");
    expect(() => parseQueueJumpInput("TX")).toThrow("Use only");
    expect(() => parseQueueJumpInput("IJLOSTZI")).toThrow("between 1 and 7");
  });
});
