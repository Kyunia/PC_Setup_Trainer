import rawManifest from "../../setups/catalog-manifest.json";
import rawPolicy from "../../setups/QB/cycle-2-advanced-qb-policy.json";
import rawSetups from "../../setups/QB/cycle-2-advanced-qb-setups.json";
import type { Cycle2AdvancedQbPolicy } from "./cycle2AdvancedQb";
import type { SetupVariant } from "./schema";

interface Cycle2QbManifest {
  cycles?: Record<string, {
    qb?: {
      runtimeEnabled?: boolean;
      queueSurveyPerformed?: boolean;
      validationStatus?: string;
      saveTargetsNormalized?: boolean;
    };
  }>;
}

export interface Cycle2AdvancedQbRuntimeBundle {
  setups: SetupVariant[];
  policy: Cycle2AdvancedQbPolicy;
}

const manifest = rawManifest as Cycle2QbManifest;
const setups = rawSetups as unknown as SetupVariant[];
const policy = rawPolicy as unknown as Cycle2AdvancedQbPolicy;
const saveTargetsRuntimeCompatible = policy.entries.every((entry) =>
  entry.saveTargets.length > 0
  && entry.saveTargets.every((piece) => ["I", "J", "L", "O", "S", "T", "Z"].includes(piece))
  && entry.saveTargetMode === (entry.saveTargets.length === 1 ? "fixed" : "solution-dependent"));

/**
 * The reviewed files may exist under setups/QB while promotion is still gated.
 * Flipping the manifest/data runtime flags after review activates this loader
 * without copying draft querieddata into the normal cycle-2 catalog.
 */
export function cycle2AdvancedQbRuntimeBundle(): Cycle2AdvancedQbRuntimeBundle | null {
  const qb = manifest.cycles?.["2"]?.qb;
  if (qb?.runtimeEnabled !== true || qb.queueSurveyPerformed !== true) return null;
  if (qb.saveTargetsNormalized !== true || !saveTargetsRuntimeCompatible) return null;
  if (policy.reviewStatus !== "reviewed" || policy.qbSemantics?.oqbExcluded !== true) return null;
  return { setups, policy };
}
