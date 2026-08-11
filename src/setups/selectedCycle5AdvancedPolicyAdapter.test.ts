import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import rawDraftPolicy from "../../setups/querieddata/QB/cycle-5-advanced-oi-qb-oqb-policy.json";
import rawDraftTiPolicy from "../../setups/querieddata/QB/cycle-5-advanced-ti-qb-oqb-policy.json";
import rawDraftTltjPolicy from "../../setups/querieddata/QB/cycle-5-advanced-tltj-qb-oqb-policy.json";
import rawDraftToPolicy from "../../setups/querieddata/QB/cycle-5-advanced-to-qb-oqb-policy.json";
import rawDraftTstzPolicy from "../../setups/querieddata/QB/cycle-5-advanced-tstz-qb-oqb-policy.json";
import rawDraftSetups from "../../setups/querieddata/QB/cycle-5-advanced-oi-qb-oqb-setups.json";
import rawPromotedPolicy from "../../setups/QB/cycle-5-advanced-oi-policy.json";
import rawPromotedTiPolicy from "../../setups/QB/cycle-5-advanced-ti-policy.json";
import rawPromotedTltjPolicy from "../../setups/QB/cycle-5-advanced-tltj-policy.json";
import rawPromotedToPolicy from "../../setups/QB/cycle-5-advanced-to-policy.json";
import rawPromotedTstzPolicy from "../../setups/QB/cycle-5-advanced-tstz-policy.json";
import rawPromotedSetups from "../../setups/QB/cycle-5-advanced-oi-setups.json";
import { matchingCycle5AdvancedEntries, type Cycle5AdvancedPolicyBundle } from "./cycle5AdvancedPolicy";
import { querySetups, type SetupQuery } from "./query";
import type { SelectedRecommendationScope } from "./recommendationScope";
import {
  normalizeSelectedCycle5AdvancedPolicy,
  SelectedCycle5AdvancedPolicyError,
} from "./selectedCycle5AdvancedPolicyAdapter";
import type { SetupVariant } from "./schema";

function draftCatalog(): SetupVariant[] {
  const records = (rawDraftSetups as unknown as { records: SetupVariant[] }).records;
  return records.map((setup) => ({
    ...setup,
    family: setup.family ?? setup.id,
    displayName: setup.displayName ?? (setup as SetupVariant & { name?: string }).name ?? setup.id,
    difficulty: setup.difficulty ?? 3,
    reviewStatus: setup.reviewStatus ?? "draft",
  }));
}

describe("selected Cycle 5 advanced policy adapter", () => {
  it("accepts every reviewed Cycle 5 advanced draft policy schema", () => {
    for (const [sourceId, draftPolicy, promotedPolicy] of [
      ["oi", rawDraftPolicy, rawPromotedPolicy],
      ["tltj", rawDraftTltjPolicy, rawPromotedTltjPolicy],
      ["ti", rawDraftTiPolicy, rawPromotedTiPolicy],
      ["to", rawDraftToPolicy, rawPromotedToPolicy],
      ["tstz", rawDraftTstzPolicy, rawPromotedTstzPolicy],
    ] as const) {
      const draft = normalizeSelectedCycle5AdvancedPolicy(draftPolicy, `draft:${sourceId}`);
      const promoted = normalizeSelectedCycle5AdvancedPolicy(promotedPolicy, `promoted:${sourceId}`);
      expect(draft.entries.map(({ id, kind }) => [id, kind]))
        .toEqual(promoted.entries.map(({ id, kind }) => [id, kind]));
    }
  });

  it("normalizes the real OI draft into the same executable direct/OQB entry identities", () => {
    const draft = normalizeSelectedCycle5AdvancedPolicy(rawDraftPolicy, "draft:oi");
    const promoted = normalizeSelectedCycle5AdvancedPolicy(rawPromotedPolicy, "promoted:oi");
    expect(draft.entries).toHaveLength(86);
    expect(promoted.entries).toHaveLength(86);
    expect(draft.entries.map(({ id, kind }) => [id, kind]))
      .toEqual(promoted.entries.map(({ id, kind }) => [id, kind]));
    const state = { hold: "I" as const, active: "O" as const, next: ["I", "S", "Z", "T", "O"] as const };
    expect(matchingCycle5AdvancedEntries(draft, { ...state, next: [...state.next] }).map(({ entry }) => entry.id))
      .toEqual(matchingCycle5AdvancedEntries(promoted, { ...state, next: [...state.next] }).map(({ entry }) => entry.id));
  });

  it("evaluates a draft and promoted bundle independently without a Worker-style TypeError", () => {
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
      bundles: [
        {
          bundleId: "promoted:oi",
          kind: "cycle5-advanced",
          cycle: 5,
          catalog: rawPromotedSetups as unknown as SetupVariant[],
          policy: rawPromotedPolicy as unknown as Cycle5AdvancedPolicyBundle,
        },
        {
          bundleId: "draft:oi",
          kind: "cycle5-advanced",
          cycle: 5,
          catalog: draftCatalog(),
          // Deliberately mirrors setup_test's unknown-policy handoff.
          policy: rawDraftPolicy as unknown as Cycle5AdvancedPolicyBundle,
        },
      ],
    };
    const candidates = querySetups(query, scope);
    expect(candidates.map(({ recommendationSource }) => recommendationSource?.bundleId))
      .toEqual(["draft:oi", "promoted:oi"]);
    expect(candidates.map(({ setup }) => setup.id)).toEqual([
      "geometry-cycle5-advanced-oi-035-f000",
      "cycle5-advanced-oi-008-f000",
    ]);
    expect(candidates.every(({ policy }) => policy?.ruleId === "oi5-advanced-oqb-isz-to")).toBe(true);
  });

  it("accepts the reported OI + IZLJO draft query without throwing", () => {
    const scope: SelectedRecommendationScope = {
      mode: "selected-bundles",
      bundles: [{
        bundleId: "draft:oi-izljo",
        kind: "cycle5-advanced",
        cycle: 5,
        catalog: draftCatalog(),
        policy: rawDraftPolicy as unknown as Cycle5AdvancedPolicyBundle,
      }],
    };
    const candidates = querySetups({
      cycle: 5,
      board: createBoard(),
      hold: "O",
      active: "I",
      next: ["I", "Z", "L", "J", "O"],
      holdAvailable: true,
    }, scope);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(({ recommendationSource }) =>
      recommendationSource?.bundleId === "draft:oi-izljo")).toBe(true);
  });

  it("fails closed with the selected source identity for malformed roots", () => {
    expect(() => normalizeSelectedCycle5AdvancedPolicy(
      { schemaVersion: 1, cycle: 5, classId: "oi", rules: [] },
      "draft:broken",
    )).toThrowError(new SelectedCycle5AdvancedPolicyError(
      "draft:broken",
      "expected promoted entries[] or draft rules/directRules[] together with oqbPlans[].",
    ));
    expect(() => normalizeSelectedCycle5AdvancedPolicy(
      { schemaVersion: 3, cycle: 5, classId: "oi" },
      "promoted:broken",
    )).toThrow(/promoted:broken.*entries\[\].*oqbPlans\[\]/);
  });

  it("preserves promoted nested checkpoints and fails closed on a branch without an outcome", () => {
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
    expect(plan.branches[0]?.postCheckpoint?.branches.every(({ id }) => id.length > 0)).toBe(true);

    const malformed = structuredClone(rawPromotedTiPolicy) as unknown as {
      entries: Array<{ id: string; branches?: Array<{ postCheckpoint?: { branches: unknown[] } }> }>;
    };
    const malformedPlan = malformed.entries.find(({ id }) => id === "ti5-toi-lj-slow-o")!;
    malformedPlan.branches![0]!.postCheckpoint!.branches[0] = { observedPieces: ["Z"] };
    expect(() => normalizeSelectedCycle5AdvancedPolicy(malformed, "promoted:ti-broken"))
      .toThrow(/promoted:ti-broken.*needs exactly one continuation outcome/);
  });
});
