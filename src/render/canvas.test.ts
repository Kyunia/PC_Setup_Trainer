import { describe, expect, it } from "vitest";
import { createBoard, placeCells } from "../engine/board";
import type { GameState } from "../engine/types";
import type { SetupVariant } from "../setups/schema";
import { visibleSetupShadowCells } from "./canvas";

describe("setup shadow cell projection", () => {
  it("suppresses occupied board cells without mutating authoritative solution geometry", () => {
    const setup: SetupVariant = {
      id: "shadow",
      cycle: 5,
      family: "test",
      displayName: "Shadow",
      geometryKind: "solution-shadow",
      pieceSignature: ["Z"],
      placements: [{
        id: "projected-z",
        piece: "Z",
        cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 5, y: 3 }],
      }],
      fumen: "v115@shadow",
      difficulty: 3,
      reviewStatus: "reviewed",
    };
    const board = placeCells(createBoard(), [{ x: 2, y: 0 }], "O");
    const state = { board } as GameState;

    expect(visibleSetupShadowCells(state, setup)).toEqual([
      { cell: { x: 0, y: 0 }, piece: "Z" },
      { cell: { x: 3, y: 1 }, piece: "Z" },
      { cell: { x: 5, y: 3 }, piece: "Z" },
    ]);
    expect(setup.placements[0]?.cells).toHaveLength(4);
  });
});
