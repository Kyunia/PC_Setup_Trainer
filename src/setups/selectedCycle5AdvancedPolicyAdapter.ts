import type { Piece } from "../engine/types";
import type {
  Cycle5AdvancedOqbObservation,
  Cycle5AdvancedPostCheckpoint,
  Cycle5AdvancedSinglePieceAction,
  Cycle5AdvancedPolicyBundle,
  Cycle5AdvancedPolicyEntry,
  Cycle5AdvancedQueuePart,
  Cycle5AdvancedQueuePattern,
  Cycle5AdvancedQueuePatternBody,
  Cycle5AdvancedSetupRef,
} from "./cycle5AdvancedPolicy";
import { validateSetup } from "./schema";

type JsonRecord = Record<string, unknown>;

const PIECES = new Set<string>(["T", "O", "I", "L", "J", "S", "Z"]);
const PATTERN_SYMBOLS = new Set<string>([...PIECES, "X"]);

export class SelectedCycle5AdvancedPolicyError extends Error {
  constructor(sourceId: string, detail: string) {
    super(`Selected Cycle 5 advanced policy '${sourceId}' is not executable: ${detail}`);
    this.name = "SelectedCycle5AdvancedPolicyError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRecords(value: unknown, sourceId: string, field: string): JsonRecord[] {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field} must be an array of objects.`);
  }
  return value as JsonRecord[];
}

function asString(value: unknown, sourceId: string, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field} must be a non-empty string.`);
  }
  return value;
}

function asPiece(value: unknown, sourceId: string, field: string): Piece {
  const piece = asString(value, sourceId, field);
  if (!PIECES.has(piece)) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field} contains invalid piece '${piece}'.`);
  }
  return piece as Piece;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

const EXCLUSION_PARENTHETICAL = /\(([^()]*(?:제외|except|excluding)[^()]*)\)/giu;

function notationCandidates(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const positiveText = value.replace(EXCLUSION_PARENTHETICAL, " ");
  const afterMatch = positiveText.match(/(\[[TOILJSZX]+\]!?)[\s]*직후[\s]*([TOILJSZ](?:\/[TOILJSZ])*)/u);
  if (afterMatch) return unique(afterMatch[2]!.split("/").map((piece) => `${afterMatch[1]}${piece}`));
  const text = positiveText
    .replace(/연습하기/g, "")
    .replace(/\([^()]*홀드[^()]*\)/g, "")
    .replace(/셋업\s*\d+(?:\s*\([^)]*\))?/g, "")
    .replace(/직후\s*([TOILJSZ])가?\s*나올\s*경우/g, "$1")
    .replace(/[()]/g, " ")
    .replace(/⇔|↔/g, " ");
  return unique((text.match(/(?:[TOILJSZX]+-)?(?:\[[TOILJSZX]+\]!?|[TOILJSZX]+)+/g) ?? [])
    .map((candidate) => candidate.replace(/!{2,}/g, "!"))
    .filter((candidate) => [...candidate].filter((symbol) => PATTERN_SYMBOLS.has(symbol)).length >= 3));
}

function exclusionNotationCandidates(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return unique([...value.matchAll(EXCLUSION_PARENTHETICAL)]
    .flatMap((match) => notationCandidates(match[1]!.replace(/제외|except|excluding/giu, " "))));
}

function parsePattern(expression: string, sourceId: string): Cycle5AdvancedQueuePattern {
  const scope = expression.includes("-") ? "visible-seven" : "next-bag-five";
  const body = expression.replace("-", "");
  const parts: Cycle5AdvancedQueuePattern["parts"] = [];
  let index = 0;
  while (index < body.length) {
    if (body[index] === "[") {
      const close = body.indexOf("]", index + 1);
      if (close < 0) throw new SelectedCycle5AdvancedPolicyError(sourceId, `unterminated queue bracket in '${expression}'.`);
      const symbols = [...body.slice(index + 1, close)];
      if (symbols.length === 0 || symbols.some((symbol) => !PATTERN_SYMBOLS.has(symbol))) {
        throw new SelectedCycle5AdvancedPolicyError(sourceId, `invalid queue bracket in '${expression}'.`);
      }
      parts.push({ kind: "permutation", symbols: symbols as Array<Piece | "X"> });
      index = close + 1 + (body[close + 1] === "!" ? 1 : 0);
      continue;
    }
    if (body[index] === "!") {
      index += 1;
      continue;
    }
    let end = index;
    while (end < body.length && PATTERN_SYMBOLS.has(body[end]!)) end += 1;
    if (end === index) {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `unsupported queue token in '${expression}'.`);
    }
    parts.push({ kind: "ordered", symbols: [...body.slice(index, end)] as Array<Piece | "X"> });
    index = end;
  }
  if (parts.length === 0) throw new SelectedCycle5AdvancedPolicyError(sourceId, `empty queue pattern '${expression}'.`);
  return { scope, parts };
}

function compileTexts(values: unknown[], sourceId: string): Cycle5AdvancedQueuePattern[] {
  return unique(values.flatMap(notationCandidates)).map((expression) => parsePattern(expression, sourceId));
}

function compileExclusions(values: unknown[], sourceId: string): Cycle5AdvancedQueuePattern[] {
  return unique(values.flatMap(exclusionNotationCandidates))
    .map((expression) => parsePattern(expression, sourceId));
}

function directTexts(rule: JsonRecord): unknown[] {
  const condition = isRecord(rule.condition) ? rule.condition : undefined;
  const canonical = isRecord(rule.canonicalCondition) ? rule.canonicalCondition : undefined;
  return [
    condition?.expression,
    ...(Array.isArray(condition?.expressions) ? condition.expressions : []),
    canonical?.expression,
    ...(Array.isArray(canonical?.expressions) ? canonical.expressions : []),
    typeof rule.canonicalCondition === "string" ? rule.canonicalCondition : undefined,
  ].filter(Boolean);
}

function setupRefsFromDraftRule(
  rule: JsonRecord,
  sourceId: string,
): Array<Cycle5AdvancedSetupRef & { conditionLabel?: string }> {
  if (Array.isArray(rule.geometryVariants)) {
    return asRecords(rule.geometryVariants, sourceId, `${String(rule.ruleId)}.geometryVariants`).map((variant) => ({
      setupId: asString(variant.setupId, sourceId, `${String(rule.ruleId)}.geometryVariants.setupId`),
      transform: variant.transform === "mirrorX" ? "mirror-x" : "identity",
      ...(typeof variant.when === "string" ? { conditionLabel: variant.when } : {}),
    }));
  }
  if (!Array.isArray(rule.eligibleSetupIds)) return [];
  return rule.eligibleSetupIds.map((id, index) => ({
    setupId: asString(id, sourceId, `${String(rule.ruleId)}.eligibleSetupIds[${index}]`),
    transform: "identity",
  }));
}

function draftDirectEntry(
  rule: JsonRecord,
  sourceId: string,
  defaultOrder: number,
): Cycle5AdvancedPolicyEntry | null {
  if (rule.selectionMode === "OQB") return null;
  const id = asString(rule.ruleId, sourceId, "rule.ruleId");
  const texts = directTexts(rule);
  const exclusions = compileExclusions(texts, sourceId);
  const patterns = compileTexts(texts, sourceId)
    .map((pattern) => copyPatternWithExclusions(pattern, exclusions));
  const refs = setupRefsFromDraftRule(rule, sourceId);
  // Promotion records group fallbacks as non-executable presentation entries.
  // Preserve that runtime behavior without passing an unsupported entry kind.
  if (rule.selectionMode === "fallback") return null;
  if (patterns.length === 0) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${id} has no compilable queue condition.`);
  }
  const alternatives = patterns.map((pattern) => {
    const label = notationCandidates(texts.join(" ")).find((candidate) => {
      const parsed = parsePattern(candidate, sourceId);
      return parsed.scope === pattern.scope && JSON.stringify(parsed.parts) === JSON.stringify(pattern.parts);
    });
    const matchingRefs = refs.filter((ref) => !ref.conditionLabel || ref.conditionLabel === label);
    return {
      pattern,
      setupRefs: (matchingRefs.length > 0 ? matchingRefs : refs)
        .map(({ conditionLabel: _conditionLabel, ...ref }) => ref),
    };
  });
  return {
    id,
    kind: "direct",
    sourceOrder: typeof rule.sourceOrder === "number" ? rule.sourceOrder : defaultOrder,
    alternatives,
    bestsave: typeof rule.bestsave === "boolean" ? rule.bestsave : null,
    directTwoLinePc: rule.directTwoLinePc === true,
  };
}

function normalizeObservation(
  value: unknown,
  sourceId: string,
  planId: string,
): Cycle5AdvancedOqbObservation {
  if (!isRecord(value)) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${planId}.observation must be an object.`);
  }
  if (value.kind === "infer-hidden-last-piece" || value.kind === "hidden-bag-piece") {
    const known = Array.isArray(value.knownRemainingBagPieces)
      ? value.knownRemainingBagPieces.map((piece, index) =>
        asPiece(piece, sourceId, `${planId}.observation.knownRemainingBagPieces[${index}]`))
      : [];
    if (known.length === 0 || !Number.isInteger(value.visibleCountFromThatSet)) {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `${planId} has an incomplete hidden-piece observation.`);
    }
    return {
      kind: "hidden-bag-piece",
      knownRemainingBagPieces: known,
      visibleCountFromThatSet: value.visibleCountFromThatSet as number,
    };
  }
  if (["queue-reveal", "newly-visible-piece", "new-tail", "reveal"].includes(String(value.kind))) {
    if (value.uiSlot !== undefined && value.uiSlot !== null
      && (typeof value.uiSlot !== "string" || !/^NEXT\[\d+]$/.test(value.uiSlot))) {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `${planId}.observation.uiSlot is invalid.`);
    }
    return {
      kind: "reveal",
      ...(typeof value.uiSlot === "string" ? { uiSlot: value.uiSlot as `NEXT[${number}]` } : {}),
    };
  }
  if (value.kind === "relative-order" && Array.isArray(value.pieces) && value.pieces.length === 2) {
    return {
      kind: "relative-order",
      pieces: [
        asPiece(value.pieces[0], sourceId, `${planId}.observation.pieces[0]`),
        asPiece(value.pieces[1], sourceId, `${planId}.observation.pieces[1]`),
      ],
    };
  }
  throw new SelectedCycle5AdvancedPolicyError(sourceId, `${planId} has an unsupported observation kind.`);
}

function observedPieces(branch: JsonRecord, sourceId: string, branchId: string): Piece[] {
  const when = isRecord(branch.when) ? branch.when : undefined;
  return unique([
    branch.observedPiece,
    ...(Array.isArray(branch.observedPieces) ? branch.observedPieces : []),
    when?.revealedPiece,
    ...(Array.isArray(when?.hiddenLastPieceIn) ? when.hiddenLastPieceIn : []),
  ].filter((value) => value !== undefined).map((piece, index) =>
    asPiece(piece, sourceId, `${branchId}.observedPieces[${index}]`)));
}

function normalizeSinglePieceAction(
  value: unknown,
  sourceId: string,
  field: string,
): Cycle5AdvancedSinglePieceAction {
  if (!isRecord(value)) throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field} must be an object.`);
  const cells = asRecords(value.cells, sourceId, `${field}.cells`).map((cell, index) => {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field}.cells[${index}] must use integer coordinates.`);
    }
    const x = cell.x as number;
    const y = cell.y as number;
    if (x < 0 || x >= 10 || y < 0 || y >= 4) {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field}.cells[${index}] is outside 10x4.`);
    }
    return { x, y };
  });
  if (cells.length !== 4 || new Set(cells.map(({ x, y }) => `${x},${y}`)).size !== 4) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field}.cells must contain four unique cells.`);
  }
  if (!Number.isInteger(value.resultingPieceCount) || (value.resultingPieceCount as number) < 1) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field}.resultingPieceCount is invalid.`);
  }
  const piece = asPiece(value.piece, sourceId, `${field}.piece`);
  const placementErrors = validateSetup({
    id: `${field}-validation`,
    cycle: 5,
    family: "policy-action",
    displayName: "Policy action",
    pieceSignature: [piece],
    placements: [{ id: `${field}-placement`, piece, cells }],
    difficulty: 1,
    reviewStatus: "reviewed",
  });
  if (placementErrors.length > 0) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field}.cells are not a legal ${piece} placement.`);
  }
  return {
    piece,
    cells,
    resultingPieceCount: value.resultingPieceCount as number,
  };
}

function normalizePostCheckpoint(
  value: unknown,
  sourceId: string,
  field: string,
): Cycle5AdvancedPostCheckpoint | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field} must be an object.`);
  const branches = asRecords(value.branches, sourceId, `${field}.branches`).map((branch, index) => {
    const branchField = `${field}.branches[${index}]`;
    const pieces = Array.isArray(branch.observedPieces)
      ? branch.observedPieces.map((piece, pieceIndex) =>
        asPiece(piece, sourceId, `${branchField}.observedPieces[${pieceIndex}]`))
      : [];
    const fallback = branch.fallback === true;
    if ((pieces.length > 0 ? 1 : 0) + (fallback ? 1 : 0) !== 1) {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `${branchField} needs one predicate or fallback.`);
    }
    const refs = branch.continuationSetupRefs === undefined
      ? undefined
      : asRecords(branch.continuationSetupRefs, sourceId, `${branchField}.continuationSetupRefs`)
        .map((ref) => validateSetupRef(ref, sourceId, `${branchField}.continuationSetupRefs`));
    const action = branch.action === undefined
      ? undefined
      : normalizeSinglePieceAction(branch.action, sourceId, `${branchField}.action`);
    if ((refs && refs.length > 0 ? 1 : 0) + (action ? 1 : 0) !== 1) {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `${branchField} needs exactly one continuation outcome.`);
    }
    return {
      id: typeof branch.id === "string" ? branch.id : `${field}-branch-${index + 1}`,
      ...(pieces.length > 0 ? { observedPieces: pieces } : {}),
      ...(fallback ? { fallback: true } : {}),
      ...(refs && refs.length > 0 ? { continuationSetupRefs: refs } : {}),
      ...(action ? { action } : {}),
    };
  });
  if (branches.length === 0) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field}.branches must not be empty.`);
  }
  if (new Set(branches.map(({ id }) => id)).size !== branches.length) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field} branch ids must be unique.`);
  }
  const fallbackIndexes = branches.flatMap((branch, index) => branch.fallback ? [index] : []);
  if (fallbackIndexes.length > 1 || (fallbackIndexes.length === 1 && fallbackIndexes[0] !== branches.length - 1)) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field} fallback must be unique and last.`);
  }
  return {
    observation: normalizeObservation(value.observation, sourceId, `${field}.observation`),
    branches,
  };
}

function sourceNumber(value: unknown): number {
  const match = String(value ?? "").match(/-(\d{3})(?:-|$)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function draftOqbEntry(
  plan: JsonRecord,
  sourceId: string,
  defaultOrder: number,
): Cycle5AdvancedPolicyEntry {
  const id = asString(plan.planId, sourceId, "oqbPlan.planId");
  const initialVisible = isRecord(plan.initialVisibleCondition) ? plan.initialVisibleCondition : undefined;
  const initialPatterns = compileTexts([
    plan.rawInitialCondition,
    plan.rawSourceCondition,
    plan.canonicalCondition,
    initialVisible?.expression,
    ...(Array.isArray(initialVisible?.expressions) ? initialVisible.expressions : []),
  ].filter(Boolean), sourceId);
  if (initialPatterns.length === 0) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${id} has no compilable initial queue pattern.`);
  }
  const logicalPrecondition = isRecord(plan.logicalPrecondition) ? plan.logicalPrecondition : undefined;
  const preconditionSetupId = typeof plan.preconditionSetupId === "string" && plan.preconditionSetupId.length > 0
    ? plan.preconditionSetupId
    : asString(logicalPrecondition?.logicalId, sourceId, `${id}.preconditionSetupId/logicalPrecondition.logicalId`);
  const checkpoint = isRecord(plan.placedCheckpoint) ? plan.placedCheckpoint : undefined;
  const placedCount = checkpoint?.placedCount;
  if (placedCount !== 1 && placedCount !== 2 && placedCount !== 3) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${id}.placedCheckpoint.placedCount must be 1, 2, or 3.`);
  }
  const branches = asRecords(plan.branches, sourceId, `${id}.branches`).map((branch, index) => {
    const branchId = `${id}-branch-${index + 1}`;
    const pieces = observedPieces(branch, sourceId, branchId);
    const relative = typeof branch.condition === "string"
      ? branch.condition.match(/^([TOILJSZ]) before ([TOILJSZ])$/i)
      : null;
    const continuationIds = unique([
      ...(Array.isArray(branch.eligibleSetupIds) ? branch.eligibleSetupIds : []),
      branch.continuationSetupId,
      typeof branch.continuationSourceItemId === "string"
        ? `geometry-${branch.continuationSourceItemId}-f000`
        : undefined,
    ].filter((value): value is string => typeof value === "string" && value.length > 0));
    if (pieces.length === 0 && !relative) {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `${branchId} has no executable predicate.`);
    }
    if (continuationIds.length === 0 && !isRecord(branch.action)) {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `${branchId} has no executable continuation.`);
    }
    const postCheckpoint = normalizePostCheckpoint(
      branch.postCheckpoint,
      sourceId,
      `${branchId}.postCheckpoint`,
    );
    return {
      id: branchId,
      ...(pieces.length > 0 ? { observedPieces: pieces } : {}),
      ...(relative ? {
        relativeOrder: {
          before: relative[1] as Piece,
          after: relative[2] as Piece,
        },
      } : {}),
      continuationSetupRefs: continuationIds.map((setupId) => ({ setupId, transform: "identity" as const })),
      bestsave: typeof branch.bestsave === "boolean" ? branch.bestsave : null,
      ...(postCheckpoint ? { postCheckpoint } : {}),
    };
  });
  const naturalOrder = Math.min(
    sourceNumber(preconditionSetupId),
    ...branches.flatMap((branch) => branch.continuationSetupRefs.map(({ setupId }) => sourceNumber(setupId))),
  );
  return {
    id,
    kind: "oqb",
    sourceOrder: Number.isFinite(naturalOrder) ? naturalOrder : defaultOrder,
    initialPatterns,
    preconditionSetupId,
    checkpoint: { placedCount },
    observation: normalizeObservation(plan.observation, sourceId, id),
    branches,
  };
}

function copyPatternWithExclusions(
  pattern: Cycle5AdvancedQueuePattern,
  exclusions: Cycle5AdvancedQueuePattern[],
): Cycle5AdvancedQueuePattern {
  const sameScope = exclusions.filter(({ scope }) => scope === pattern.scope);
  return sameScope.length === 0 ? pattern : {
    ...pattern,
    excludes: [
      ...(pattern.excludes ?? []),
      ...sameScope.map(({ parts }) => ({ parts } satisfies Cycle5AdvancedQueuePatternBody)),
    ],
  };
}

function flattenSelectionGroup(
  group: JsonRecord,
  sourceId: string,
): Cycle5AdvancedPolicyEntry[] {
  const groupId = asString(group.id, sourceId, "selectionGroup.id");
  const groupOrder = typeof group.sourceOrder === "number" ? group.sourceOrder : 0;
  const guardPatterns = asRecords(group.guardPatterns, sourceId, `${groupId}.guardPatterns`)
    .map((pattern) => validatePattern(pattern, sourceId, `${groupId}.guardPatterns`));
  const previous: Cycle5AdvancedQueuePattern[] = [];
  return asRecords(group.decisions, sourceId, `${groupId}.decisions`).flatMap((decision, index) => {
    if (decision.outcome !== "setups") return [];
    const refs = asRecords(decision.setupRefs, sourceId, `${groupId}.decisions[${index}].setupRefs`)
      .map((ref) => validateSetupRef(ref, sourceId, `${groupId}.decisions[${index}].setupRefs`));
    if (refs.length === 0) return [];
    const explicit = Array.isArray(decision.patterns)
      ? asRecords(decision.patterns, sourceId, `${groupId}.decisions[${index}].patterns`)
        .map((pattern) => validatePattern(pattern, sourceId, `${groupId}.decisions[${index}].patterns`))
      : [];
    const basePatterns = explicit.length > 0 ? explicit : guardPatterns;
    const patterns = basePatterns.map((pattern) => copyPatternWithExclusions(pattern, previous));
    previous.push(...explicit);
    return [{
      id: typeof decision.id === "string" ? decision.id : `${groupId}-${index + 1}`,
      kind: "direct" as const,
      sourceOrder: groupOrder + (index + 1) / 1_000,
      alternatives: patterns.map((pattern) => ({ pattern, setupRefs: refs })),
      bestsave: null,
      directTwoLinePc: false,
    }];
  });
}

function draftTableGuardPatterns(table: JsonRecord): Cycle5AdvancedQueuePattern[] {
  const group = String(table.group ?? "");
  const tokens = group.split("/").map((token) => token.trim())
    .filter((token) => /^[TOILJSZ]{3,}$/.test(token));
  if (tokens.length > 0) {
    return tokens.map((token) => ({
      scope: "next-bag-five",
      parts: [{ kind: "permutation", symbols: [...token] as Piece[] }],
    }));
  }
  const symbols = unique([...group.matchAll(/[TOILJSZ]/g)].map((match) => match[0] as Piece));
  return symbols.length >= 3
    ? [{ scope: "next-bag-five", parts: [{ kind: "permutation", symbols }] }]
    : [];
}

function validateSetupRef(value: JsonRecord, sourceId: string, field: string): Cycle5AdvancedSetupRef {
  const transform = value.transform ?? "identity";
  if (transform !== "identity" && transform !== "mirror-x") {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field}.transform is invalid.`);
  }
  return {
    setupId: asString(value.setupId, sourceId, `${field}.setupId`),
    transform,
    ...(PIECES.has(String(value.displayHoldPiece)) ? { displayHoldPiece: value.displayHoldPiece as Piece } : {}),
  };
}

function validatePattern(value: JsonRecord, sourceId: string, field: string): Cycle5AdvancedQueuePattern {
  if (value.scope !== "visible-seven" && value.scope !== "next-bag-five") {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, `${field}.scope is invalid.`);
  }
  const validateParts = (raw: unknown, partsField: string) => asRecords(raw, sourceId, partsField)
    .map<Cycle5AdvancedQueuePart>((part, index) => {
    if (part.kind !== "ordered" && part.kind !== "permutation") {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `${partsField}[${index}].kind is invalid.`);
    }
    if (!Array.isArray(part.symbols) || part.symbols.some((symbol) => !PATTERN_SYMBOLS.has(String(symbol)))) {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `${partsField}[${index}].symbols is invalid.`);
    }
    return { kind: part.kind, symbols: part.symbols as Array<Piece | "X"> };
  });
  const parts = validateParts(value.parts, `${field}.parts`);
  const excludes = value.excludes === undefined
    ? undefined
    : asRecords(value.excludes, sourceId, `${field}.excludes`).map((body, index) => ({
      parts: validateParts(body.parts, `${field}.excludes[${index}].parts`),
    }));
  return { scope: value.scope, parts, ...(excludes ? { excludes } : {}) };
}

function normalizePromotedEntry(
  entry: JsonRecord,
  sourceId: string,
  index: number,
): Cycle5AdvancedPolicyEntry[] {
  if (entry.kind === "selection-group") return flattenSelectionGroup(entry, sourceId);
  if (entry.kind === "group-fallback") return [];
  const id = asString(entry.id, sourceId, `entries[${index}].id`);
  const sourceOrder = typeof entry.sourceOrder === "number" ? entry.sourceOrder : index + 1;
  if (entry.kind === "direct") {
    const alternatives = asRecords(entry.alternatives, sourceId, `${id}.alternatives`).map((alternative, altIndex) => ({
      pattern: validatePattern(
        isRecord(alternative.pattern) ? alternative.pattern : {},
        sourceId,
        `${id}.alternatives[${altIndex}].pattern`,
      ),
      setupRefs: asRecords(alternative.setupRefs, sourceId, `${id}.alternatives[${altIndex}].setupRefs`)
        .map((ref) => validateSetupRef(ref, sourceId, `${id}.alternatives[${altIndex}].setupRefs`)),
    }));
    return [{
      id,
      kind: "direct",
      sourceOrder,
      alternatives,
      bestsave: typeof entry.bestsave === "boolean" ? entry.bestsave : null,
      directTwoLinePc: entry.directTwoLinePc === true,
    }];
  }
  if (entry.kind === "oqb") {
    const checkpoint = isRecord(entry.checkpoint) ? entry.checkpoint : undefined;
    const placedCount = checkpoint?.placedCount;
    if (placedCount !== 1 && placedCount !== 2 && placedCount !== 3) {
      throw new SelectedCycle5AdvancedPolicyError(sourceId, `${id}.checkpoint.placedCount must be 1, 2, or 3.`);
    }
    return [{
      id,
      kind: "oqb",
      sourceOrder,
      initialPatterns: asRecords(entry.initialPatterns, sourceId, `${id}.initialPatterns`)
        .map((pattern) => validatePattern(pattern, sourceId, `${id}.initialPatterns`)),
      preconditionSetupId: typeof entry.preconditionSetupId === "string" ? entry.preconditionSetupId : null,
      checkpoint: { placedCount },
      observation: normalizeObservation(entry.observation, sourceId, id),
      branches: asRecords(entry.branches, sourceId, `${id}.branches`).map((branch, branchIndex) => {
        const branchId = typeof branch.id === "string" ? branch.id : `${id}-branch-${branchIndex + 1}`;
        const postCheckpoint = normalizePostCheckpoint(
          branch.postCheckpoint,
          sourceId,
          `${id}.branches[${branchIndex}].postCheckpoint`,
        );
        return {
        id: branchId,
        ...(Array.isArray(branch.observedPieces) ? {
          observedPieces: branch.observedPieces.map((piece, pieceIndex) =>
            asPiece(piece, sourceId, `${id}.branches[${branchIndex}].observedPieces[${pieceIndex}]`)),
        } : {}),
        ...(isRecord(branch.relativeOrder) ? {
          relativeOrder: {
            before: asPiece(branch.relativeOrder.before, sourceId, `${id}.branches[${branchIndex}].relativeOrder.before`),
            after: asPiece(branch.relativeOrder.after, sourceId, `${id}.branches[${branchIndex}].relativeOrder.after`),
          },
        } : {}),
        continuationSetupRefs: asRecords(
          branch.continuationSetupRefs,
          sourceId,
          `${id}.branches[${branchIndex}].continuationSetupRefs`,
        ).map((ref) => validateSetupRef(ref, sourceId, `${id}.branches[${branchIndex}].continuationSetupRefs`)),
        bestsave: typeof branch.bestsave === "boolean" ? branch.bestsave : null,
        ...(postCheckpoint ? { postCheckpoint } : {}),
      }; }),
    }];
  }
  throw new SelectedCycle5AdvancedPolicyError(sourceId, `${id} has unsupported entry kind '${String(entry.kind)}'.`);
}

/**
 * Converts either a promoted executable policy or its reviewed querieddata
 * predecessor into the same plain-data runtime bundle. No input is mutated and
 * no production/draft file is imported here.
 */
export function normalizeSelectedCycle5AdvancedPolicy(
  value: unknown,
  sourceId: string,
): Cycle5AdvancedPolicyBundle {
  if (!isRecord(value)) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, "policy root must be an object.");
  }
  if (value.cycle !== 5) {
    throw new SelectedCycle5AdvancedPolicyError(sourceId, "cycle must equal 5.");
  }
  const classId = asString(value.classId, sourceId, "classId")
    .replace(/^cycle5-/, "")
    .replace(/-advanced$/, "");

  if (Array.isArray(value.entries)) {
    const entries = asRecords(value.entries, sourceId, "entries")
      .flatMap((entry, index) => normalizePromotedEntry(entry, sourceId, index));
    return { schemaVersion: value.schemaVersion === 1 ? 1 : 3, cycle: 5, classId, entries };
  }

  const hasRules = Array.isArray(value.rules) || Array.isArray(value.directRules);
  if (!hasRules || !Array.isArray(value.oqbPlans)) {
    throw new SelectedCycle5AdvancedPolicyError(
      sourceId,
      "expected promoted entries[] or draft rules/directRules[] together with oqbPlans[].",
    );
  }
  const rules = Array.isArray(value.rules)
    ? asRecords(value.rules, sourceId, "rules")
    : asRecords(value.directRules, sourceId, "directRules");
  const directEntries = rules.flatMap((rule, index) => {
    const entry = draftDirectEntry(rule, sourceId, index + 1);
    return entry ? [entry] : [];
  });
  const selectionGroups = Array.isArray(value.selectionTables)
    ? asRecords(value.selectionTables, sourceId, "selectionTables").flatMap((table, index) => {
      // Compile the rich table through the same executable direct-entry shape.
      const promotedLike = {
        id: typeof table.tableId === "string" ? table.tableId : `selection-table-${index + 1}`,
        sourceOrder: directEntries.length + index + 1,
        guardPatterns: draftTableGuardPatterns(table),
        decisions: asRecords(table.decisions, sourceId, `selectionTables[${index}].decisions`).map((decision, decisionIndex) => {
          const conditionText = typeof decision.canonicalConditionText === "string"
            ? decision.canonicalConditionText
            : "";
          const fallback = /그 외|모든 조합|all other/i.test(conditionText);
          let patterns = fallback ? [] : compileTexts([conditionText], sourceId);
          if (fallback && table.tableId === "to5-advanced-tol-toj") {
            patterns = ["[TOL]!J", "[TOL]!S", "[TOL]!Z"]
              .map((expression) => parsePattern(expression, sourceId));
          }
          if (table.tableId === "tstz5-advanced-oij" && /IJOZ/.test(conditionText)) {
            const excluded = parsePattern("IJOZ", sourceId);
            patterns = patterns.map((pattern) => ({
              ...pattern,
              excludes: [...(pattern.excludes ?? []), { parts: excluded.parts }],
            }));
          }
          return {
            id: `${String(table.tableId)}-${decisionIndex + 1}`,
            outcome: decision.outcome === "no-bestsave-setup" ? "no-bestsave" : "setups",
            ...(patterns.length > 0 ? { patterns } : {}),
            setupRefs: Array.isArray(decision.eligibleSetupIds)
              ? decision.eligibleSetupIds.map((setupId) => ({ setupId, transform: "identity" }))
              : [],
          };
        }),
      } satisfies JsonRecord;
      return flattenSelectionGroup(promotedLike, sourceId);
    })
    : [];
  const oqbEntries = asRecords(value.oqbPlans, sourceId, "oqbPlans")
    .map((plan, index) => draftOqbEntry(
      plan,
      sourceId,
      directEntries.length + selectionGroups.length + index + 1,
    ));
  return {
    schemaVersion: 3,
    cycle: 5,
    classId,
    entries: [...directEntries, ...selectionGroups, ...oqbEntries],
  };
}
