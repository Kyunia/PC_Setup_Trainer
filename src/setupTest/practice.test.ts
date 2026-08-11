import { describe, expect, it } from "vitest";
import { PIECES, type Piece } from "../engine/types";
import { parseSetupTestQueue, parseSetupTestState } from "./queueInput";
import { createSetupTestPracticeState, extendSetupTestQueue, setupQueryFromPracticeState } from "./practice";

function sorted(pieces: readonly Piece[]): Piece[] {
  return [...pieces].sort();
}

describe("setup_test 0P practice queue", () => {
  it("completes the observed next bag and appends a full random bag", () => {
    const parsed = parseSetupTestQueue(4, ["JOSTZ", "IL"], true);
    const state = createSetupTestPracticeState(parsed, "cycle-4-practice");
    const visible = [state.hold!, state.active.piece, ...state.bag.queue];

    expect(visible.slice(0, 7).join("")).toBe("JOSTZIL");
    expect(sorted(visible.slice(7, 12))).toEqual(sorted(["T", "O", "J", "S", "Z"]));
    expect(sorted(visible.slice(12, 19))).toEqual(sorted(PIECES));
    expect(state.board).toHaveLength(8);
    expect(state.board.every((row) => row.every((cell) => cell === null))).toBe(true);
    expect(state.run.piecesLockedSinceLastPc).toBe(0);
  });

  it("preserves a no-HOLD active queue and starts the next full bag at a boundary", () => {
    const parsed = parseSetupTestQueue(1, ["TOILJSZ"], false);
    const state = createSetupTestPracticeState(parsed, "cycle-1-practice");
    const visible = [state.active.piece, ...state.bag.queue];

    expect(state.hold).toBeNull();
    expect(visible.slice(0, 7).join("")).toBe("TOILJSZ");
    expect(sorted(visible.slice(7, 14))).toEqual(sorted(PIECES));
  });

  it("rejects duplicate pieces inside one inferred bag", () => {
    const parsed = parseSetupTestQueue(4, ["JOSTZ", "II"], true);
    expect(() => createSetupTestPracticeState(parsed, "duplicate-practice"))
      .toThrow("duplicate piece");
  });

  it("requires enough direct-state input to close the current bag segment", () => {
    const parsed = parseSetupTestState(4, "J", "O", "S");
    expect(() => extendSetupTestQueue(4, parsed.visibleQueue, "short-practice"))
      .toThrow("requires at least 5 entered pieces");
  });

  it("projects the live 0P practice state into the shared recommendation query", () => {
    const state = createSetupTestPracticeState(
      parseSetupTestQueue(4, ["JOSTZ", "IL"], true),
      "practice-query",
    );

    expect(setupQueryFromPracticeState(state)).toMatchObject({
      cycle: 4,
      board: state.board,
      active: state.active.piece,
      hold: state.hold,
      next: state.bag.queue,
      holdAvailable: true,
    });
  });
});
