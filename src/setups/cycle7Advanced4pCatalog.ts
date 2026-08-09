import rawManifest from "../../setups/catalog-manifest.json";
import rawCatalog from "../../setups/cycle-7-4p-setups.json";
import rawPolicy from "../../setups/cycle-7-4p-policy.json";
import type { Piece } from "../engine/types";
import { expandMirroredSetups, mirrorPiece } from "./mirror";
import { applyStructuredPolicyMetrics, type StructuredSetupPolicy } from "./policy";
import { expandBoxSetups } from "./rotation";
import type { SetupVariant } from "./schema";

export interface Cycle7Advanced4pEntry {
  setupId: string;
  previousBagPieces: Piece[];
  fourthPieceFromNextBag: Piece;
  nextBagSourcePosition: number;
  requiredHeldPieceAfterBuild: Piece | null;
  branch: string | null;
}

interface Cycle7Advanced4pConditionalVariant {
  family: string;
  requiresOqb: boolean;
  branches: Array<{ setupId: string }>;
}

interface Cycle7Advanced4pPolicy extends StructuredSetupPolicy {
  reviewStatus?: string;
  runtimePolicy: {
    catalogKind: "advanced-4p";
    integrationState: "active" | "inactive";
    classSelector: { kind: "previous-bag-three"; pieceCount: 3 };
    buildWindow: {
      setupBuildSegments: [3, 1];
      fourthPieceRole: "next-bag-first-placeable-piece";
    };
    mirrorExpansion: "runtime-horizontal-reflection";
    entries: Cycle7Advanced4pEntry[];
    goodCycle8: {
      observation: "eleventh-piece";
      entryRates: Array<{ setupId: string; percent: number }>;
    };
    conditionalVariants: Cycle7Advanced4pConditionalVariant[];
    fallbackClasses: Array<{ classes: string[]; fallback: "normal-3p-or-qb" }>;
  };
}

interface Cycle7Advanced4pManifest {
  cycles?: Record<string, {
    advanced4p?: {
      runtimeEnabled?: boolean;
      setupCount?: number;
    };
  }>;
}

export interface Cycle7Advanced4pRuntimeBundle {
  setups: SetupVariant[];
  policy: Cycle7Advanced4pPolicy;
}

export interface Cycle7Advanced4pMatch {
  setup: SetupVariant;
  entry: Cycle7Advanced4pEntry;
  placeableNextCount: number;
  savedPieceAfterBuild: Piece | null;
}

const manifest = rawManifest as Cycle7Advanced4pManifest;
const sourceCatalog = rawCatalog as unknown as SetupVariant[];
const policy = rawPolicy as unknown as Cycle7Advanced4pPolicy;
const policyAppliedCatalog = applyStructuredPolicyMetrics(sourceCatalog, policy);
const runtimeCatalog = expandBoxSetups(expandMirroredSetups(policyAppliedCatalog));
const sourceEntriesById = new Map(policy.runtimePolicy.entries.map((entry) => [entry.setupId, entry]));
const goodCycle8Rates = new Map(
  policy.runtimePolicy.goodCycle8.entryRates.map(({ setupId, percent }) => [setupId, percent]),
);
const conditionalSetupIds = new Set(policy.runtimePolicy.conditionalVariants
  .filter(({ requiresOqb }) => requiresOqb)
  .flatMap(({ branches }) => branches.map(({ setupId }) => setupId)));

function canonicalSourceId(setup: SetupVariant): string {
  return setup.id.split("--box-")[0].replace(/--mirror$/, "");
}

function isMirroredRuntimeVariant(setup: SetupVariant): boolean {
  return setup.id.split("--box-")[0].endsWith("--mirror");
}

function sortedSignature(pieces: Piece[]): string {
  return [...pieces].sort().join("");
}

function hasExactCoverage(ids: string[], expectedIds: string[]): boolean {
  return ids.length === expectedIds.length
    && new Set(ids).size === ids.length
    && ids.every((id) => expectedIds.includes(id));
}

export function cycle7Advanced4pRuntimeReady(
  advanced4p: { runtimeEnabled?: boolean; setupCount?: number } | undefined,
  setups: Array<{ id: string; reviewStatus?: string; runtimeEligible?: boolean }>,
  candidatePolicy: {
    reviewStatus?: string;
    metrics?: Array<{ setupId: string }>;
    runtimePolicy?: {
      catalogKind?: string;
      integrationState?: string;
      entries?: Array<{ setupId: string }>;
      goodCycle8?: { entryRates?: Array<{ setupId: string }> };
    };
  },
): boolean {
  const setupIds = setups.map(({ id }) => id);
  const expectedCount = advanced4p?.setupCount;
  return advanced4p?.runtimeEnabled === true
    && expectedCount === setups.length
    && setups.length > 0
    && new Set(setupIds).size === setups.length
    && setups.every(({ reviewStatus, runtimeEligible }) => reviewStatus === "reviewed" && runtimeEligible === true)
    && candidatePolicy.reviewStatus === "reviewed"
    && candidatePolicy.runtimePolicy?.catalogKind === "advanced-4p"
    && candidatePolicy.runtimePolicy.integrationState === "active"
    && hasExactCoverage(candidatePolicy.metrics?.map(({ setupId }) => setupId) ?? [], setupIds)
    && hasExactCoverage(candidatePolicy.runtimePolicy.entries?.map(({ setupId }) => setupId) ?? [], setupIds)
    && hasExactCoverage(candidatePolicy.runtimePolicy.goodCycle8?.entryRates?.map(({ setupId }) => setupId) ?? [], setupIds);
}

export function cycle7Advanced4pRuntimeBundle(): Cycle7Advanced4pRuntimeBundle | null {
  const advanced4p = manifest.cycles?.["7"]?.advanced4p;
  return cycle7Advanced4pRuntimeReady(advanced4p, sourceCatalog, policy)
    ? { setups: runtimeCatalog, policy }
    : null;
}

export function cycle7Advanced4pEntryForSetup(setup: SetupVariant): Cycle7Advanced4pEntry | undefined {
  const sourceEntry = sourceEntriesById.get(canonicalSourceId(setup));
  if (!sourceEntry) return undefined;
  if (!isMirroredRuntimeVariant(setup)) return sourceEntry;
  return {
    ...sourceEntry,
    previousBagPieces: sourceEntry.previousBagPieces.map(mirrorPiece),
    fourthPieceFromNextBag: mirrorPiece(sourceEntry.fourthPieceFromNextBag),
    requiredHeldPieceAfterBuild: sourceEntry.requiredHeldPieceAfterBuild === null
      ? null
      : mirrorPiece(sourceEntry.requiredHeldPieceAfterBuild),
  };
}

export function cycle7Advanced4pGoodCycle8Rate(setup: SetupVariant): number | undefined {
  return goodCycle8Rates.get(canonicalSourceId(setup));
}

function isFallbackClass(buildPieces: Piece[]): boolean {
  const signature = sortedSignature(buildPieces);
  return policy.runtimePolicy.fallbackClasses.some(({ classes }) =>
    classes.some((classId) => sortedSignature([...classId] as Piece[]) === signature));
}

/**
 * Select only initial, directly buildable advanced 4P records.
 *
 * OIS-I is deliberately absent here: its policy requires the separate IS 2P OQB
 * precondition and a later T/Z observation. Treating either final geometry as an
 * initial setup would repeat the old QB flattening bug.
 */
export function cycle7Advanced4pMatches(
  buildPieces: Piece[],
  searchNext: Piece[],
  basePlaceableNextCount: number,
  bundle: Cycle7Advanced4pRuntimeBundle,
): Cycle7Advanced4pMatch[] {
  if (buildPieces.length !== 3 || isFallbackClass(buildPieces)) return [];
  const previousSignature = sortedSignature(buildPieces);

  return bundle.setups.flatMap((setup) => {
    const sourceId = canonicalSourceId(setup);
    if (conditionalSetupIds.has(sourceId)) return [];
    const entry = cycle7Advanced4pEntryForSetup(setup);
    if (!entry || sortedSignature(entry.previousBagPieces) !== previousSignature) return [];

    // The source position counts placeable setup pieces. Runtime may either use
    // the following bag's first piece directly or HOLD it and use NEXT[1].
    // OIL-TJ narrows the latter path by requiring the saved piece to be T.
    if (entry.nextBagSourcePosition !== 0) return [];
    const nextBagFirst = searchNext[basePlaceableNextCount];
    const nextBagSecond = searchNext[basePlaceableNextCount + 1];
    const usesFirst = entry.requiredHeldPieceAfterBuild === null
      && nextBagFirst === entry.fourthPieceFromNextBag;
    const usesSecond = nextBagSecond === entry.fourthPieceFromNextBag
      && (entry.requiredHeldPieceAfterBuild === null
        || nextBagFirst === entry.requiredHeldPieceAfterBuild);
    if (!usesFirst && !usesSecond) return [];
    const savedPieceAfterBuild = usesFirst ? null : nextBagFirst ?? null;
    const fourthIndex = usesFirst ? basePlaceableNextCount : basePlaceableNextCount + 1;

    const expectedGeometrySignature = sortedSignature([
      ...entry.previousBagPieces,
      entry.fourthPieceFromNextBag,
    ]);
    if (sortedSignature(setup.pieceSignature) !== expectedGeometrySignature) return [];
    return [{
      setup,
      entry,
      placeableNextCount: fourthIndex + 1,
      savedPieceAfterBuild,
    }];
  });
}
