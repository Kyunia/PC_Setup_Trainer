import { encoder, Field } from "tetris-fumen";
import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import type { Piece } from "../engine/types";
import { formatAvailableSaves, perSaveOptions, prepareLiveSolveRequest, type PerSaveMinimalsResult } from "./liveSolver";

describe("live SFinder request preparation", () => {
  it("uses HOLD + ACTIVE + NEXT 5 for a completed 4P save analysis", () => {
    const board = createBoard();
    for (let x = 0; x < 10; x += 1) if (x < 8) board[0][x] = "I";
    for (let x = 0; x < 4; x += 1) board[1][x] = "O";
    for (let x = 0; x < 4; x += 1) board[2][x] = "T";
    const prepared = prepareLiveSolveRequest({
      board, active: "I", hold: "T", next: ["L", "J", "O", "S", "Z"],
      piecesLockedSinceLastPc: 4, linesSinceLastPc: 0,
    });
    expect(prepared).toMatchObject({
      ready: true,
      request: { kind: "per-save-minimals", input: { pattern: "TILJOSZ", targetLines: 4 } },
    });
  });

  it("uses the post-clear board and reduced target height", () => {
    const board = createBoard();
    for (let x = 0; x < 6; x += 1) board[0][x] = "O";
    const prepared = prepareLiveSolveRequest({
      board, active: "T", hold: "I", next: ["L", "J", "O", "S", "Z"],
      piecesLockedSinceLastPc: 4, linesSinceLastPc: 1,
    });
    expect(prepared).toMatchObject({
      ready: true,
      request: { kind: "per-save-minimals", input: { pattern: "ITLJOSZ", targetLines: 3 } },
    });
  });

  it("does not run a 3P solve when HOLD-empty visibility provides only see6", () => {
    const board = createBoard();
    for (let x = 0; x < 12; x += 1) board[Math.floor(x / 10)][x % 10] = "J";
    expect(prepareLiveSolveRequest({
      board, active: "T", hold: null, next: ["I", "L", "J", "O", "S", "Z"],
      piecesLockedSinceLastPc: 3, linesSinceLastPc: 0,
    })).toEqual({ ready: false, reason: "Solve requires see7, but only see6 is available." });
  });

  it("uses ordinary minimals without a save target for a completed 3P setup", () => {
    const board = createBoard();
    for (let index = 0; index < 12; index += 1) {
      board[Math.floor(index / 10)][index % 10] = "J";
    }
    expect(prepareLiveSolveRequest({
      board,
      active: "I",
      hold: "T",
      next: ["L", "J", "O", "S", "Z"],
      piecesLockedSinceLastPc: 3,
      linesSinceLastPc: 0,
    })).toMatchObject({
      ready: true,
      request: {
        kind: "solve-one",
        input: { pattern: "TILJOSZ", targetLines: 4 },
      },
    });
  });

  it("allows any 3P-compatible field regardless of the selected setup geometry", () => {
    const board = createBoard();
    for (let index = 0; index < 12; index += 1) {
      board[Math.floor(index / 10)][index % 10] = "S";
    }

    expect(prepareLiveSolveRequest({
      board,
      active: "I",
      hold: "T",
      next: ["L", "J", "O", "S", "Z"],
      piecesLockedSinceLastPc: 3,
      linesSinceLastPc: 0,
    })).toMatchObject({ ready: true, request: { kind: "solve-one" } });
  });

  it("requires at least three placed pieces", () => {
    expect(prepareLiveSolveRequest({
      board: createBoard(),
      active: "I",
      hold: "T",
      next: ["L", "J", "O", "S", "Z"],
      piecesLockedSinceLastPc: 2,
      linesSinceLastPc: 0,
    })).toEqual({ ready: false, reason: "Place at least 3 pieces before calculating a solve." });
  });
});

describe("live SFinder Fumen projection", () => {
  it("orders available saves as T, I, L, J, O, S, Z and keeps only solution cells", () => {
    const intro = Field.create();
    const saveO = Field.create(); saveO.set(0, 0, "X"); saveO.set(1, 0, "O");
    const saveT = Field.create(); saveT.set(0, 0, "X"); saveT.set(2, 0, "T");
    const fumen = encoder.encode([
      { field: intro },
      { field: saveO, comment: "Save O" },
      { field: saveT, comment: "☆ Save T" },
    ]);
    const empty = Object.fromEntries(([..."IJLOSTZ"] as Piece[]).map((piece) => [piece, { piece, minimalCount: 0, label: `Save ${piece}` }])) as PerSaveMinimalsResult["results"];
    const result: PerSaveMinimalsResult = {
      results: { ...empty, O: { piece: "O", minimalCount: 1, label: "Save O" }, T: { piece: "T", minimalCount: 1, label: "Save T" } },
      pageCounts: { I: 0, J: 0, L: 0, O: 1, S: 0, T: 1, Z: 0 },
      fumen,
    };
    const options = perSaveOptions(result, 5);
    expect(options.map(({ save }) => save)).toEqual(["T", "O"]);
    expect(formatAvailableSaves(options)).toBe("Available: Save T, Save O");
    expect(options[0]?.shadow.placements.flatMap(({ cells }) => cells)).toEqual([{ x: 2, y: 0 }]);
  });

  it("omits the available-save summary for ordinary 3P minimals", () => {
    expect(formatAvailableSaves([{ save: null }])).toBeNull();
  });
});
