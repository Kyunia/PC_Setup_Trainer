import type { Piece } from "../engine/types";
import { mirrorPiece, mirrorPieceNotationForDisplay, mirrorSetup, setupGeometryKey } from "./mirror";
import { expandEquivalentPlacementVariants } from "./placementVariants";
import { expandBoxSetups } from "./rotation";
import type { SetupVariant } from "./schema";

export interface Cycle2AdvancedQbPolicyEntry {
  id: string;
  setupId: string;
  sourcePool: string;
  mirrorPool?: string | null;
  conditionLabel: string;
  /** Canonical final-PC save targets. This is not the initial 3P build leftover. */
  saveTargets: Piece[];
  saveTargetMode: "fixed" | "solution-dependent";
  sourceOrder: number;
  setupBuildPieceCount: 3 | 4;
  runtimeEnabled?: boolean;
  runtimeCondition: {
    /** Authoritative normalized OR-list for the visible next-bag prefix. */
    includeNextBagPatterns: string[];
    /** Additional ordering predicate inside the visible next-bag prefix. */
    nextBagOrderBefore?: [Piece, Piece];
    /** Source-pool order condition used when two source geometries share one QB prefix. */
    buildOrderBefore?: [Piece, Piece];
    /** Do not synthesize another mirror when the page already supplies both directions. */
    automaticMirror?: boolean;
    /** Source-prose instruction shown with the recommendation. */
    guidance?: string;
  };
}

export interface Cycle2AdvancedQbPolicy {
  cycle: 2;
  reviewStatus: "draft" | "reviewed";
  qbSemantics?: { oqbExcluded?: boolean };
  entries: Cycle2AdvancedQbPolicyEntry[];
}

export interface Cycle2AdvancedQbClass {
  /** The source page's coordinate system. */
  sourcePool: string;
  /** The actual unordered HOLD + ACTIVE + NEXT 2 pool. */
  actualPool: string;
  /** Actual pool is the chiral mirror class of sourcePool. */
  mirroredClass: boolean;
  /** Mirroring does not change this four-piece pool. */
  selfMirroredClass: boolean;
}

export interface Cycle2AdvancedQbSelection {
  setup: SetupVariant;
  entry: Cycle2AdvancedQbPolicyEntry;
  classInfo: Cycle2AdvancedQbClass;
  /** Lower means that the visible next-bag condition is more specific. */
  conditionRank: number;
  /** Used only when no matching non-fallback condition is physically buildable. */
  fallbackCondition: boolean;
  mirroredGeometry: boolean;
}

export interface Cycle2AdvancedQbSelectionOptions {
  /** Review tests may inspect records before their per-entry runtime flag is promoted. */
  includeRuntimeDisabled?: boolean;
  /** Let the caller test buildability before discarding lower-ranked matching conditions. */
  deferRankSelectionUntilBuildable?: boolean;
}

/** Convert source-page save targets into the selected geometry's actual mirror direction. */
export function cycle2AdvancedQbSaveTargets(
  entry: Pick<Cycle2AdvancedQbPolicyEntry, "saveTargets">,
  mirroredGeometry: boolean,
): Piece[] {
  return [...new Set(entry.saveTargets.map((piece) =>
    mirroredGeometry ? mirrorPiece(piece) : piece))].sort();
}

/** Convert a source-page condition label into the selected geometry's direction. */
export function cycle2AdvancedQbConditionLabel(
  entry: Pick<Cycle2AdvancedQbPolicyEntry, "conditionLabel">,
  mirroredGeometry: boolean,
): string {
  return mirroredGeometry
    ? mirrorPieceNotationForDisplay(entry.conditionLabel)
    : entry.conditionLabel;
}

interface PatternResult {
  matches: boolean;
  rank: number;
  fallback: boolean;
  supported: boolean;
}

const PIECE_TOKEN = /^[IJLOSTZ]+$/;

function sortedPool(value: string | Piece[]): string {
  return [...value].sort().join("");
}

function poolPieces(value: string): Piece[] | null {
  if (value.length !== 4 || !PIECE_TOKEN.test(value) || new Set(value).size !== 4) return null;
  return [...value] as Piece[];
}

function mirrorPool(value: string): string {
  return sortedPool([...value].map((piece) => mirrorPiece(piece as Piece)));
}

function sourcePools(policy: Cycle2AdvancedQbPolicy): string[] {
  return [...new Set(policy.entries.map(({ sourcePool }) => sourcePool))];
}

/** Resolve one of the 35 distinct four-piece cycle-2 pools to its source page. */
export function cycle2AdvancedQbClass(
  policy: Cycle2AdvancedQbPolicy,
  buildPieces: Piece[],
): Cycle2AdvancedQbClass | null {
  if (buildPieces.length !== 4 || new Set(buildPieces).size !== 4) return null;
  const actualPool = sortedPool(buildPieces);
  for (const sourcePool of sourcePools(policy)) {
    if (!poolPieces(sourcePool)) continue;
    const sourceKey = sortedPool(sourcePool);
    const mirroredKey = mirrorPool(sourcePool);
    if (actualPool === sourceKey) {
      return {
        sourcePool,
        actualPool,
        mirroredClass: false,
        selfMirroredClass: mirroredKey === sourceKey,
      };
    }
    const declaredMirror = policy.entries.find((entry) => entry.sourcePool === sourcePool)?.mirrorPool;
    if (declaredMirror && actualPool === sortedPool(declaredMirror) && actualPool === mirroredKey) {
      return {
        sourcePool,
        actualPool,
        mirroredClass: true,
        selfMirroredClass: false,
      };
    }
  }
  return null;
}

function indexBefore(prefix: Piece[], left: Piece, right: Piece): boolean {
  const leftIndex = prefix.indexOf(left);
  const rightIndex = prefix.indexOf(right);
  return leftIndex >= 0 && rightIndex >= 0 && leftIndex < rightIndex;
}

function stripFormSuffix(label: string): string {
  return label
    .replace(/\s+(?:3p|4p)(?:\s+\d+)?$/i, "")
    .replace(/\s+\d+$/, "")
    .replace(/\s+alternate order$/i, "")
    .trim();
}

function matchAtomicPattern(rawLabel: string, prefix: Piece[]): PatternResult {
  const label = stripFormSuffix(rawLabel);
  if (label === "All Other Cases") {
    return { matches: true, rank: 100, fallback: true, supported: true };
  }

  const exactOrder = label.match(/^=([IJLOSTZ]{3})$/);
  if (exactOrder) {
    return {
      matches: prefix.join("") === exactOrder[1],
      rank: 0,
      fallback: false,
      supported: true,
    };
  }

  const bracketFirst = label.match(/^\[([IJLOSTZ]{2})\]!([IJLOSTZX])$/);
  if (bracketFirst) {
    const firstTwo = prefix.slice(0, 2).sort().join("");
    const required = [...bracketFirst[1]].sort().join("");
    const tail = bracketFirst[2];
    return {
      matches: firstTwo === required && (tail === "X" || prefix[2] === tail),
      rank: 0,
      fallback: false,
      supported: true,
    };
  }

  const leadingPiece = label.match(/^([IJLOSTZ])\[([IJLOSTZ]{2})\]!$/);
  if (leadingPiece) {
    return {
      matches: prefix[0] === leadingPiece[1]
        && prefix.slice(1, 3).sort().join("") === [...leadingPiece[2]].sort().join(""),
      rank: 0,
      fallback: false,
      supported: true,
    };
  }

  // On these source pages both '<' and '>' captions are followed by prose saying
  // that the left-hand piece must arrive first. Preserve that source convention.
  const comparison = label.match(/^([IJLOSTZ])[<>]([IJLOSTZ])$/);
  if (comparison) {
    return {
      matches: indexBefore(prefix, comparison[1] as Piece, comparison[2] as Piece),
      rank: 20,
      fallback: false,
      supported: true,
    };
  }

  const orderedPair = label.match(/^([IJLOSTZ]),([IJLOSTZ])$/);
  if (orderedPair) {
    return {
      matches: indexBefore(prefix, orderedPair[1] as Piece, orderedPair[2] as Piece),
      rank: 20,
      fallback: false,
      supported: true,
    };
  }

  if (PIECE_TOKEN.test(label) && new Set(label).size === label.length) {
    const pieces = [...label] as Piece[];
    if (pieces.length === 3) {
      return {
        matches: sortedPool(prefix) === sortedPool(pieces),
        rank: 10,
        fallback: false,
        supported: true,
      };
    }
    if (pieces.length === 2) {
      return {
        matches: pieces.every((piece) => prefix.includes(piece)),
        rank: 30,
        fallback: false,
        supported: true,
      };
    }
    if (pieces.length === 1) {
      return {
        matches: prefix.includes(pieces[0]),
        rank: 40,
        fallback: false,
        supported: true,
      };
    }
  }

  return { matches: false, rank: Number.POSITIVE_INFINITY, fallback: false, supported: false };
}

/** Parse every compact caption notation currently used by the 284-record QB policy. */
export function matchCycle2AdvancedQbPattern(
  entry: Pick<Cycle2AdvancedQbPolicyEntry, "runtimeCondition">,
  prefix: Piece[],
): PatternResult {
  if (prefix.length !== 3 || new Set(prefix).size !== 3) {
    return { matches: false, rank: Number.POSITIVE_INFINITY, fallback: false, supported: true };
  }
  const patternLabels = entry.runtimeCondition.includeNextBagPatterns;
  const alternatives = patternLabels.map((label) => matchAtomicPattern(label, prefix));
  if (alternatives.some(({ supported }) => !supported)) {
    return { matches: false, rank: Number.POSITIVE_INFINITY, fallback: false, supported: false };
  }
  const matches = alternatives.filter((result) => result.matches);
  if (matches.length === 0) {
    return {
      matches: false,
      rank: Number.POSITIVE_INFINITY,
      fallback: alternatives.every(({ fallback }) => fallback),
      supported: true,
    };
  }

  let rank = Math.min(...matches.map(({ rank: value }) => value));
  // A few numbered forms encode an additional order condition in parentheses,
  // for example "OLJ 1 (L<J)". It is part of the caption, not free prose.
  const nextBagOrderBefore = entry.runtimeCondition.nextBagOrderBefore;
  if (nextBagOrderBefore) {
    if (!indexBefore(prefix, nextBagOrderBefore[0], nextBagOrderBefore[1])) {
      return { matches: false, rank: Number.POSITIVE_INFINITY, fallback: false, supported: true };
    }
    rank = Math.min(rank, 5);
  }
  return {
    matches: true,
    rank,
    fallback: matches.every(({ fallback }) => fallback),
    supported: true,
  };
}

function variantsForClass(
  setup: SetupVariant,
  classInfo: Cycle2AdvancedQbClass,
  automaticMirror = true,
): Array<{ setup: SetupVariant; mirroredGeometry: boolean; sourcePrefixMirror: boolean }> {
  const physicalSetups = expandEquivalentPlacementVariants([setup]);
  if (classInfo.mirroredClass) {
    return physicalSetups.map((physicalSetup) => ({
      setup: mirrorSetup(physicalSetup),
      mirroredGeometry: true,
      sourcePrefixMirror: true,
    }));
  }
  if (classInfo.selfMirroredClass) {
    if (!automaticMirror) {
      return physicalSetups.map((physicalSetup) => ({
        setup: physicalSetup,
        mirroredGeometry: false,
        sourcePrefixMirror: false,
      }));
    }
    return [
      ...physicalSetups.map((physicalSetup) => ({
        setup: physicalSetup,
        mirroredGeometry: false,
        sourcePrefixMirror: false,
      })),
      ...physicalSetups.map((physicalSetup) => ({
        setup: mirrorSetup(physicalSetup),
        mirroredGeometry: true,
        sourcePrefixMirror: true,
      })),
    ];
  }
  return physicalSetups.map((physicalSetup) => ({
    setup: physicalSetup,
    mirroredGeometry: false,
    sourcePrefixMirror: false,
  }));
}

function matchesBuildOrderCondition(
  entry: Cycle2AdvancedQbPolicyEntry,
  buildPieces: Piece[],
): boolean {
  const comparison = entry.runtimeCondition?.buildOrderBefore;
  return comparison === undefined || indexBefore(buildPieces, comparison[0], comparison[1]);
}

/**
 * Select cycle-2 QB baselines without importing draft data into the normal catalog.
 * Only the initial 3P/4P frame is returned; continuation/solution frames stay evidence.
 */
export function selectCycle2AdvancedQbSetups(
  sourceCatalog: SetupVariant[],
  policy: Cycle2AdvancedQbPolicy,
  buildPieces: Piece[],
  visibleNextBagPrefix: Piece[],
  options: Cycle2AdvancedQbSelectionOptions = {},
): Cycle2AdvancedQbSelection[] {
  const classInfo = cycle2AdvancedQbClass(policy, buildPieces);
  if (!classInfo || visibleNextBagPrefix.length !== 3 || new Set(visibleNextBagPrefix).size !== 3) return [];
  const byId = new Map(sourceCatalog.map((setup) => [setup.id, setup]));
  const entries = policy.entries.filter((entry) =>
    entry.sourcePool === classInfo.sourcePool
    && (options.includeRuntimeDisabled || entry.runtimeEnabled !== false));

  const evaluated = entries.flatMap((entry) => {
    const setup = byId.get(entry.setupId);
    if (!setup || setup.placements.length !== entry.setupBuildPieceCount) return [];
    return variantsForClass(
      setup,
      classInfo,
      entry.runtimeCondition?.automaticMirror !== false,
    ).map((variant) => {
      const sourcePrefix = variant.sourcePrefixMirror
        ? visibleNextBagPrefix.map(mirrorPiece)
        : visibleNextBagPrefix;
      return { entry, variant, result: matchCycle2AdvancedQbPattern(entry, sourcePrefix) };
    }).filter(({ entry: candidateEntry, variant, result }) => {
      if (!result.supported || !result.matches) return false;
      const sourceBuildPieces = variant.sourcePrefixMirror
        ? buildPieces.map(mirrorPiece)
        : buildPieces;
      return matchesBuildOrderCondition(candidateEntry, sourceBuildPieces);
    });
  });

  const specific = evaluated.filter(({ result }) => !result.fallback);
  const eligible = options.deferRankSelectionUntilBuildable
    ? evaluated
    : specific.length > 0
      ? specific
      : evaluated.filter(({ result }) => result.fallback);
  if (eligible.length === 0) return [];
  const bestRank = Math.min(...eligible.map(({ result }) => result.rank));
  const best = eligible
    .filter(({ result }) => options.deferRankSelectionUntilBuildable || result.rank === bestRank)
    .sort((left, right) =>
      left.result.rank - right.result.rank
      || left.entry.sourceOrder - right.entry.sourceOrder
      || left.entry.setupId.localeCompare(right.entry.setupId));

  const expanded = best.flatMap(({ entry, variant, result }) =>
    expandBoxSetups([{
      ...variant.setup,
      recommendationGroup: `cycle2-advanced-qb:${entry.setupId}`,
    }]).map((setup) => ({
      setup,
      entry,
      classInfo,
      conditionRank: result.rank,
      fallbackCondition: result.fallback,
      mirroredGeometry: variant.mirroredGeometry,
    })));

  const seenGeometry = new Set<string>();
  return expanded.filter(({ setup }) => {
    const key = setupGeometryKey(setup);
    if (seenGeometry.has(key)) return false;
    seenGeometry.add(key);
    return true;
  });
}
