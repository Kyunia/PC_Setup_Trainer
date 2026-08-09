import { describe, expect, it } from "vitest";
import { GameSession } from "./game";
import { spawnPiece } from "./pieces";

describe("PlacementHistory", () => {
  it("keeps same-PC consecutive undo in the bounded hot cache", () => {
    const session = new GameSession("hot-cache-seed");
    session.dispatch("hardDrop");
    session.dispatch("hardDrop");
    expect(session.placementHistory.runtimeShape()).toEqual({ events: 2, checkpoints: 1, hotStates: 3 });

    expect(session.dispatch("undo")).toBe(true);
    expect(session.placementHistory.runtimeShape()).toEqual({ events: 1, checkpoints: 1, hotStates: 2 });
    expect(session.dispatch("undo")).toBe(true);
    expect(session.placementHistory.runtimeShape()).toEqual({ events: 0, checkpoints: 1, hotStates: 1 });
  });

  it("stores one persistent checkpoint per PC and reconstructs only that PC when crossing the boundary", () => {
    const session = new GameSession("pc-boundary-seed");
    for (let y = 0; y < 2; y += 1) {
      session.state.board[y] = Array.from({ length: 10 }, (_, x) => x === 4 || x === 5 ? null : "I");
    }
    session.state.active = spawnPiece("O");
    session.placementHistory.reset(session.state);

    expect(session.dispatch("hardDrop")).toBe(true);
    expect(session.state.run.pcCount).toBe(1);
    expect(session.placementHistory.runtimeShape()).toEqual({ events: 1, checkpoints: 2, hotStates: 1 });

    expect(session.dispatch("undo")).toBe(true);
    expect(session.state.run.pcCount).toBe(0);
    expect(session.state.active.piece).toBe("O");
    expect(session.placementHistory.runtimeShape()).toEqual({ events: 0, checkpoints: 1, hotStates: 1 });
  });

  it("undoes the lock that caused the 5th-row PCMODE game over", () => {
    const session = new GameSession("height-failure-undo");
    session.state.board[0]![5] = "T";
    session.state.active = { piece: "I", orientation: "E", x: 4, y: 18 };
    session.placementHistory.reset(session.state);
    const before = JSON.stringify(session.state);

    expect(session.dispatch("hardDrop")).toBe(true);
    expect(session.state.run.status).toBe("failed");
    expect(session.state.run.message).toContain("4-row PC field");
    expect(session.state.board[4]![5]).toBe("I");

    expect(session.dispatch("undo")).toBe(true);
    expect(session.state.run.status).toBe("playing");
    expect(JSON.stringify(session.state)).toBe(before);
  });
});
