import { describe, expect, it } from "vitest";
import { createBagState, drawPiece } from "./randomizer";
import { PIECES, type Piece } from "./types";

function take(seed: string, count: number): Piece[] {
  let bag = createBagState(seed);
  const result: Piece[] = [];
  for (let index = 0; index < count; index += 1) {
    const draw = drawPiece(bag);
    result.push(draw.piece);
    bag = draw.bag;
  }
  return result;
}

describe("7-bag", () => {
  it("같은 seed는 같은 큐를 만든다", () => {
    expect(take("same-seed", 28)).toEqual(take("same-seed", 28));
  });

  it("각 bag에 일곱 미노가 한 번씩 있다", () => {
    const pieces = take("bag-check", 28);
    for (let offset = 0; offset < pieces.length; offset += 7) {
      expect([...pieces.slice(offset, offset + 7)].sort()).toEqual([...PIECES].sort());
    }
  });
});
