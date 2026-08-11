import type { Cycle5AdvancedOqbPlan } from "./cycle5AdvancedPolicy";
import { promotedCycle5AdvancedSources } from "./cycle5AdvancedCatalog";
import type {
  Cycle5AdvancedOqbPolicySource,
  OqbProgressPolicyProvider,
} from "./oqbProgress";

function canonicalSetupId(id: string): string {
  return id.split("--box-")[0]!.replace(/--mirror$/, "");
}

/** Manifest-aware provider for operational/main-plan recommendations. */
export const promotedOqbProgressProvider: OqbProgressPolicyProvider = {
  cycle5AdvancedForSetup(setup, planId) {
    const setupId = canonicalSetupId(setup.policySourceId ?? setup.id);
    const matches = promotedCycle5AdvancedSources().filter(({ bundle }) => bundle.entries.some((entry): entry is Cycle5AdvancedOqbPlan =>
      entry.kind === "oqb"
        && (planId === undefined ? entry.preconditionSetupId === setupId : entry.id === planId)));
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      return { status: "unsupported", reason: "promoted-policy-source-ambiguous" };
    }
    const source = matches[0]!;
    return { status: "ready", source };
  },
};
