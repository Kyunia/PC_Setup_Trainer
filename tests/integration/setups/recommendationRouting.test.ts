import { describe, expect, it } from "vitest";
import rawClassIndex from "../../../setups/cycle-5-class-index.json";
import { createBoard } from "../../../src/engine/board";
import { PIECES, type Piece } from "../../../src/engine/types";
import {
  promotedCycle5AdvancedBundleForPair,
  promotedCycle5AdvancedSources,
} from "../../../src/setups/cycle5AdvancedCatalog";
import { setupsForCycle5Class } from "../../../src/setups/cycle5Catalog";
import { cycle5PiecePairKey } from "../../../src/setups/cycle5Context";
import { singleStageRecommendationPlan, type SetupQuery } from "../../../src/setups/query";

function queryForPair(hold: Piece, active: Piece): SetupQuery {
  const next = PIECES.filter((piece) => piece !== hold && piece !== active);
  return {
    cycle: 5,
    board: createBoard(),
    active,
    hold,
    next,
    holdAvailable: true,
  };
}

describe("Cycle 5 recommendation routing", () => {
  it("routes every distinct HOLD+ACTIVE pair through only its normal class catalog", () => {
    for (let left = 0; left < PIECES.length; left += 1) {
      for (let right = left + 1; right < PIECES.length; right += 1) {
        const hold = PIECES[left]!;
        const active = PIECES[right]!;
        const query = queryForPair(hold, active);
        const classCatalog = setupsForCycle5Class([hold, active]);
        const classIds = new Set(classCatalog.map(({ id }) => id));
        const plan = singleStageRecommendationPlan(query);
        expect(plan).not.toBeNull();
        expect(plan!.searches).toHaveLength(1);
        expect(plan!.searches[0]!.policyCatalog).toBe(classCatalog);
        for (const setup of plan!.searches[0]!.catalog) expect(classIds.has(setup.id)).toBe(true);
      }
    }
  });

  it("fails closed for duplicate HOLD+ACTIVE pairs", () => {
    for (const piece of PIECES) {
      const plan = singleStageRecommendationPlan({
        cycle: 5,
        board: createBoard(),
        active: piece,
        hold: piece,
        next: PIECES.filter((candidate) => candidate !== piece).slice(0, 5),
        holdAvailable: true,
      });
      expect(plan?.searches ?? []).toEqual([]);
    }
  });

  it("matches Advanced availability and mirror direction to current promoted data", () => {
    const activeClassIds = new Set(promotedCycle5AdvancedSources().map(({ classId }) => classId));
    const classes = Object.values(rawClassIndex.classes) as unknown as Array<{
      sourceFileClass: string;
      firstBagPieces: [Piece, Piece];
      sourceDirection: "source-basis" | "horizontal-runtime-mirror";
    }>;
    const expectedAvailable = classes.filter(({ sourceFileClass }) => activeClassIds.has(sourceFileClass)).length;
    let available = 0;
    let unavailable = 0;
    for (const descriptor of classes) {
      const bundle = promotedCycle5AdvancedBundleForPair(descriptor.firstBagPieces);
      if (!activeClassIds.has(descriptor.sourceFileClass)) {
        expect(bundle).toBeNull();
        unavailable += 1;
        continue;
      }
      expect(bundle).not.toBeNull();
      expect(bundle!.bundleId).toBe(`promoted:cycle5-advanced-${descriptor.sourceFileClass}`);
      expect(bundle!.runtimeMirror).toBe(descriptor.sourceDirection === "horizontal-runtime-mirror");
      available += 1;
    }
    expect(available).toBe(expectedAvailable);
    expect(unavailable).toBe(classes.length - expectedAvailable);
    expect(available + unavailable).toBe(classes.length);
  });

  it("fails closed for duplicate pairs in Advanced routing", () => {
    for (const piece of PIECES) {
      expect(cycle5PiecePairKey([piece, piece])).toBe("");
      expect(promotedCycle5AdvancedBundleForPair([piece, piece])).toBeNull();
    }
  });
});
