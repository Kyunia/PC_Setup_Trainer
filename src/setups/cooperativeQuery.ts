import type { Piece } from "../engine/types";
import { formatPieceSetForDisplay } from "../engine/pieceDisplay";
import {
  setupPolicyForCycle,
  setupsForCycle,
  setupsForCycle2Advanced3P,
  setupsForCycle2General,
  setupsForCycle3Class,
  setupsForCycle4Class,
  setupsForCycle5Class,
  setupsForCycle6Class,
} from "./catalog";
import { cycle1QueueContext, isNormalCycle1Context } from "./cycle1Context";
import { cycle2AdvancedQbConditionLabel, cycle2AdvancedQbSaveTargets, selectCycle2AdvancedQbSetups } from "./cycle2AdvancedQb";
import { cycle2AdvancedQbRuntimeBundle } from "./cycle2AdvancedQbCatalog";
import { cycle2QueueContext, fitsCycle2BuildPool } from "./cycle2Context";
import { cycle3QueueContext, fitsCycle3BuildPool } from "./cycle3Context";
import { cycle4ClassLabel } from "./cycle4Catalog";
import { cycle4QueueContext, fitsCycle4BuildPool } from "./cycle4Context";
import { cycle5QueueContext, fitsCycle5BuildPool } from "./cycle5Context";
import { cycle6QueueContext, fitsCycle6BuildPool } from "./cycle6Context";
import { cycle7Advanced4pGoodCycle8Rate, cycle7Advanced4pMatches, cycle7Advanced4pRuntimeBundle } from "./cycle7Advanced4pCatalog";
import { cycle7QueueContext, fitsCycle7BuildPool } from "./cycle7Context";
import {
  cycle7QbCatalogForClass,
  cycle7QbClass,
  cycle7QbDisplayName,
  cycle7QbNextBag,
  cycle7QbPolicyEntryForSetup,
  cycle7QbRecommendationRank,
  cycle7QbRuntimeBundle,
  cycle7QbSourceOrder,
} from "./cycle7QbCatalog";
import {
  candidateScore,
  compareScores,
  isHighestBuildableStageRecommendationGroup,
  limitSetupCandidatesForCycle,
  queryCatalogCooperative,
  type SetupCandidate,
  type SetupQuery,
} from "./query";
import type { CooperativeSearchControl } from "./reachability";
import type { SetupVariant } from "./schema";
import type { StructuredSetupPolicy } from "./policy";

export type RecommendationStage = "primary" | "secondary";

export interface StagedRecommendationResult {
  stage: RecommendationStage;
  candidates: SetupCandidate[];
  preferredCandidateId: string | null;
  complete: boolean;
}

export type RecommendationStageReceiver = (result: StagedRecommendationResult) => void;

function canonicalSourceSetupId(setup: SetupVariant): string {
  return setup.id.split("--box-")[0].replace(/--mirror$/, "");
}

function cycle3InitialStageCatalog(
  catalog: SetupVariant[],
  policy?: StructuredSetupPolicy,
): SetupVariant[] {
  const stagedRules = policy?.selectionRules.filter((rule) =>
    rule.observation.runtimeSource === "visible-next-tail-after-precondition"
      && (rule.preconditionSetupIds?.length ?? 0) > 0) ?? [];
  const continuationIds = new Set(stagedRules.flatMap((rule) => [
    ...rule.branches.flatMap((branch) => branch.continuationSetupIds ?? []),
    ...(rule.default?.continuationSetupIds ?? []),
  ]));
  return catalog.filter((setup) => !continuationIds.has(canonicalSourceSetupId(setup)));
}

function limitCombined(candidates: SetupCandidate[], query: SetupQuery): SetupCandidate[] {
  return query.maxCandidates === undefined ? candidates : candidates.slice(0, query.maxCandidates);
}

async function queryCycle2QbCandidates(
  query: SetupQuery,
  control: CooperativeSearchControl,
  priorityOnly: boolean,
): Promise<SetupCandidate[]> {
  const context = cycle2QueueContext(query);
  const qbBundle = cycle2AdvancedQbRuntimeBundle();
  if (!context || !qbBundle || !context.policyPrefix) return [];
  const selections = selectCycle2AdvancedQbSetups(
    qbBundle.setups,
    qbBundle.policy,
    context.buildPieces,
    context.policyPrefix,
    { deferRankSelectionUntilBuildable: true },
  ).filter(({ setup }) => !priorityOnly || setup.priority === 100);
  if (selections.length === 0) return [];
  const selectionById = new Map(selections.map((selection) => [selection.setup.id, selection]));
  const qbCatalog = selections.map(({ setup }) => setup);
  const buildable = (await queryCatalogCooperative(
    qbCatalog,
    { ...query, next: context.searchNext },
    control,
    undefined,
    undefined,
    qbCatalog,
    context.placeableNextCount,
  )).map((candidate) => {
    const selection = selectionById.get(candidate.setup.id);
    if (!selection) return candidate;
    const conditionLabel = cycle2AdvancedQbConditionLabel(selection.entry, selection.mirroredGeometry);
    return {
      ...candidate,
      score: [-2, selection.conditionRank, selection.entry.sourceOrder, ...candidate.score],
      reasons: [
        `${selection.classInfo.actualPool} Cycle 2 QB · ${conditionLabel}`,
        ...(selection.entry.runtimeCondition?.guidance ? [selection.entry.runtimeCondition.guidance] : []),
        "Builds only the source QB's initial 3P/4P baseline; continuation guidance is currently deferred.",
        ...candidate.reasons,
      ],
      qbCondition: conditionLabel,
      qbSaveTargets: cycle2AdvancedQbSaveTargets(selection.entry, selection.mirroredGeometry),
    };
  });
  const specific = buildable.filter(({ setup }) => selectionById.get(setup.id)?.fallbackCondition === false);
  return (specific.length > 0
    ? specific
    : buildable.filter(({ setup }) => selectionById.get(setup.id)?.fallbackCondition === true))
    .sort(compareScores)
    .slice(0, query.maxCandidates ?? 8);
}

async function queryCycle7QbCandidates(
  query: SetupQuery,
  control: CooperativeSearchControl,
): Promise<SetupCandidate[]> {
  const context = cycle7QueueContext(query);
  if (!context) return [];
  const qbClass = cycle7QbClass(context.buildPieces);
  const nextBag = query.hold === null ? null : cycle7QbNextBag(query.next);
  if (!cycle7QbRuntimeBundle() || !qbClass || !nextBag) return [];
  const rankedSetups = cycle7QbCatalogForClass(qbClass).flatMap((setup) => {
    const entry = cycle7QbPolicyEntryForSetup(setup);
    if (!entry) return [];
    return [{ setup, conditionRank: cycle7QbRecommendationRank(qbClass, entry, nextBag, setup) }];
  }).filter(({ conditionRank }) => Number.isFinite(conditionRank));
  const ranks = [...new Set(rankedSetups.map(({ conditionRank }) => conditionRank))]
    .sort((left, right) => left - right);
  for (const conditionRank of ranks) {
    const selectedCatalog = rankedSetups
      .filter((ranked) => ranked.conditionRank === conditionRank)
      .map(({ setup }) => setup);
    const buildable = await queryCatalogCooperative(
      selectedCatalog,
      query,
      control,
      undefined,
      undefined,
      selectedCatalog,
      context.placeableNextCount,
    );
    if (buildable.length === 0) continue;
    return buildable.map((candidate) => {
      const entry = cycle7QbPolicyEntryForSetup(candidate.setup);
      return {
        ...candidate,
        setup: entry
          ? { ...candidate.setup, displayName: cycle7QbDisplayName(qbClass, entry, candidate.setup) }
          : candidate.setup,
        score: [-2, conditionRank, ...candidate.score],
        reasons: [
          `${qbClass} Cycle 7 QB · ${entry?.runtimeDescription ?? entry?.conditionLabel ?? "QB condition"}`,
          "Builds only the source QB's initial 3P baseline; continuation guidance is currently deferred.",
          ...candidate.reasons,
        ],
        qbCondition: entry?.conditionLabel,
      };
    }).sort((left, right) =>
      cycle7QbSourceOrder(left.setup) - cycle7QbSourceOrder(right.setup)
      || compareScores(left, right));
  }
  return [];
}

async function queryCycle7AdvancedCandidates(
  query: SetupQuery,
  control: CooperativeSearchControl,
): Promise<SetupCandidate[]> {
  const context = cycle7QueueContext(query);
  const bundle = cycle7Advanced4pRuntimeBundle();
  if (!context || !bundle) return [];
  const matches = cycle7Advanced4pMatches(
    context.buildPieces,
    context.searchNext,
    context.placeableNextCount,
    bundle,
  );
  const matchById = new Map(matches.map((match) => [match.setup.id, match]));
  const candidates: SetupCandidate[] = [];
  for (const placeableNextCount of [...new Set(matches.map((match) => match.placeableNextCount))]) {
    const matchedCatalog = matches
      .filter((match) => match.placeableNextCount === placeableNextCount)
      .map(({ setup }) => setup);
    candidates.push(...await queryCatalogCooperative(
      matchedCatalog,
      { ...query, next: context.searchNext },
      control,
      bundle.policy,
      undefined,
      bundle.setups,
      placeableNextCount,
      undefined,
      (setup) => [-(cycle7Advanced4pGoodCycle8Rate(setup) ?? 0), ...candidateScore(setup)],
    ));
  }
  return candidates.map((candidate) => {
    const goodCycle8EntryRate = cycle7Advanced4pGoodCycle8Rate(candidate.setup);
    const savedPiece = matchById.get(candidate.setup.id)?.savedPieceAfterBuild;
    return {
      ...candidate,
      score: [-1, ...candidate.score],
      reasons: [
        "Advanced 4P setup built from the previous bag's three pieces and the selected fourth piece.",
        ...(savedPiece ? [`HOLD the first ${savedPiece} from the next bag and place NEXT[1].`] : []),
        ...(goodCycle8EntryRate === undefined ? [] : [`Documented good Cycle 8 entry rate: ${goodCycle8EntryRate}%.`]),
        ...candidate.reasons,
      ],
      goodCycle8EntryRate,
    };
  }).sort(compareScores);
}

async function querySingleStage(
  query: SetupQuery,
  control: CooperativeSearchControl,
): Promise<SetupCandidate[]> {
  const catalog = setupsForCycle(query.cycle);
  if (query.cycle === 1) {
    const context = cycle1QueueContext(query);
    if (!context || !isNormalCycle1Context(context)) return [];
    return limitSetupCandidatesForCycle(await queryCatalogCooperative(catalog, query, control), 1, query.maxCandidates);
  }
  if (query.cycle === 3) {
    const context = cycle3QueueContext(query);
    if (!context) return [];
    const classCatalog = setupsForCycle3Class(context.classPiece);
    const policy = setupPolicyForCycle(3, context.classPiece);
    const initialCatalog = cycle3InitialStageCatalog(classCatalog, policy);
    const buildable = initialCatalog.filter((setup) => fitsCycle3BuildPool(setup, context.buildPieces));
    return limitSetupCandidatesForCycle(await queryCatalogCooperative(
      buildable,
      { ...query, next: context.searchNext },
      control,
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
    const buildable = classCatalog.filter((setup) => fitsCycle4BuildPool(setup, context.buildPieces));
    const classLabel = cycle4ClassLabel(context.missingPieces) ?? formatPieceSetForDisplay(context.missingPieces);
    return (await queryCatalogCooperative(
      buildable,
      { ...query, next: context.searchNext },
      control,
      undefined,
      undefined,
      classCatalog,
      context.placeableNextCount,
    )).map((candidate) => ({
      ...candidate,
      reasons: [`Classified as Cycle 4 No ${classLabel} from the first five pieces.`, ...candidate.reasons],
    })).sort(compareScores).slice(0, query.maxCandidates ?? 8);
  }
  if (query.cycle === 5) {
    const context = cycle5QueueContext(query);
    if (!context || context.classificationMode === "duplicate-pair-unsupported") return [];
    const classCatalog = setupsForCycle5Class(context.classPieces);
    const buildable = classCatalog.filter((setup) =>
      setup.cycle === 5 && setup.runtimeEligible !== false && fitsCycle5BuildPool(setup, context.buildPieces));
    const classLabel = formatPieceSetForDisplay(context.classPieces, "/");
    const candidates = (await queryCatalogCooperative(
      buildable,
      { ...query, next: context.searchNext },
      control,
      undefined,
      undefined,
      classCatalog,
      context.placeableNextCount,
    )).map((candidate) => ({
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
    return limitSetupCandidatesForCycle(candidates.filter(({ setup }) => {
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
    }), 5, query.maxCandidates);
  }
  if (query.cycle === 6) {
    const context = cycle6QueueContext(query);
    if (!context || context.classificationMode === "duplicate-pool-unsupported") return [];
    const candidates: SetupCandidate[] = [];
    for (const classPiece of context.classPieces) {
      const classCatalog = setupsForCycle6Class(classPiece);
      const buildable = classCatalog.filter((setup) => fitsCycle6BuildPool(setup, context.buildPieces));
      if (buildable.length === 0) continue;
      candidates.push(...(await queryCatalogCooperative(
        buildable,
        { ...query, next: context.searchNext },
        control,
        setupPolicyForCycle(6, classPiece),
        undefined,
        classCatalog,
        context.placeableNextCount,
      )).map((candidate) => ({
        ...candidate,
        reasons: [`Classified as Cycle 6 No ${classPiece} from the first six pieces.`, ...candidate.reasons],
      })));
    }
    candidates.sort(compareScores);
    const seenIds = new Set<string>();
    const seenGroups = new Set<string>();
    return limitSetupCandidatesForCycle(candidates.filter(({ setup }) => {
      if (seenIds.has(setup.id)) return false;
      if (setup.recommendationGroup && seenGroups.has(setup.recommendationGroup)) return false;
      seenIds.add(setup.id);
      if (setup.recommendationGroup) seenGroups.add(setup.recommendationGroup);
      return true;
    }), 6, query.maxCandidates);
  }
  return [];
}

/**
 * Produces the first useful recommendation set before optional catalogs are
 * searched. All callbacks run inside the Worker that owns the request.
 */
export async function querySetupsStagedCooperative(
  query: SetupQuery,
  control: CooperativeSearchControl,
  receive: RecommendationStageReceiver,
): Promise<void> {
  if (query.cycle === 2) {
    const context = cycle2QueueContext(query);
    if (!context) {
      receive({ stage: "primary", candidates: [], preferredCandidateId: null, complete: true });
      return;
    }
    const policy = setupPolicyForCycle(2);
    const generalCatalog = setupsForCycle2General();
    const advancedCatalog = setupsForCycle2Advanced3P();
    const general = limitSetupCandidatesForCycle(await queryCatalogCooperative(
      generalCatalog.filter((setup) => fitsCycle2BuildPool(setup, context.buildPieces, policy)),
      { ...query, next: context.searchNext },
      control,
      policy,
      context.policyPrefix,
      generalCatalog,
      context.placeableNextCount,
    ), 2, query.maxCandidates);
    const advanced = limitSetupCandidatesForCycle(await queryCatalogCooperative(
      advancedCatalog.filter((setup) => fitsCycle2BuildPool(setup, context.buildPieces, policy)),
      { ...query, next: context.searchNext },
      control,
      policy,
      context.policyPrefix,
      advancedCatalog,
      context.placeableNextCount,
      query.maxCandidates ?? 4,
    ), 2, query.maxCandidates);
    const isOisz = formatPieceSetForDisplay(context.buildPieces) === "OISZ";
    const priorityQb = isOisz ? await queryCycle2QbCandidates(query, control, true) : [];
    const primary = limitCombined([...general, ...advanced, ...priorityQb], query);
    const priority100 = primary.find(({ setup }) => setup.priority === 100);
    const preferredCandidateId = priority100?.setup.id ?? primary[0]?.setup.id ?? null;
    receive({ stage: "primary", candidates: primary, preferredCandidateId, complete: false });

    const qb = await queryCycle2QbCandidates(query, control, false);
    receive({
      stage: "secondary",
      candidates: limitCombined([...general, ...advanced, ...qb], query),
      preferredCandidateId,
      complete: true,
    });
    return;
  }

  if (query.cycle === 7) {
    const context = cycle7QueueContext(query);
    if (!context) {
      receive({ stage: "primary", candidates: [], preferredCandidateId: null, complete: true });
      return;
    }
    const qb = await queryCycle7QbCandidates(query, control);
    const policy = setupPolicyForCycle(7);
    const catalog = setupsForCycle(7);
    const standard = await queryCatalogCooperative(
      catalog.filter((setup) => fitsCycle7BuildPool(setup, context.buildPieces, policy)),
      { ...query, next: context.searchNext },
      control,
      policy,
      undefined,
      catalog,
      context.placeableNextCount,
    );
    const primary = limitSetupCandidatesForCycle([...qb, ...standard], 7, query.maxCandidates);
    const preferredCandidateId = primary[0]?.setup.id ?? null;
    receive({ stage: "primary", candidates: primary, preferredCandidateId, complete: false });
    const advanced = await queryCycle7AdvancedCandidates(query, control);
    receive({
      stage: "secondary",
      candidates: limitSetupCandidatesForCycle([...qb, ...standard, ...advanced], 7, query.maxCandidates),
      preferredCandidateId,
      complete: true,
    });
    return;
  }

  const candidates = await querySingleStage(query, control);
  receive({
    stage: "primary",
    candidates,
    preferredCandidateId: candidates[0]?.setup.id ?? null,
    complete: true,
  });
}
