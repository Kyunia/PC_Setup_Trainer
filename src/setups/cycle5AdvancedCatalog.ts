import rawClassIndex from "../../setups/cycle-5-class-index.json";
import rawManifest from "../../setups/catalog-manifest.json";
import rawOiPolicy from "../../setups/QB/cycle-5-advanced-oi-policy.json";
import rawOiSetups from "../../setups/QB/cycle-5-advanced-oi-setups.json";
import rawTiPolicy from "../../setups/QB/cycle-5-advanced-ti-policy.json";
import rawTiSetups from "../../setups/QB/cycle-5-advanced-ti-setups.json";
import rawTltjPolicy from "../../setups/QB/cycle-5-advanced-tltj-policy.json";
import rawTltjSetups from "../../setups/QB/cycle-5-advanced-tltj-setups.json";
import rawToPolicy from "../../setups/QB/cycle-5-advanced-to-policy.json";
import rawToSetups from "../../setups/QB/cycle-5-advanced-to-setups.json";
import rawTstzPolicy from "../../setups/QB/cycle-5-advanced-tstz-policy.json";
import rawTstzSetups from "../../setups/QB/cycle-5-advanced-tstz-setups.json";
import type { Piece } from "../engine/types";
import { cycle5PiecePairKey } from "./cycle5Context";
import type { Cycle5AdvancedOqbPolicySource } from "./oqbProgress";
import type { SelectedRecommendationBundle } from "./recommendationScope";
import { normalizeSelectedCycle5AdvancedPolicy } from "./selectedCycle5AdvancedPolicyAdapter";
import type { SetupVariant } from "./schema";

interface AdvancedActivation {
  runtimeEnabled: boolean;
  conditionCompilerReady: boolean;
}

interface ClassDescriptor {
  firstBagPieces: [Piece, Piece];
  sourceFileClass: string;
  sourceDirection: "source-basis" | "horizontal-runtime-mirror";
}

interface AdvancedDefinition extends Cycle5AdvancedOqbPolicySource {
  classId: string;
  reviewStatus?: string;
  policyExecutable: boolean;
}

const manifest = rawManifest as unknown as {
  cycles: {
    "5": {
      advanced: AdvancedActivation & { classFiles: Record<string, AdvancedActivation> };
    };
  };
};
const classIndex = rawClassIndex as unknown as { classes: Record<string, ClassDescriptor> };

function definition(
  classId: string,
  rawPolicy: unknown,
  catalog: SetupVariant[],
): AdvancedDefinition {
  const sourceId = `promoted:cycle5-advanced-${classId}`;
  const root = rawPolicy as {
    reviewStatus?: string;
    runtimePolicy?: { executable?: boolean };
  };
  return {
    classId,
    sourceId,
    bundle: normalizeSelectedCycle5AdvancedPolicy(rawPolicy, sourceId),
    catalog,
    reviewStatus: root.reviewStatus,
    policyExecutable: root.runtimePolicy?.executable === true,
  };
}

const definitions: Record<string, AdvancedDefinition> = {
  oi: definition("oi", rawOiPolicy, rawOiSetups as SetupVariant[]),
  tltj: definition("tltj", rawTltjPolicy, rawTltjSetups as SetupVariant[]),
  ti: definition("ti", rawTiPolicy, rawTiSetups as SetupVariant[]),
  to: definition("to", rawToPolicy, rawToSetups as SetupVariant[]),
  tstz: definition("tstz", rawTstzPolicy, rawTstzSetups as SetupVariant[]),
};

function activeDefinition(classId: string): AdvancedDefinition | null {
  const advanced = manifest.cycles["5"].advanced;
  const activation = advanced.classFiles[classId];
  const definition = definitions[classId];
  return advanced.runtimeEnabled
    && advanced.conditionCompilerReady
    && activation?.runtimeEnabled
    && activation.conditionCompilerReady
    && definition?.reviewStatus === "reviewed"
    && definition.policyExecutable
    ? definition
    : null;
}

export function promotedCycle5AdvancedSources(): AdvancedDefinition[] {
  return Object.keys(definitions).flatMap((classId) => {
    const definition = activeDefinition(classId);
    return definition ? [definition] : [];
  });
}

/** Manifest-aware production source selected from the unordered HOLD+ACTIVE pair. */
export function promotedCycle5AdvancedBundleForPair(
  classPieces: readonly Piece[],
): Extract<SelectedRecommendationBundle, { kind: "cycle5-advanced" }> | null {
  const pair = cycle5PiecePairKey(classPieces);
  const descriptor = Object.values(classIndex.classes).find((candidate) =>
    cycle5PiecePairKey(candidate.firstBagPieces) === pair);
  if (!descriptor) return null;
  const definition = activeDefinition(descriptor.sourceFileClass);
  if (!definition) return null;
  return {
    bundleId: definition.sourceId!,
    kind: "cycle5-advanced",
    cycle: 5,
    catalog: [...definition.catalog],
    policy: definition.bundle,
    runtimeMirror: descriptor.sourceDirection === "horizontal-runtime-mirror",
    productionGated: true,
  };
}
