import { describe, expect, it } from "vitest";
import { expandEquivalentPlacementVariants } from "./placementVariants";
import type { SetupVariant } from "./schema";

const wallI: SetupVariant = {
  id: "wall-i",
  cycle: 5,
  family: "wall-i",
  displayName: "Wall I",
  pieceSignature: ["I"],
  placements: [{
    id: "wall-i-i-1",
    piece: "I",
    cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }],
  }],
  equivalentPlacementVariants: [{
    id: "right-wall",
    translations: [{ placementId: "wall-i-i-1", dx: 9, dy: 0 }],
  }],
  difficulty: 5,
  reviewStatus: "reviewed",
};

describe("equivalent placement variants", () => {
  it("stores one logical geometry and expands the opposite wall before BFS", () => {
    const expanded = expandEquivalentPlacementVariants([wallI]);
    expect(expanded).toHaveLength(2);
    expect(expanded[0].placements[0].cells.map(({ x }) => x)).toEqual([0, 0, 0, 0]);
    expect(expanded[1].placements[0].cells.map(({ x }) => x)).toEqual([9, 9, 9, 9]);
    expect(expanded[1]).toMatchObject({
      policySourceId: "wall-i",
      recommendationGroup: "placement:wall-i",
      derivedVariant: "translation",
      equivalentPlacementVariants: undefined,
      fumen: undefined,
    });
  });

  it("rejects a translated placement that overlaps retained geometry", () => {
    const overlapping: SetupVariant = {
      ...wallI,
      id: "overlap",
      pieceSignature: ["I", "O"],
      placements: [
        wallI.placements[0],
        { id: "o", piece: "O", cells: [{ x: 8, y: 0 }, { x: 9, y: 0 }, { x: 8, y: 1 }, { x: 9, y: 1 }] },
      ],
    };
    expect(() => expandEquivalentPlacementVariants([overlapping])).toThrow(/overlaps/);
  });
});
