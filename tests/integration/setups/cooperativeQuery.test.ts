import { describe, expect, it } from "vitest";
import { createBoard } from "../../../src/engine/board";
import { querySetupsStagedCooperative, type StagedRecommendationResult } from "../../../src/setups/cooperativeQuery";
import { queryCatalog, querySetups, type SetupQuery } from "../../../src/setups/query";
import { matchingCycle5AdvancedEntries, type Cycle5AdvancedPolicyBundle } from "../../../src/setups/cycle5AdvancedPolicy";
import type { SelectedRecommendationScope } from "../../../src/setups/recommendationScope";
import rawCycle5AdvancedOiPolicy from "../../../setups/QB/cycle-5-advanced-oi-policy.json";
import rawCycle5AdvancedOiSetups from "../../../setups/QB/cycle-5-advanced-oi-setups.json";
import type { SetupVariant } from "../../../src/setups/schema";
import {
  promotedCycle5AdvancedBundleForPair,
  promotedCycle5AdvancedSources,
} from "../../../src/setups/cycle5AdvancedCatalog";

const QUERIES: SetupQuery[] = [
  { cycle: 1, board: createBoard(), hold: null, active: "I", next: ["Z", "S", "O", "L", "J"], holdAvailable: true },
  { cycle: 2, board: createBoard(), hold: "I", active: "L", next: ["O", "T", "S", "Z", "J"], holdAvailable: true },
  { cycle: 3, board: createBoard(), hold: "T", active: "L", next: ["T", "I", "J", "S", "Z"], holdAvailable: true },
  { cycle: 4, board: createBoard(), hold: "J", active: "O", next: ["S", "T", "Z", "I", "L"], holdAvailable: true },
  { cycle: 5, board: createBoard(), hold: "T", active: "O", next: ["I", "L", "J", "S", "Z"], holdAvailable: true },
  { cycle: 6, board: createBoard(), hold: "T", active: "O", next: ["L", "J", "S", "Z", "I"], holdAvailable: true },
  { cycle: 7, board: createBoard(), hold: "T", active: "O", next: ["L", "S", "I", "J", "Z"], holdAvailable: true },
];

describe("staged cooperative recommendation orchestration", () => {
  it.each(QUERIES.map((query) => [query.cycle, query] as const))(
    "matches the synchronous final result for Cycle %s",
    async (_cycle, query) => {
      const stages: StagedRecommendationResult[] = [];
      await querySetupsStagedCooperative(query, { onNode() {} }, (stage) => stages.push(stage));
      const final = stages.at(-1);
      expect(final?.complete).toBe(true);
      expect(final?.candidates).toEqual(querySetups(query));
      expect(stages.map(({ stage, complete }) => [stage, complete])).toEqual(
        query.cycle === 2 || query.cycle === 7
          ? [["primary", false], ["secondary", true]]
          : [["primary", true]],
      );
    },
  );

  it("keeps the Cycle 2 priority-100 choice separate from candidate section ordering", async () => {
    const query: SetupQuery = {
      cycle: 2,
      board: createBoard(),
      hold: "O",
      active: "I",
      next: ["S", "Z", "T", "L", "J"],
      holdAvailable: true,
    };
    const stages: StagedRecommendationResult[] = [];
    await querySetupsStagedCooperative(query, { onNode() {} }, (stage) => stages.push(stage));
    const primary = stages[0];
    const preferred = primary?.candidates.find(({ setup }) => setup.id === primary.preferredCandidateId);
    if (primary?.candidates.some(({ setup }) => setup.priority === 100)) expect(preferred?.setup.priority).toBe(100);
  });

  it("merges multiple selected bundles without consulting unselected production sources", () => {
    const query: SetupQuery = {
      cycle: 5,
      board: createBoard(),
      hold: "L",
      active: "J",
      next: ["I", "S", "Z", "T", "O"],
      holdAvailable: true,
    };
    const fixtures = querySetups({ ...query, maxCandidates: 8 })
      .filter(({ setup }) => !setup.id.includes("--mirror") && !setup.id.includes("--box-"))
      .slice(0, 2)
      .map(({ setup }) => setup);
    expect(fixtures).toHaveLength(2);
    const scope: SelectedRecommendationScope = {
      mode: "selected-bundles",
      bundles: fixtures.map((setup, index) => ({
        bundleId: `selected-${index}`,
        kind: "structured" as const,
        cycle: 5 as const,
        catalog: [setup],
      })),
    };
    const candidates = querySetups(query, scope);
    expect(new Set(candidates.map(({ setup }) => setup.id))).toEqual(
      new Set(fixtures.map(({ id }) => id)),
    );
    expect(new Set(candidates.map(({ recommendationSource }) => recommendationSource?.bundleId)))
      .toEqual(new Set(["selected-0", "selected-1"]));
  });

  it("allows the promoted OI ISZTO policy to BFS only its exact 1P OQB precondition", async () => {
    const query: SetupQuery = {
      cycle: 5,
      board: createBoard(),
      hold: "I",
      active: "O",
      next: ["I", "S", "Z", "T", "O"],
      holdAvailable: true,
    };
    const scope: SelectedRecommendationScope = {
      mode: "selected-bundles",
      bundles: [{
        bundleId: "promoted-cycle5-advanced-oi",
        kind: "cycle5-advanced",
        cycle: 5,
        catalog: rawCycle5AdvancedOiSetups as unknown as SetupVariant[],
        policy: rawCycle5AdvancedOiPolicy as unknown as Cycle5AdvancedPolicyBundle,
      }],
    };
    const precondition = (rawCycle5AdvancedOiSetups as unknown as SetupVariant[])
      .find(({ id }) => id === "cycle5-advanced-oi-008-f000")!;
    expect(matchingCycle5AdvancedEntries(
      rawCycle5AdvancedOiPolicy as unknown as Cycle5AdvancedPolicyBundle,
      { hold: "I", active: "O", next: ["I", "S", "Z", "T", "O"] },
    ).map(({ entry }) => entry.id)).toContain("oi5-advanced-oqb-isz-to");
    expect(queryCatalog([precondition], query)).toHaveLength(1);
    const candidates = querySetups(query, scope);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      setup: {
        id: "cycle5-advanced-oi-008-f000",
        placements: [{ piece: "O" }],
      },
      qbCondition: "oi5-advanced-oqb-isz-to",
      recommendationSource: {
        bundleId: "promoted-cycle5-advanced-oi",
        kind: "cycle5-advanced",
      },
      policy: {
        ruleId: "oi5-advanced-oqb-isz-to",
        branchId: "precondition",
      },
    });
    const stages: StagedRecommendationResult[] = [];
    await querySetupsStagedCooperative(
      query,
      { onNode() {} },
      (stage) => stages.push(stage),
      scope,
    );
    expect(stages.at(-1)?.candidates).toEqual(candidates);
  });

  it("routes every active promoted Cycle 5 advanced class through the manifest-aware production source", async () => {
    expect(promotedCycle5AdvancedSources().map(({ classId }) => classId).sort())
      .toEqual(["ilij", "isiz", "lj", "oi", "oloj", "ti", "tltj", "to", "tstz"]);
    expect(promotedCycle5AdvancedBundleForPair(["T", "L"])).toMatchObject({ runtimeMirror: false });
    expect(promotedCycle5AdvancedBundleForPair(["J", "T"])).toMatchObject({ runtimeMirror: true });
    expect(promotedCycle5AdvancedBundleForPair(["L", "J"])).toMatchObject({ runtimeMirror: false });
    expect(promotedCycle5AdvancedBundleForPair(["O", "L"])).toMatchObject({ runtimeMirror: false });
    expect(promotedCycle5AdvancedBundleForPair(["O", "J"])).toMatchObject({ runtimeMirror: true });

    const query: SetupQuery = {
      cycle: 5,
      board: createBoard(),
      hold: "I",
      active: "O",
      next: ["I", "S", "Z", "T", "O"],
      holdAvailable: true,
    };
    const candidates = querySetups(query);
    expect(candidates.some(({ qbCondition }) => qbCondition === undefined)).toBe(true);
    expect(candidates.find(({ setup }) => setup.id === "cycle5-advanced-oi-008-f000")).toMatchObject({
      setup: { id: "cycle5-advanced-oi-008-f000" },
      qbCondition: "oi5-advanced-oqb-isz-to",
      recommendationSource: {
        bundleId: "promoted:cycle5-advanced-oi",
        kind: "cycle5-advanced",
      },
    });
    const stages: StagedRecommendationResult[] = [];
    await querySetupsStagedCooperative(query, { onNode() {} }, (stage) => stages.push(stage));
    expect(stages.at(-1)?.candidates).toEqual(candidates);
  });

});
