import type { Board, Cycle, Piece } from "../engine/types";
import { formatPieceSetForDisplay } from "../engine/pieceDisplay";
import { setupPolicyForCycle, setupsForCycle, setupsForCycle2Advanced3P, setupsForCycle2General, setupsForCycle3Class, setupsForCycle4Class, setupsForCycle5Class, setupsForCycle6Class } from "./catalog";
import { cycle1QueueContext, isNormalCycle1Context } from "./cycle1Context";
import { cycle2AdvancedQbConditionLabel, cycle2AdvancedQbSaveTargets, selectCycle2AdvancedQbSetups } from "./cycle2AdvancedQb";
import { cycle2AdvancedQbRuntimeBundle } from "./cycle2AdvancedQbCatalog";
import { cycle2QueueContext, fitsCycle2BuildPool } from "./cycle2Context";
import { cycle3QueueContext, fitsCycle3BuildPool } from "./cycle3Context";
import { cycle4ClassLabel } from "./cycle4Catalog";
import { cycle4QueueContext, fitsCycle4BuildPool } from "./cycle4Context";
import { cycle5PiecePairKey, cycle5QueueContext, fitsCycle5BuildPool } from "./cycle5Context";
import { cycle6QueueContext, fitsCycle6BuildPool } from "./cycle6Context";
import { cycle7Advanced4pGoodCycle8Rate, cycle7Advanced4pMatches, cycle7Advanced4pRuntimeBundle } from "./cycle7Advanced4pCatalog";
import { cycle7QueueContext, fitsCycle7BuildPool } from "./cycle7Context";
import { cycle7QbCatalogForClass, cycle7QbClass, cycle7QbDisplayName, cycle7QbNextBag, cycle7QbPolicyEntryForSetup, cycle7QbRecommendationRank, cycle7QbRuntimeBundle, cycle7QbSourceOrder } from "./cycle7QbCatalog";
import { conditionMatches, evaluateSelectionPolicy, type PolicyEvaluation, type SetupSelectionRule, type StructuredSetupPolicy } from "./policy";
import { findBuildPlan, findBuildPlanCooperative, type BuildPlan, type CooperativeSearchControl, type ReachabilityCache } from "./reachability";
import { canonicalLabeledMirrorGeometryKey } from "./logicalGrouping";
import { mirrorPiece } from "./mirror";
import type { SetupVariant } from "./schema";

export interface SetupQuery {
  cycle: Cycle;
  board: Board;
  active: Piece;
  hold: Piece | null;
  next: Piece[];
  holdAvailable?: boolean;
  /** 전수조사 등에서 전체 반환 수를 명시적으로 제한한다. UI 기본 그룹 한도보다 우선한다. */
  maxCandidates?: number;
}

export interface SetupCandidate {
  setup: SetupVariant;
  plan: BuildPlan;
  score: readonly number[];
  reasons: string[];
  policy?: {
    ruleId: string;
    branchId: string;
    preferred: boolean;
  };
  qbCondition?: string;
  /** Final PC save targets attached to a Cycle-2 advanced QB recommendation. */
  qbSaveTargets?: Piece[];
  /** Source-defined chance of entering a good Cycle 8; this is not a PC solve rate. */
  goodCycle8EntryRate?: number;
}

export interface StagedSetupResolution {
  ruleId: string;
  branchId: string;
  observation: Piece[];
  action: "extend-setup" | "solve-from-precondition";
  instruction: string;
  candidate?: SetupCandidate;
}

export function candidateScore(setup: SetupVariant): readonly number[] {
  return [
    setup.solveRate === undefined ? Number.MAX_SAFE_INTEGER : -setup.solveRate,
    -(setup.priority ?? 0),
    setup.difficulty,
    setup.saves === undefined ? Number.MAX_SAFE_INTEGER : -setup.saves,
  ];
}

export function compareScores(a: SetupCandidate, b: SetupCandidate): number {
  const difference = compareScoreValues(a.score, b.score);
  return difference || a.setup.id.localeCompare(b.setup.id);
}

/**
 * Groups with this prefix describe one source hierarchy whose members are
 * alternative completion stages. Unlike ordinary recommendation groups, all
 * members must reach BFS before the highest buildable stage can be selected.
 */
export const HIGHEST_BUILDABLE_STAGE_GROUP_PREFIX = "stage:";

export function isHighestBuildableStageRecommendationGroup(group: string | undefined): boolean {
  return group?.startsWith(HIGHEST_BUILDABLE_STAGE_GROUP_PREFIX) ?? false;
}

export function retainHighestBuildableRecommendationStages(
  candidates: SetupCandidate[],
): SetupCandidate[] {
  const maximumStageByGroup = new Map<string, number>();
  for (const { setup } of candidates) {
    const group = setup.recommendationGroup;
    if (!isHighestBuildableStageRecommendationGroup(group)) continue;
    maximumStageByGroup.set(group!, Math.max(
      maximumStageByGroup.get(group!) ?? 0,
      setup.placements.length,
    ));
  }
  const seenPhysicalFormsByChild = new Set<string>();
  return candidates.filter(({ setup }) => {
    const group = setup.recommendationGroup;
    if (!isHighestBuildableStageRecommendationGroup(group)) return true;
    if (setup.placements.length !== maximumStageByGroup.get(group!)) return false;
    const childKey = `${group}|${canonicalSourceSetupId(setup)}`;
    if (seenPhysicalFormsByChild.has(childKey)) return false;
    seenPhysicalFormsByChild.add(childKey);
    return true;
  });
}

function compareScoreValues(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function canonicalSourceSetupId(setup: SetupVariant): string {
  return setup.id.split("--box-")[0].replace(/--mirror$/, "");
}

/**
 * 같은 원본에서 파생된 좌우 미러가 동일한 확률로 추천될 때는 위치만 다른
 * 선택지이므로 UI에 하나만 노출한다. 확률이 없거나 서로 다르면 별도 후보로
 * 유지해 방향별 도달성/퍼클률 차이를 숨기지 않는다.
 */
function equalRateMirrorRecommendationKey(
  setup: SetupVariant,
  policyEvaluation?: PolicyEvaluation | null,
): string | null {
  const hasMirrorRelation = setup.mirrorOf !== undefined
    || setup.mirroredVariantId !== undefined
    || isMirroredRuntimeVariant(setup);
  if (!hasMirrorRelation || setup.solveRate === undefined) return null;
  // A conditional orientation must not be chosen arbitrarily before its observation is visible.
  if (policyEvaluation?.branchId === "unobserved") return null;
  const policyScope = policyEvaluation
    ? `${policyEvaluation.ruleId}|${policyEvaluation.branchId}`
    : "unconditional";
  return `${setup.cycle}|${setup.family}|${canonicalLabeledMirrorGeometryKey(setup)}|${setup.solveRate}|${policyScope}`;
}

function isMirroredRuntimeVariant(setup: SetupVariant): boolean {
  return setup.id.split("--box-")[0].endsWith("--mirror");
}

function stagedRules(policy?: StructuredSetupPolicy): SetupSelectionRule[] {
  return policy?.selectionRules.filter((rule) =>
    rule.observation.runtimeSource === "visible-next-tail-after-precondition"
      && (rule.preconditionSetupIds?.length ?? 0) > 0) ?? [];
}

function cycle3InitialStageCatalog(
  catalog: SetupVariant[],
  policy?: StructuredSetupPolicy,
): SetupVariant[] {
  const continuationIds = new Set(stagedRules(policy).flatMap((rule) => [
    ...rule.branches.flatMap((branch) => branch.continuationSetupIds ?? []),
    ...(rule.default?.continuationSetupIds ?? []),
  ]));
  return catalog.filter((setup) => !continuationIds.has(canonicalSourceSetupId(setup)));
}

function continuationRemainder(setup: SetupVariant, board: Board): SetupVariant | null {
  const targets = new Map(setup.placements.flatMap((placement) =>
    placement.cells.map(({ x, y }) => [`${x},${y}`, placement.piece] as const)));
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      const piece = board[y][x];
      if (piece && targets.get(`${x},${y}`) !== piece) return null;
    }
  }
  const remaining = setup.placements.filter((placement) =>
    !placement.cells.every(({ x, y }) => board[y]?.[x] === placement.piece));
  if (remaining.length === 0 || remaining.length === setup.placements.length) return null;
  return { ...setup, placements: remaining, pieceSignature: remaining.map(({ piece }) => piece).sort() };
}

/**
 * 공통 2P/3P 선행 셋업이 완성된 직후, 현재 보이는 NEXT 꼬리에서 다음 가방
 * prefix를 읽어 QB/OQB의 연장 geometry 또는 즉시 해법 전환을 결정한다.
 */
export function resolveCycle3StagedSetup(
  query: SetupQuery,
  precondition: SetupVariant,
): StagedSetupResolution | null {
  if (query.cycle !== 3) return null;
  const sourceId = canonicalSourceSetupId(precondition);
  const classPiece: Piece | null = sourceId.startsWith("cycle3-extra-t-") ? "T" : query.hold;
  if (!classPiece) return null;
  const policy = setupPolicyForCycle(3, classPiece);
  const rule = stagedRules(policy).find((candidate) => candidate.preconditionSetupIds?.includes(sourceId));
  if (!rule || query.next.length < rule.observation.length) return null;

  const visibleObservation = query.next.slice(-rule.observation.length);
  const sourceObservation = isMirroredRuntimeVariant(precondition)
    ? visibleObservation.map(mirrorPiece)
    : visibleObservation;
  const branch = rule.branches.find(({ when }) => conditionMatches(when, sourceObservation));
  const outcome = branch ?? rule.default;
  if (!outcome?.stagedAction) return null;
  const instruction = outcome.instruction
    ?? (outcome.stagedAction === "extend-setup" ? "Continue to the conditional setup." : "Use the solve from the completed base setup.");
  const base = {
    ruleId: rule.id,
    branchId: branch?.id ?? "default",
    observation: visibleObservation,
    action: outcome.stagedAction,
    instruction,
  } as const;
  if (outcome.stagedAction === "solve-from-precondition") return base;

  const continuationIds = new Set(outcome.continuationSetupIds ?? []);
  const classCatalog = setupsForCycle3Class(classPiece);
  const candidates: SetupCandidate[] = [];
  for (const setup of classCatalog) {
    if (!continuationIds.has(canonicalSourceSetupId(setup))) continue;
    const remainder = continuationRemainder(setup, query.board);
    if (!remainder) continue;
    const plan = findBuildPlan(
      remainder,
      query.board,
      query.active,
      query.hold,
      query.next,
      query.holdAvailable ?? true,
      query.next.length,
    );
    if (!plan) continue;
    candidates.push({
      setup,
      plan,
      score: [-1, ...candidateScore(setup)],
      reasons: [
        `Extend the shared setup to this form for OQB branch ${visibleObservation.join("")}.`,
        plan.holds === 0 ? "Continue without HOLD." : `Continue with ${plan.holds} HOLD${plan.holds === 1 ? "" : "s"}.`,
      ],
      policy: { ruleId: rule.id, branchId: branch?.id ?? "default", preferred: true },
    });
  }
  const candidate = candidates.sort(compareScores)[0];
  return { ...base, candidate };
}

const PIECE_COUNT_SECTION_CYCLES = new Set<Cycle>([1, 2, 3, 5, 6, 7]);
const FOUR_PLUS_CANDIDATE_LIMIT = 8;
const THREE_P_CANDIDATE_LIMIT = 4;
const OTHER_P_CANDIDATE_LIMIT = 8;
const QB_CANDIDATE_LIMIT = 8;
export function splitsSetupCandidatesByPieceCount(cycle: Cycle): boolean {
  return PIECE_COUNT_SECTION_CYCLES.has(cycle);
}

/**
 * UI 대상 회차는 전역 정렬 순서를 유지하면서 P 수별 한도를 독립 적용한다.
 * 따라서 높은 순위의 4P+ 후보가 많아도 3P 후보 최대 4개가 잘리지 않는다.
 */
export function limitSetupCandidatesForCycle(
  candidates: SetupCandidate[],
  cycle: Cycle,
  maxCandidates?: number,
): SetupCandidate[] {
  if (maxCandidates !== undefined) return candidates.slice(0, maxCandidates);
  if (!splitsSetupCandidatesByPieceCount(cycle)) return candidates;

  let fourPlusCount = 0;
  let threePCount = 0;
  let otherCount = 0;
  let qbCount = 0;
  return candidates.filter(({ setup, qbCondition }) => {
    // QB is rendered in its own section and must not consume the ordinary 3P
    // quota before the UI projection separates the sections.
    if (qbCondition !== undefined) {
      qbCount += 1;
      return qbCount <= QB_CANDIDATE_LIMIT;
    }
    const pieceCount = setup.placements.length;
    if (pieceCount >= 4) {
      fourPlusCount += 1;
      return fourPlusCount <= FOUR_PLUS_CANDIDATE_LIMIT;
    }
    if (pieceCount === 3) {
      threePCount += 1;
      return threePCount <= THREE_P_CANDIDATE_LIMIT;
    }
    otherCount += 1;
    return otherCount <= OTHER_P_CANDIDATE_LIMIT;
  });
}

export function querySetups(query: SetupQuery): SetupCandidate[] {
  const catalog = setupsForCycle(query.cycle);
  if (query.cycle === 1) {
    const context = cycle1QueueContext(query);
    if (!context || !isNormalCycle1Context(context)) return [];
    return limitSetupCandidatesForCycle(queryCatalog(catalog, query), 1, query.maxCandidates);
  }
  if (query.cycle === 2) {
    const context = cycle2QueueContext(query);
    if (!context) return [];
    const policy = setupPolicyForCycle(2);
    const generalCatalog = setupsForCycle2General();
    const advanced3pCatalog = setupsForCycle2Advanced3P();
    const buildableGeneral = generalCatalog.filter((setup) =>
      fitsCycle2BuildPool(setup, context.buildPieces, policy));
    const generalCandidates = limitSetupCandidatesForCycle(queryCatalogInternal(
      buildableGeneral,
      { ...query, next: context.searchNext },
      policy,
      context.policyPrefix,
      generalCatalog,
      context.placeableNextCount,
    ), 2, query.maxCandidates);

    const buildableAdvanced3p = advanced3pCatalog.filter((setup) =>
      fitsCycle2BuildPool(setup, context.buildPieces, policy));
    const advanced3pCandidates = limitSetupCandidatesForCycle(queryCatalogInternal(
      buildableAdvanced3p,
      { ...query, next: context.searchNext },
      policy,
      context.policyPrefix,
      advanced3pCatalog,
      context.placeableNextCount,
      query.maxCandidates ?? THREE_P_CANDIDATE_LIMIT,
    ), 2, query.maxCandidates);

    const qbBundle = cycle2AdvancedQbRuntimeBundle();
    if (!qbBundle || !context.policyPrefix) {
      const combined = [...generalCandidates, ...advanced3pCandidates];
      return query.maxCandidates === undefined ? combined : combined.slice(0, query.maxCandidates);
    }
    const selections = selectCycle2AdvancedQbSetups(
      qbBundle.setups,
      qbBundle.policy,
      context.buildPieces,
      context.policyPrefix,
      { deferRankSelectionUntilBuildable: true },
    );
    if (selections.length === 0) {
      const combined = [...generalCandidates, ...advanced3pCandidates];
      return query.maxCandidates === undefined ? combined : combined.slice(0, query.maxCandidates);
    }

    const selectionById = new Map(selections.map((selection) => [selection.setup.id, selection]));
    const qbCatalog = selections.map(({ setup }) => setup);
    const buildableQbCandidates = queryCatalogInternal(
      qbCatalog,
      { ...query, next: context.searchNext },
      undefined,
      undefined,
      qbCatalog,
      context.placeableNextCount,
    ).map((candidate) => {
      const selection = selectionById.get(candidate.setup.id);
      if (!selection) return candidate;
      const conditionLabel = cycle2AdvancedQbConditionLabel(
        selection.entry,
        selection.mirroredGeometry,
      );
      return {
        ...candidate,
        score: [-2, selection.conditionRank, selection.entry.sourceOrder, ...candidate.score],
        reasons: [
          `${selection.classInfo.actualPool} Cycle 2 QB · ${conditionLabel}`,
          ...(selection.entry.runtimeCondition?.guidance
            ? [selection.entry.runtimeCondition.guidance]
            : []),
          "Builds only the source QB's initial 3P/4P baseline; continuation guidance is currently deferred.",
          ...candidate.reasons,
        ],
        qbCondition: conditionLabel,
        qbSaveTargets: cycle2AdvancedQbSaveTargets(
          selection.entry,
          selection.mirroredGeometry,
        ),
      };
    });
    // Return every matching specific QB that survives real reachability. The
    // compact condition rank orders candidates; it must not discard a broader
    // condition that is also true. Fallback entries remain exclusive.
    const buildableSpecificQbCandidates = buildableQbCandidates.filter(({ setup }) =>
      selectionById.get(setup.id)?.fallbackCondition === false);
    const qbCandidates = (buildableSpecificQbCandidates.length > 0
      ? buildableSpecificQbCandidates
      : buildableQbCandidates.filter(({ setup }) =>
        selectionById.get(setup.id)?.fallbackCondition === true))
      .sort(compareScores)
      .slice(0, query.maxCandidates ?? 8);

    // Cycle 2 catalog tiers are normative: general 4P, advanced 3P, then QB.
    // QB solve rates are implicitly 100% and therefore do not need a synthetic metric here.
    const combined = [...generalCandidates, ...advanced3pCandidates, ...qbCandidates];
    return query.maxCandidates === undefined ? combined : combined.slice(0, query.maxCandidates);
  }
  if (query.cycle === 3) {
    const context = cycle3QueueContext(query);
    if (!context) return [];
    const classCatalog = setupsForCycle3Class(context.classPiece);
    const policy = setupPolicyForCycle(3, context.classPiece);
    const initialCatalog = cycle3InitialStageCatalog(classCatalog, policy);
    const buildableSignatures = initialCatalog.filter((setup) =>
      fitsCycle3BuildPool(setup, context.buildPieces));
    return limitSetupCandidatesForCycle(queryCatalogInternal(
      buildableSignatures,
      { ...query, next: context.searchNext },
      policy,
      context.policyPrefix,
      initialCatalog,
      context.placeableNextCount,
      query.maxCandidates,
    ), 3, query.maxCandidates);
  }
  if (query.cycle === 4) {
    const context = cycle4QueueContext(query);
    if (!context || context.classificationMode === "duplicate-pool-unsupported") return [];
    const classCatalog = setupsForCycle4Class(context.missingPieces);
    const buildableSignatures = classCatalog.filter((setup) =>
      fitsCycle4BuildPool(setup, context.buildPieces));
    const classLabel = cycle4ClassLabel(context.missingPieces) ?? formatPieceSetForDisplay(context.missingPieces);
    return queryCatalogInternal(
      buildableSignatures,
      { ...query, next: context.searchNext },
      undefined,
      undefined,
      classCatalog,
      context.placeableNextCount,
    ).map((candidate) => ({
      ...candidate,
      reasons: [`Classified as Cycle 4 No ${classLabel} from the first five pieces.`, ...candidate.reasons],
    })).sort(compareScores).slice(0, query.maxCandidates ?? 8);
  }
  if (query.cycle === 5) {
    const context = cycle5QueueContext(query);
    if (!context || context.classificationMode === "duplicate-pair-unsupported") return [];
    return queryCycle5ClassCatalog(setupsForCycle5Class(context.classPieces), query);
  }
  if (query.cycle === 6) {
    const context = cycle6QueueContext(query);
    if (!context || context.classificationMode === "duplicate-pool-unsupported") return [];
    const candidates = context.classPieces.flatMap((classPiece) => {
      const classCatalog = setupsForCycle6Class(classPiece);
      const buildableSignatures = classCatalog.filter((setup) =>
        fitsCycle6BuildPool(setup, context.buildPieces));
      if (buildableSignatures.length === 0) return [];
      return queryCatalogInternal(
        buildableSignatures,
        { ...query, next: context.searchNext },
        setupPolicyForCycle(6, classPiece),
        undefined,
        classCatalog,
        context.placeableNextCount,
      ).map((candidate) => ({
        ...candidate,
        reasons: [
          `Classified as Cycle 6 No ${classPiece} from the first six pieces.`,
          ...candidate.reasons,
        ],
      }));
    }).sort(compareScores);

    const seenIds = new Set<string>();
    const seenGroups = new Set<string>();
    const uniqueCandidates = candidates.filter(({ setup }) => {
      if (seenIds.has(setup.id)) return false;
      if (setup.recommendationGroup && seenGroups.has(setup.recommendationGroup)) return false;
      seenIds.add(setup.id);
      if (setup.recommendationGroup) seenGroups.add(setup.recommendationGroup);
      return true;
    });
    return limitSetupCandidatesForCycle(uniqueCandidates, 6, query.maxCandidates);
  }
  if (query.cycle === 7) {
    const context = cycle7QueueContext(query);
    if (!context) return [];
    const qbClass = cycle7QbClass(context.buildPieces);
    const nextBag = query.hold === null ? null : cycle7QbNextBag(query.next);
    const qbBundle = cycle7QbRuntimeBundle();
    let qbCandidates: SetupCandidate[] = [];
    if (qbBundle && qbClass && nextBag) {
      const qbCatalog = cycle7QbCatalogForClass(qbClass);
      const rankedSetups = qbCatalog.flatMap((setup) => {
        const entry = cycle7QbPolicyEntryForSetup(setup);
        if (!entry) return [];
        return [{
          setup,
          conditionRank: cycle7QbRecommendationRank(qbClass, entry, nextBag, setup),
        }];
      }).filter(({ conditionRank }) => Number.isFinite(conditionRank));
      const conditionRanks = [...new Set(rankedSetups.map(({ conditionRank }) => conditionRank))]
        .sort((left, right) => left - right);
      // Try the earliest satisfied QB condition first. If every geometry in that
      // tier fails BFS, continue to the next-fastest condition before falling
      // back to the general/3P catalogs.
      for (const conditionRank of conditionRanks) {
        const selectedQbCatalog = rankedSetups
          .filter((ranked) => ranked.conditionRank === conditionRank)
          .map(({ setup }) => setup);
        const buildableAtRank = queryCatalogInternal(
          selectedQbCatalog,
          query,
          undefined,
          undefined,
          selectedQbCatalog,
          context.placeableNextCount,
        );
        if (buildableAtRank.length === 0) continue;
        qbCandidates = buildableAtRank.map((candidate) => {
          const entry = cycle7QbPolicyEntryForSetup(candidate.setup);
          return {
            ...candidate,
            setup: entry ? { ...candidate.setup, displayName: cycle7QbDisplayName(qbClass, entry, candidate.setup) } : candidate.setup,
            score: [-2, conditionRank, ...candidate.score],
            reasons: [
              `${qbClass} Cycle 7 QB · ${entry?.runtimeDescription ?? entry?.conditionLabel ?? "QB condition"}`,
              "Builds only the source QB's initial 3P baseline; continuation guidance is currently deferred.",
              ...candidate.reasons,
            ],
            qbCondition: entry?.conditionLabel,
          };
        }).sort((left, right) => cycle7QbSourceOrder(left.setup) - cycle7QbSourceOrder(right.setup) || compareScores(left, right));
        break;
      }
    }
    const policy = setupPolicyForCycle(7);
    const buildableSignatures = catalog.filter((setup) =>
      fitsCycle7BuildPool(setup, context.buildPieces, policy));
    const standardCandidates = queryCatalogInternal(
      buildableSignatures,
      { ...query, next: context.searchNext },
      policy,
      undefined,
      catalog,
      context.placeableNextCount,
    );

    const advanced4pBundle = cycle7Advanced4pRuntimeBundle();
    const advanced4pMatches = advanced4pBundle
      ? cycle7Advanced4pMatches(
          context.buildPieces,
          context.searchNext,
          context.placeableNextCount,
          advanced4pBundle,
        )
      : [];
    const advanced4pMatchById = new Map(advanced4pMatches.map((match) => [match.setup.id, match]));
    const advanced4pCandidates = advanced4pBundle
      ? [...new Set(advanced4pMatches.map(({ placeableNextCount }) => placeableNextCount))]
        .flatMap((placeableNextCount) => {
          const matchedCatalog = advanced4pMatches
            .filter((match) => match.placeableNextCount === placeableNextCount)
            .map(({ setup }) => setup);
          return queryCatalogInternal(
            matchedCatalog,
            { ...query, next: context.searchNext },
            advanced4pBundle.policy,
            undefined,
            advanced4pBundle.setups,
            placeableNextCount,
            undefined,
            (setup) => [
              -(cycle7Advanced4pGoodCycle8Rate(setup) ?? 0),
              ...candidateScore(setup),
            ],
          );
        }).map((candidate) => {
        const goodCycle8EntryRate = cycle7Advanced4pGoodCycle8Rate(candidate.setup);
        const savedPiece = advanced4pMatchById.get(candidate.setup.id)?.savedPieceAfterBuild;
        return {
          ...candidate,
          score: [-1, ...candidate.score],
          reasons: [
            "Advanced 4P setup built from the previous bag's three pieces and the selected fourth piece.",
            ...(savedPiece ? [`HOLD the first ${savedPiece} from the next bag and place NEXT[1].`] : []),
            ...(goodCycle8EntryRate === undefined
              ? []
              : [`Documented good Cycle 8 entry rate: ${goodCycle8EntryRate}%.`]),
            ...candidate.reasons,
          ],
          goodCycle8EntryRate,
        };
      }).sort(compareScores)
      : [];

    // Cycle 7 tiers: QB, normal 2P/3P, then advanced 4P.
    return limitSetupCandidatesForCycle(
      [...qbCandidates, ...standardCandidates, ...advanced4pCandidates],
      7,
      query.maxCandidates,
    );
  }
  return [];
}

/**
 * 승격 전/후의 5회차 class catalog를 주입해 실시간 BFS로 조회한다.
 *
 * class 파일 선택은 geometry record가 아니라 HOLD+ACTIVE의 순서 없는 두 미노로
 * 먼저 끝내야 한다. 이 함수는 선택된 한 class catalog만 받으므로, draft를 운영
 * catalog에 섞지 않고도 알고리즘을 검증할 수 있다. 정식 승격 후에는 catalog
 * router가 이 함수에 해당 pair의 source/mirror class만 전달한다.
 */
export function queryCycle5ClassCatalog(
  classCatalog: SetupVariant[],
  query: SetupQuery,
): SetupCandidate[] {
  if (query.cycle !== 5) return [];
  const context = cycle5QueueContext(query);
  if (!context || context.classificationMode === "duplicate-pair-unsupported") return [];

  const buildableSignatures = classCatalog.filter((setup) =>
    setup.cycle === 5
      && setup.runtimeEligible !== false
      && fitsCycle5BuildPool(setup, context.buildPieces));
  const classLabel = formatPieceSetForDisplay(context.classPieces, "/");
  const candidates = queryCatalogInternal(
    buildableSignatures,
    { ...query, next: context.searchNext },
    undefined,
    undefined,
    classCatalog,
    context.placeableNextCount,
  ).map((candidate) => ({
    ...candidate,
    reasons: [
      `Classified as Cycle 5 ${classLabel} from HOLD + ACTIVE.`,
      ...(candidate.setup.bestsave
        ? ["The source marks this as an unconditional Bestsave setup, so it always avoids Cycle 6 No T."]
        : []),
      ...candidate.reasons,
    ],
  })).sort(compareScores);

  const seenIds = new Set<string>();
  const seenGroups = new Set<string>();
  const uniqueCandidates = candidates.filter(({ setup }) => {
    if (seenIds.has(setup.id)) return false;
    if (setup.recommendationGroup
      && !isHighestBuildableStageRecommendationGroup(setup.recommendationGroup)
      && seenGroups.has(setup.recommendationGroup)) return false;
    seenIds.add(setup.id);
    if (setup.recommendationGroup
      && !isHighestBuildableStageRecommendationGroup(setup.recommendationGroup)) {
      seenGroups.add(setup.recommendationGroup);
    }
    return true;
  });
  return limitSetupCandidatesForCycle(uniqueCandidates, 5, query.maxCandidates);
}

/**
 * 아직 런타임 catalog에 통합하지 않은 외부 후보 배열을 조회한다.
 * Gemini 산출물은 이 함수를 사용하면 src/data를 수정하지 않고 검사할 수 있다.
 */
export function queryCatalog(catalog: SetupVariant[], query: SetupQuery): SetupCandidate[] {
  return queryCatalogInternal(catalog, query);
}

function queryCatalogInternal(
  catalog: SetupVariant[],
  query: SetupQuery,
  policy?: StructuredSetupPolicy,
  policyPrefix?: Piece[],
  policyCatalog: SetupVariant[] = catalog,
  placeableNextCount?: number,
  candidateLimit?: number,
  scoreForSetup?: (setup: SetupVariant) => readonly number[],
): SetupCandidate[] {
  const reachabilityCache: ReachabilityCache = new Map();
  const rankedSetups = catalog
    .filter((setup) => setup.cycle === query.cycle)
    .map((setup) => {
      const policyEvaluation = evaluateSelectionPolicy(policy, setup, policyCatalog, policyPrefix);
      const effectiveSetup = policyEvaluation?.solveRate === undefined
        ? setup
        : { ...setup, solveRate: policyEvaluation.solveRate };
      return {
        setup,
        effectiveSetup,
        policyEvaluation,
        score: [
          policyEvaluation?.preferred ? -1 : 0,
          ...(scoreForSetup?.(effectiveSetup) ?? candidateScore(effectiveSetup)),
        ],
      };
    })
    .sort((left, right) =>
      compareScoreValues(left.score, right.score)
      || left.setup.id.localeCompare(right.setup.id));

  const ranked: SetupCandidate[] = [];
  const seenRecommendationGroups = new Set<string>();
  const seenEqualRateMirrorRecommendations = new Set<string>();
  const hasHighestBuildableStageGroups = rankedSetups.some(({ setup }) =>
    isHighestBuildableStageRecommendationGroup(setup.recommendationGroup));
  for (const { setup, effectiveSetup, policyEvaluation, score } of rankedSetups) {
      // 같은 논리 셋업의 이동·회전형 중 하나를 이미 찾았다면 나머지 geometry는
      // UI에서 어차피 제거되므로 비싼 도달성 BFS를 반복하지 않는다.
      if (setup.recommendationGroup
        && !isHighestBuildableStageRecommendationGroup(setup.recommendationGroup)
        && seenRecommendationGroups.has(setup.recommendationGroup)) continue;
      const plan = findBuildPlan(
        setup,
        query.board,
        query.active,
        query.hold,
        query.next,
        query.holdAvailable ?? true,
        placeableNextCount,
        reachabilityCache,
      );
      if (!plan) continue;
      const mirrorRecommendationKey = equalRateMirrorRecommendationKey(effectiveSetup, policyEvaluation);
      if (mirrorRecommendationKey && seenEqualRateMirrorRecommendations.has(mirrorRecommendationKey)) continue;
      if (setup.recommendationGroup
        && !isHighestBuildableStageRecommendationGroup(setup.recommendationGroup)) {
        seenRecommendationGroups.add(setup.recommendationGroup);
      }
      if (mirrorRecommendationKey) seenEqualRateMirrorRecommendations.add(mirrorRecommendationKey);
      const reasons = [`User priority: ${setup.priority ?? 0}.`];
      if (policyEvaluation) reasons.push(policyEvaluation.reason);
      else if (!policy) reasons.push("Candidate before cycle-specific recommendation policy.");
      reasons.push(plan.holds === 0 ? "Buildable without HOLD." : `Buildable with ${plan.holds} HOLD${plan.holds === 1 ? "" : "s"}.`);
      if (effectiveSetup.solveRate !== undefined) {
        reasons.push(`${policyEvaluation?.solveRate !== undefined ? "Conditional" : "Documented"} PC rate: ${effectiveSetup.solveRate}%.`);
      }
      if (effectiveSetup.saves !== undefined) {
        reasons.push(effectiveSetup.saveMetricKind === "project-priority"
          ? `Project default save priority: ${effectiveSetup.saves}.`
          : `Documented Saves: ${effectiveSetup.saves}%.`);
      }
      if (setup.reviewStatus === "draft") reasons.push("Geometry data is an unreviewed draft.");
      ranked.push({
        setup: effectiveSetup,
        plan,
        score,
        reasons,
        policy: policyEvaluation ? {
          ruleId: policyEvaluation.ruleId,
          branchId: policyEvaluation.branchId,
          preferred: policyEvaluation.preferred,
        } : undefined,
      });
      if (!hasHighestBuildableStageGroups && candidateLimit !== undefined && ranked.length >= candidateLimit) break;
  }
  const projected = retainHighestBuildableRecommendationStages(ranked).sort(compareScores);
  return candidateLimit === undefined ? projected : projected.slice(0, candidateLimit);
}

/** Cooperative counterpart used only by browser recommendation Workers. */
export async function queryCatalogCooperative(
  catalog: SetupVariant[],
  query: SetupQuery,
  control: CooperativeSearchControl,
  policy?: StructuredSetupPolicy,
  policyPrefix?: Piece[],
  policyCatalog: SetupVariant[] = catalog,
  placeableNextCount?: number,
  candidateLimit?: number,
  scoreForSetup?: (setup: SetupVariant) => readonly number[],
): Promise<SetupCandidate[]> {
  const reachabilityCache: ReachabilityCache = new Map();
  const rankedSetups = catalog
    .filter((setup) => setup.cycle === query.cycle)
    .map((setup) => {
      const policyEvaluation = evaluateSelectionPolicy(policy, setup, policyCatalog, policyPrefix);
      const effectiveSetup = policyEvaluation?.solveRate === undefined
        ? setup
        : { ...setup, solveRate: policyEvaluation.solveRate };
      return {
        setup,
        effectiveSetup,
        policyEvaluation,
        score: [
          policyEvaluation?.preferred ? -1 : 0,
          ...(scoreForSetup?.(effectiveSetup) ?? candidateScore(effectiveSetup)),
        ],
      };
    })
    .sort((left, right) =>
      compareScoreValues(left.score, right.score)
      || left.setup.id.localeCompare(right.setup.id));

  const ranked: SetupCandidate[] = [];
  const seenRecommendationGroups = new Set<string>();
  const seenEqualRateMirrorRecommendations = new Set<string>();
  const hasHighestBuildableStageGroups = rankedSetups.some(({ setup }) =>
    isHighestBuildableStageRecommendationGroup(setup.recommendationGroup));
  for (const { setup, effectiveSetup, policyEvaluation, score } of rankedSetups) {
    if (setup.recommendationGroup
      && !isHighestBuildableStageRecommendationGroup(setup.recommendationGroup)
      && seenRecommendationGroups.has(setup.recommendationGroup)) continue;
    const plan = await findBuildPlanCooperative(
      setup,
      query.board,
      query.active,
      query.hold,
      query.next,
      query.holdAvailable ?? true,
      placeableNextCount,
      reachabilityCache,
      control,
    );
    if (!plan) continue;
    const mirrorRecommendationKey = equalRateMirrorRecommendationKey(effectiveSetup, policyEvaluation);
    if (mirrorRecommendationKey && seenEqualRateMirrorRecommendations.has(mirrorRecommendationKey)) continue;
    if (setup.recommendationGroup
      && !isHighestBuildableStageRecommendationGroup(setup.recommendationGroup)) {
      seenRecommendationGroups.add(setup.recommendationGroup);
    }
    if (mirrorRecommendationKey) seenEqualRateMirrorRecommendations.add(mirrorRecommendationKey);
    const reasons = [`User priority: ${setup.priority ?? 0}.`];
    if (policyEvaluation) reasons.push(policyEvaluation.reason);
    else if (!policy) reasons.push("Candidate before cycle-specific recommendation policy.");
    reasons.push(plan.holds === 0 ? "Buildable without HOLD." : `Buildable with ${plan.holds} HOLD${plan.holds === 1 ? "" : "s"}.`);
    if (effectiveSetup.solveRate !== undefined) {
      reasons.push(`${policyEvaluation?.solveRate !== undefined ? "Conditional" : "Documented"} PC rate: ${effectiveSetup.solveRate}%.`);
    }
    if (effectiveSetup.saves !== undefined) {
      reasons.push(effectiveSetup.saveMetricKind === "project-priority"
        ? `Project default save priority: ${effectiveSetup.saves}.`
        : `Documented Saves: ${effectiveSetup.saves}%.`);
    }
    if (setup.reviewStatus === "draft") reasons.push("Geometry data is an unreviewed draft.");
    ranked.push({
      setup: effectiveSetup,
      plan,
      score,
      reasons,
      policy: policyEvaluation ? {
        ruleId: policyEvaluation.ruleId,
        branchId: policyEvaluation.branchId,
        preferred: policyEvaluation.preferred,
      } : undefined,
    });
    if (!hasHighestBuildableStageGroups && candidateLimit !== undefined && ranked.length >= candidateLimit) break;
  }
  const projected = retainHighestBuildableRecommendationStages(ranked).sort(compareScores);
  return candidateLimit === undefined ? projected : projected.slice(0, candidateLimit);
}
