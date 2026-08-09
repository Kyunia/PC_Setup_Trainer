import { describe, expect, it } from "vitest";
import { PIECES } from "../engine/types";
import {
  REPLAY_CELL_SIZE,
  REPLAY_PLAYFIELD_HEIGHT,
  REPLAY_VISIBLE_HEIGHT,
  replayCurrentPieceCells,
} from "./canvas";

describe("replay canvas", () => {
  it("uses a 10x8 viewport with five playfield rows and three spawn rows", () => {
    expect(REPLAY_CELL_SIZE).toBe(36);
    expect(REPLAY_PLAYFIELD_HEIGHT).toBe(5);
    expect(REPLAY_VISIBLE_HEIGHT).toBe(8);
  });

  it.each(PIECES)("shows the current %s piece inside the three-row spawn area", (piece) => {
    const cells = replayCurrentPieceCells(piece);

    expect(cells).toHaveLength(4);
    expect(cells.every(({ x }) => x >= 0 && x < 10)).toBe(true);
    expect(cells.every(({ y }) => y >= REPLAY_PLAYFIELD_HEIGHT && y < REPLAY_VISIBLE_HEIGHT)).toBe(true);
  });

  it("shows the I piece in the middle spawn row", () => {
    expect(new Set(replayCurrentPieceCells("I").map(({ y }) => y))).toEqual(new Set([6]));
  });
});
