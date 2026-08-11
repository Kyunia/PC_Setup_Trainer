import {
  matchingCycle5AdvancedEntries,
  type Cycle5AdvancedOqbPlan,
  type Cycle5AdvancedPolicyBundle,
} from "../setups/cycle5AdvancedPolicy";
import {
  oqbContinuationCandidates,
  type Cycle5AdvancedOqbPolicySource,
  type OqbProgressResult,
} from "../setups/oqbProgress";
import type { SetupCandidate, SetupQuery } from "../setups/query";
import type { SetupVariant } from "../setups/schema";

function isCycle5AdvancedPolicy(value: unknown): value is Cycle5AdvancedPolicyBundle {
  if (!value || typeof value !== "object") return false;
  const record = value as { cycle?: unknown; entries?: unknown };
  return record.cycle === 5 && Array.isArray(record.entries);
}

function canonicalSetupId(setup: SetupVariant): string {
  return (setup.policySourceId ?? setup.id).split("--box-")[0]!.replace(/--mirror$/, "");
}

export function selectedCatalogOqbSource(
  policy: unknown,
  catalog: readonly SetupVariant[],
  sourceId: string,
): Cycle5AdvancedOqbPolicySource | undefined {
  return isCycle5AdvancedPolicy(policy) ? { bundle: policy, catalog, sourceId } : undefined;
}

/** Resolves a shared precondition to the one plan selected by the original 0P queue. */
export function selectedCatalogOqbPlanId(
  source: Cycle5AdvancedOqbPolicySource,
  candidate: SetupCandidate,
  initialQuery: SetupQuery,
): string | undefined {
  const policyRuleId = candidate.policy?.ruleId;
  if (policyRuleId && source.bundle.entries.some((entry) =>
    entry.kind === "oqb" && entry.id === policyRuleId)) return policyRuleId;

  const sourceSetupId = canonicalSetupId(candidate.setup);
  const state = {
    hold: initialQuery.hold ?? initialQuery.active,
    active: initialQuery.active,
    next: initialQuery.next,
  };
  const matchingPlans = matchingCycle5AdvancedEntries(source.bundle, state)
    .map(({ entry }) => entry)
    .filter((entry): entry is Cycle5AdvancedOqbPlan =>
      entry.kind === "oqb" && entry.preconditionSetupId === sourceSetupId);
  return matchingPlans.length === 1 ? matchingPlans[0]!.id : undefined;
}

export interface OqbPracticeFollowup {
  progress: Extract<OqbProgressResult, { status: "continuation" }>;
  candidates: SetupCandidate[];
}

/**
 * Once a branch is observed, its selected geometry remains authoritative for
 * later placements. Re-evaluating the smaller precondition against that board
 * would incorrectly treat valid continuation cells as outside geometry.
 */
export function updateOqbPracticeFollowup(
  current: OqbPracticeFollowup | null,
  latest: OqbProgressResult | undefined,
  lockedPieces: number,
): OqbPracticeFollowup | null {
  if (latest?.status === "continuation") {
    return { progress: latest, candidates: oqbContinuationCandidates(latest) };
  }
  return current && lockedPieces >= current.progress.progress.checkpointPlacements
    ? current
    : null;
}

export function oqbProgressObservationText(progress: OqbProgressResult): string | undefined {
  if (!("observation" in progress) || !progress.observation) return undefined;
  const observation = progress.observation;
  if (observation.kind === "piece") {
    return observation.source === "reveal" && observation.uiSlot
      ? `${observation.uiSlot} = ${observation.piece}`
      : `Hidden piece = ${observation.piece}`;
  }
  if (observation.kind === "relative-order") return `${observation.before} before ${observation.after}`;
  return `Visible tail = ${observation.pieces.join("")}`;
}

export function setupGuideForOqbProgress(
  initialCandidate: SetupCandidate,
  progress: OqbProgressResult,
  continuationSetup?: SetupVariant,
): SetupVariant | null {
  if (progress.status === "continuation") return continuationSetup ?? progress.continuations[0]?.setup ?? null;
  if (progress.status === "terminal") return null;
  if (progress.status === "precondition") return progress.remainingPrecondition ?? initialCandidate.setup;
  return initialCandidate.setup;
}
