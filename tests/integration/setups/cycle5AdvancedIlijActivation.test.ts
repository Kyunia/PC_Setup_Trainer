import { describe, expect, it } from "vitest";
import { createBoard } from "../../../src/engine/board";
import rawPolicy from "../../../setups/QB/cycle-5-advanced-ilij-policy.json";
import {
  observeCycle5AdvancedOqb,
  type Cycle5AdvancedOqbPlan,
} from "../../../src/setups/cycle5AdvancedPolicy";
import { promotedCycle5AdvancedBundleForPair } from "../../../src/setups/cycle5AdvancedCatalog";
import { querySetups, type SetupQuery } from "../../../src/setups/query";
import { normalizeSelectedCycle5AdvancedPolicy } from "../../../src/setups/selectedCycle5AdvancedPolicyAdapter";

const base = {
  cycle: 5 as const,
  board: createBoard(),
  hold: "I" as const,
  active: "L" as const,
  holdAvailable: true,
};

function query(next: SetupQuery["next"]) {
  return querySetups({ ...base, next, maxCandidates: 8 });
}

const policy = normalizeSelectedCycle5AdvancedPolicy(rawPolicy, "promoted:cycle5-advanced-ilij");

function plan(id: string): Cycle5AdvancedOqbPlan {
  const entry = policy.entries.find((candidate) => candidate.id === id);
  if (entry?.kind !== "oqb") throw new Error(`Missing OQB plan ${id}`);
  return entry;
}

describe("active Cycle 5 advanced IL/IJ recommendations", () => {
  it("routes IL and mirrored IJ pairs to the active promoted bundle", () => {
    expect(promotedCycle5AdvancedBundleForPair(["I", "L"])).toMatchObject({
      bundleId: "promoted:cycle5-advanced-ilij",
      runtimeMirror: false,
    });
    expect(promotedCycle5AdvancedBundleForPair(["I", "J"])).toMatchObject({
      bundleId: "promoted:cycle5-advanced-ilij",
      runtimeMirror: true,
    });
  });

  it.each([
    {
      label: "IL-[TOS]!",
      next: ["T", "O", "S", "J", "Z"] as SetupQuery["next"],
      setupId: "cycle5-advanced-ilij-002-f000",
      ruleId: "ilij5-advanced--002",
    },
    {
      label: "[TOI]![LX]!",
      next: ["T", "O", "I", "L", "J"] as SetupQuery["next"],
      setupId: "cycle5-advanced-ilij-006-f000",
      ruleId: "ilij5-advanced-toi-002",
    },
    {
      label: "TJS S-before-J fallback",
      next: ["T", "S", "J", "L", "I"] as SetupQuery["next"],
      setupId: "cycle5-advanced-ilij-030-f000",
      ruleId: "ilij5-advanced-tjs-003",
    },
  ])("recommends the QB geometry for $label", ({ next, setupId, ruleId }) => {
    expect(query(next).find(({ setup }) => setup.id === setupId)).toMatchObject({
      setup: { id: setupId },
      policy: { ruleId },
      recommendationSource: { bundleId: "promoted:cycle5-advanced-ilij" },
    });
  });

  it("shows the exact matched condition instead of the internal setup ID name", () => {
    expect(query(["O", "I", "Z", "T", "S"])
      .find(({ setup }) => setup.id === "cycle5-advanced-ilij-004-f000"))
      .toMatchObject({ recommendationLabel: "IL - [OIZ]! QB" });
  });

  it("uses the matched OQB initial pattern as the OQB name", () => {
    expect(query(["Z", "T", "I", "O", "L"])
      .find(({ policy: candidatePolicy }) =>
        candidatePolicy?.ruleId === "ilij5-advanced-oqb-tiz-olj"))
      .toMatchObject({ recommendationLabel: "IL - Z[TI]![OL]! OQB" });
  });

  it.each([
    {
      label: "[TOJ]![LS]! then reveal I",
      next: ["T", "O", "J", "L", "S"] as SetupQuery["next"],
      planId: "ilij5-advanced-oqb-toj-ls",
      preconditionId: "cycle5-advanced-ilij-016-f000",
      reveal: "I" as const,
      continuationId: "cycle5-advanced-ilij-017-f000",
    },
    {
      label: "IZLTO then reveal S",
      next: ["I", "Z", "L", "T", "O"] as SetupQuery["next"],
      planId: "ilij5-advanced-oqb-ilz-izlto",
      preconditionId: "cycle5-advanced-ilij-025-f000",
      reveal: "S" as const,
      continuationId: "cycle5-advanced-ilij-027-f000",
    },
    {
      label: "[TLJ]!SI then reveal Z",
      next: ["T", "L", "J", "S", "I"] as SetupQuery["next"],
      planId: "ilij5-advanced-oqb-tlj-si",
      preconditionId: "cycle5-advanced-ilij-081-f000",
      reveal: "Z" as const,
      continuationId: "cycle5-advanced-ilij-083-f000",
    },
  ])("selects the OQB precondition and branch for $label", ({
    next,
    planId,
    preconditionId,
    reveal,
    continuationId,
  }) => {
    expect(query(next).find(({ setup }) => setup.id === preconditionId)).toMatchObject({
      setup: { id: preconditionId },
      policy: { ruleId: planId, branchId: "precondition" },
      recommendationSource: { bundleId: "promoted:cycle5-advanced-ilij" },
    });
    expect(observeCycle5AdvancedOqb(plan(planId), {
      hold: "I",
      active: "L",
      next: ["T", "O", "J", "S", reveal],
    })).toMatchObject({
      status: "matched",
      observation: { piece: reveal, source: "reveal", uiSlot: "NEXT[4]" },
      decision: {
        planId,
        continuationSetupRefs: [{ setupId: continuationId, transform: "identity" }],
      },
    });
  });
});
