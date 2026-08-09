import rawManifest from "../../setups/catalog-manifest.json";
import rawCatalog from "../../setups/QB/cycle-7-qb-setups.json";
import rawPolicy from "../../setups/QB/cycle-7-qb-policy.json";
import type { Piece } from "../engine/types";
import { expandBoxSetups } from "./rotation";
import { mirrorPiece, mirrorSetup } from "./mirror";
import type { SetupVariant } from "./schema";

export interface Cycle7QbPolicyEntry {
  id: string;
  setupId: string;
  conditionId: string;
  priorPoolClass: "LSZ" | "ISZ" | "OSZ";
  runtimeDescription?: string;
  conditionLabel: string;
  sourceOrder: number;
  mirror: {
    kind: "none" | "class-mirror" | "conditional-horizontal";
    priorPoolClass?: "JSZ";
  };
}

interface Cycle7QbPolicyFile {
  reviewStatus?: string;
  entries: Cycle7QbPolicyEntry[];
  runtimePolicy?: {
    formSelectionRules?: Array<{
      id: string;
      priorPoolClass: "LSZ";
      mirrorClass?: "JSZ";
      conditionId: string;
      visiblePrefixLength: 4;
      allBefore: { pieces: Piece[]; pivot: Piece };
      selectSetupId: string;
      otherwiseSetupId: string;
    }>;
  };
}

interface Cycle7QbManifest {
  cycles?: Record<string, {
    qb?: {
      runtimeEnabled?: boolean;
    };
  }>;
}

export interface Cycle7QbRuntimeBundle {
  setups: SetupVariant[];
  policy: Cycle7QbPolicyFile;
}

const manifest = rawManifest as Cycle7QbManifest;
const sourceCatalog = rawCatalog as unknown as SetupVariant[];
const policy = rawPolicy as unknown as Cycle7QbPolicyFile;
const byId = new Map(sourceCatalog.map((setup) => [setup.id, setup]));

export function cycle7QbRuntimeReady(
  qb: { runtimeEnabled?: boolean } | undefined,
  setups: Array<{ id: string; reviewStatus?: string }>,
  qbPolicy: { reviewStatus?: string; entries?: Array<{ setupId?: string }> },
): boolean {
  const entrySetupIds = new Set(qbPolicy.entries?.map((entry) => entry.setupId));
  return qb?.runtimeEnabled === true
    && setups.length > 0
    && setups.every((setup) => setup.reviewStatus === "reviewed")
    && qbPolicy.reviewStatus === "reviewed"
    && qbPolicy.entries?.length === setups.length
    && setups.every((setup) => entrySetupIds.has(setup.id));
}

/** Keep reviewed QB files inert until the manifest explicitly activates them. */
export function cycle7QbRuntimeBundle(): Cycle7QbRuntimeBundle | null {
  const qb = manifest.cycles?.["7"]?.qb;
  return cycle7QbRuntimeReady(qb, sourceCatalog, policy)
    ? { setups: sourceCatalog, policy }
    : null;
}

export function cycle7QbClass(pieces: Piece[]): "LSZ" | "JSZ" | "ISZ" | "OSZ" | null {
  if (pieces.length !== 3 || new Set(pieces).size !== 3) return null;
  const signature = [...pieces].sort().join("");
  if (signature === "LSZ" || signature === "JSZ" || signature === "ISZ" || signature === "OSZ") return signature;
  return null;
}

function sourceEntryVariants(entry: Cycle7QbPolicyEntry, classId: string): SetupVariant[] {
  const setup = byId.get(entry.setupId);
  if (!setup) return [];
  if (classId === "JSZ") return entry.mirror.kind === "class-mirror" ? [mirrorSetup(setup)] : [];
  if (entry.priorPoolClass !== classId) return [];
  if (entry.mirror.kind === "conditional-horizontal") return [setup, mirrorSetup(setup)];
  return [setup];
}

export function cycle7QbCatalogForClass(classId: "LSZ" | "JSZ" | "ISZ" | "OSZ"): SetupVariant[] {
  return expandBoxSetups(policy.entries.flatMap((entry) => sourceEntryVariants(entry, classId)));
}

function canonicalId(id: string): string {
  return id.split("--box-")[0].replace(/--mirror$/, "");
}

export function cycle7QbPolicyEntryForSetup(setup: SetupVariant): Cycle7QbPolicyEntry | undefined {
  const id = canonicalId(setup.id);
  return policy.entries.find((entry) => entry.setupId === id);
}

export function cycle7QbSourceOrder(setup: SetupVariant): number {
  return cycle7QbPolicyEntryForSetup(setup)?.sourceOrder ?? Number.MAX_SAFE_INTEGER;
}

/** Short, geometry-aware label used by the game UI for Cycle 7 QB candidates. */
export function cycle7QbDisplayName(
  classId: "LSZ" | "JSZ" | "ISZ" | "OSZ",
  entry: Cycle7QbPolicyEntry,
  setup: SetupVariant,
): string {
  const mirrored = setup.id.split("--box-")[0].endsWith("--mirror");
  const form = entry.setupId.endsWith("-a") ? " (Form A)"
    : entry.setupId.endsWith("-b") ? " (Form B)"
      : "";
  if (classId === "LSZ") {
    switch (entry.conditionId) {
      case "oz-or-iz-early": return "LSZ Z QB";
      case "oj-early": return "LSZ OJ QB";
      case "ti-early": return "LSZ TI QB";
      case "ts-early": return `LSZ TS QB${form}`;
      case "l-early-o-visible":
      case "l-early-o-not-visible": return "LSZ L QB";
    }
  }
  if (classId === "JSZ") {
    switch (entry.conditionId) {
      case "oz-or-iz-early": return "JSZ S QB";
      case "oj-early": return "JSZ OL QB";
      case "ti-early": return "JSZ TI QB";
      case "ts-early": return `JSZ TZ QB${form}`;
      case "l-early-o-visible":
      case "l-early-o-not-visible": return "JSZ J QB";
    }
  }
  if (classId === "ISZ") {
    switch (entry.conditionId) {
      case "l-before-j": return `ISZ ${mirrored ? "J" : "L"} QB`;
      case "o-before-sz": return "ISZ O QB";
      case "tsz-early": return "ISZ TSZ QB";
    }
  }
  if (classId === "OSZ") {
    switch (entry.conditionId) {
      case "i-early": return "OSZ I QB";
      case "jls-or-jlz-early": return "OSZ JLS/JLZ QB";
      case "all-other": return "OSZ Other QB";
    }
  }
  return `${classId} QB`;
}

/**
 * Cycle 7 QB source policy is written in LSZ coordinates. JSZ uses its exact
 * horizontal mirror, so the visible following-bag prefix must be mirrored
 * before evaluating both the source condition and its form-selection rule.
 */
export function cycle7QbRecommendationRank(
  classId: "LSZ" | "JSZ" | "ISZ" | "OSZ",
  entry: Cycle7QbPolicyEntry,
  sequence: Piece[],
  setup: SetupVariant,
): number {
  const sourceSequence = classId === "JSZ" ? sequence.map(mirrorPiece) : sequence;
  const conditionRank = cycle7QbConditionRank(entry, sourceSequence, setup);
  if (!Number.isFinite(conditionRank)) return conditionRank;

  const rule = policy.runtimePolicy?.formSelectionRules?.find((candidate) =>
    candidate.conditionId === entry.conditionId
    && (candidate.priorPoolClass === classId || candidate.mirrorClass === classId));
  if (!rule) return conditionRank;
  if (sourceSequence.length < rule.visiblePrefixLength) return Number.POSITIVE_INFINITY;

  const pivotIndex = sourceSequence.indexOf(rule.allBefore.pivot);
  const beforeIndexes = rule.allBefore.pieces.map((piece) => sourceSequence.indexOf(piece));
  const matches = pivotIndex >= 0
    && beforeIndexes.every((index) => index >= 0 && index < pivotIndex);
  const selectedSetupId = matches ? rule.selectSetupId : rule.otherwiseSetupId;
  return canonicalId(setup.id) === selectedSetupId ? conditionRank : Number.POSITIVE_INFINITY;
}

/** SEE7 at Cycle 7 start is the previous-bag 3 plus the visible following-bag 4. */
export function cycle7QbNextBag(next: Piece[]): Piece[] | null {
  if (next.length < 5) return null;
  const visibleFollowingBag = next.slice(1, 5);
  return new Set(visibleFollowingBag).size === 4 ? visibleFollowingBag : null;
}

function readyIndex(sequence: Piece[], pieces: Piece[]): number {
  const indices = pieces.map((piece) => sequence.indexOf(piece));
  return indices.some((index) => index < 0) ? Number.POSITIVE_INFINITY : Math.max(...indices);
}

/** Lower means that the source condition becomes usable earlier in the following bag. */
export function cycle7QbConditionRank(
  entry: Cycle7QbPolicyEntry,
  sequence: Piece[],
  setup?: SetupVariant,
): number {
  const index = (piece: Piece) => sequence.indexOf(piece);
  const observedIndex = (piece: Piece) => {
    const value = index(piece);
    return value < 0 ? sequence.length : value;
  };
  const mirrored = setup?.id.split("--box-")[0].endsWith("--mirror") ?? false;
  switch (entry.conditionId) {
    case "oz-or-iz-early": return Math.min(readyIndex(sequence, ["O", "Z"]), readyIndex(sequence, ["I", "Z"]));
    case "oj-early": return readyIndex(sequence, ["O", "J"]);
    case "ti-early": return readyIndex(sequence, ["T", "I"]);
    case "ts-early": return readyIndex(sequence, ["T", "S"]);
    case "l-early-o-visible": return index("L") >= 0 && index("O") >= 0 ? index("L") : Number.POSITIVE_INFINITY;
    case "l-early-o-not-visible": return index("L") >= 0 && index("O") < 0 ? 20 + index("L") : Number.POSITIVE_INFINITY;
    case "l-before-j": {
      const l = observedIndex("L");
      const j = observedIndex("J");
      if (l === j) return Number.POSITIVE_INFINITY;
      return mirrored === (j < l) ? Math.min(l, j) : Number.POSITIVE_INFINITY;
    }
    case "o-before-sz": {
      const o = index("O");
      // The source wording only guarantees O before S/Z. Sfinder validation extends this
      // branch to the 18 otherwise-uncovered O-fourth prefixes; rank 3 keeps any earlier
      // J/L or exact TSZ branch ahead of this validated fallback.
      return o >= 0 ? o : Number.POSITIVE_INFINITY;
    }
    case "tsz-early": return readyIndex(sequence, ["T", "S", "Z"]);
    case "i-early": return index("I") < 0 ? Number.POSITIVE_INFINITY : index("I");
    case "jls-or-jlz-early": {
      if (index("I") >= 0) return Number.POSITIVE_INFINITY;
      return Math.min(readyIndex(sequence, ["J", "L", "S"]), readyIndex(sequence, ["J", "L", "Z"]));
    }
    case "all-other": {
      if (index("I") >= 0) return Number.POSITIVE_INFINITY;
      if (index("J") >= 0 && index("L") >= 0 && (index("S") >= 0 || index("Z") >= 0)) {
        return Number.POSITIVE_INFINITY;
      }
      const wantsMirror = index("J") >= 0 && (index("L") < 0 || index("J") < index("L"));
      const rank = index("T") >= 0 ? index("T") : 100;
      return mirrored === wantsMirror ? rank : Number.POSITIVE_INFINITY;
    }
    default: return Number.POSITIVE_INFINITY;
  }
}
