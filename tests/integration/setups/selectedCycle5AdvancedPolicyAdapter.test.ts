import { describe, expect, it } from "vitest";
import { createBoard } from "../../../src/engine/board";
import rawPromotedOiPolicy from "../../../setups/QB/cycle-5-advanced-oi-policy.json";
import rawPromotedTiPolicy from "../../../setups/QB/cycle-5-advanced-ti-policy.json";
import rawPromotedTltjPolicy from "../../../setups/QB/cycle-5-advanced-tltj-policy.json";
import rawPromotedToPolicy from "../../../setups/QB/cycle-5-advanced-to-policy.json";
import rawPromotedTstzPolicy from "../../../setups/QB/cycle-5-advanced-tstz-policy.json";
import rawPromotedOiSetups from "../../../setups/QB/cycle-5-advanced-oi-setups.json";
import type { Cycle5AdvancedPolicyBundle } from "../../../src/setups/cycle5AdvancedPolicy";
import { querySetups, type SetupQuery } from "../../../src/setups/query";
import type { SelectedRecommendationScope } from "../../../src/setups/recommendationScope";
import { normalizeSelectedCycle5AdvancedPolicy } from "../../../src/setups/selectedCycle5AdvancedPolicyAdapter";
import type { SetupVariant } from "../../../src/setups/schema";

describe("promoted Cycle 5 advanced policy integration", () => {
  it("normalizes every promoted advanced policy bundle", () => {
    for (const [sourceId, rawPolicy] of [
      ["oi", rawPromotedOiPolicy],
      ["tltj", rawPromotedTltjPolicy],
      ["ti", rawPromotedTiPolicy],
      ["to", rawPromotedToPolicy],
      ["tstz", rawPromotedTstzPolicy],
    ] as const) {
      const policy = normalizeSelectedCycle5AdvancedPolicy(rawPolicy, `promoted:${sourceId}`);
      expect(policy.classId).toBe(sourceId);
      expect(policy.entries.length).toBeGreaterThan(0);
    }
  });

  it("preserves the promoted nested checkpoint contract", () => {
    const policy = normalizeSelectedCycle5AdvancedPolicy(rawPromotedTiPolicy, "promoted:ti");
    const plan = policy.entries.find(({ id }) => id === "ti5-toi-lj-slow-o");
    expect(plan?.kind).toBe("oqb");
    if (plan?.kind !== "oqb") return;
    expect(plan.branches[0]?.postCheckpoint?.branches).toMatchObject([
      {
        observedPieces: ["Z"],
        continuationSetupRefs: [{ setupId: "cycle5-advanced-ti-solution-016-f000" }],
      },
      {
        fallback: true,
        action: { piece: "O", resultingPieceCount: 4 },
      },
    ]);
  });

  it("routes the promoted OI selected bundle through the production recommendation path", () => {
    const query: SetupQuery = {
      cycle: 5,
      board: createBoard(),
      hold: "I",
      active: "O",
      next: ["I", "Z", "L", "J", "O"],
      holdAvailable: true,
    };
    const scope: SelectedRecommendationScope = {
      mode: "selected-bundles",
      bundles: [{
        bundleId: "promoted:oi",
        kind: "cycle5-advanced",
        cycle: 5,
        catalog: rawPromotedOiSetups as unknown as SetupVariant[],
        policy: rawPromotedOiPolicy as unknown as Cycle5AdvancedPolicyBundle,
      }],
    };

    expect(querySetups(query, scope)).toMatchObject([{
      setup: { id: "cycle5-advanced-oi-029-f000" },
      recommendationSource: { bundleId: "promoted:oi" },
      policy: { ruleId: "oi5-advanced-oqb-ilz-jo" },
    }]);
  });
});
