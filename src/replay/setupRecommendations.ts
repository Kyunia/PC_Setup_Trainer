import {
  querySetups,
  splitsSetupCandidatesByPieceCount,
  type SetupCandidate,
} from "../setups/query";
import { formatPieceSetForDisplay } from "../engine/pieceDisplay";
import { cycle2QueueContext } from "../setups/cycle2Context";
import { cycle3QueueContext } from "../setups/cycle3Context";
import { cycle4ClassLabel } from "../setups/cycle4Catalog";
import { cycle4QueueContext } from "../setups/cycle4Context";
import { cycle5QueueContext } from "../setups/cycle5Context";
import { cycle6QueueContext } from "../setups/cycle6Context";
import { cycle7QueueContext } from "../setups/cycle7Context";
import { recommendationSetupLabel } from "../setups/recommendationLabel";
import type { ReplayRecommendationInput } from "./recommendationController";

export type ReplayRecommendationSectionKind = "all" | "four-plus" | "three" | "other" | "qb";

export interface ReplayRecommendationSection {
  kind: ReplayRecommendationSectionKind;
  label: string;
  candidates: SetupCandidate[];
}

export interface ReplaySetupRecommendationResult {
  candidates: SetupCandidate[];
  sections: ReplayRecommendationSection[];
  labels: Record<string, string>;
  pcRateLabels: Record<string, string>;
  contextLabel: string;
}

const CYCLE_ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"] as const;

/** Uses the same production queue contexts that select each cycle's setup catalog. */
export function replayRecommendationContextLabel(input: ReplayRecommendationInput): string {
  const ordinal = CYCLE_ORDINALS[input.cycle];
  if (input.cycle === 1) return ordinal;
  if (input.cycle === 2) {
    const context = cycle2QueueContext(input);
    return context ? `${formatPieceSetForDisplay(context.buildPieces)} ${ordinal}` : ordinal;
  }
  if (input.cycle === 3) {
    const context = cycle3QueueContext(input);
    return context ? `${context.classPiece} ${ordinal}` : ordinal;
  }
  if (input.cycle === 4) {
    const context = cycle4QueueContext(input);
    const classLabel = context?.classificationMode === "normal-missing-pair"
      ? cycle4ClassLabel(context.missingPieces)
      : undefined;
    return classLabel ? `no ${classLabel} ${ordinal}` : ordinal;
  }
  if (input.cycle === 5) {
    const context = cycle5QueueContext(input);
    const classLabel = context?.classificationMode === "normal-distinct-pair"
      ? formatPieceSetForDisplay(context.classPieces)
      : "";
    return classLabel ? `${classLabel} ${ordinal}` : ordinal;
  }
  if (input.cycle === 6) {
    const context = cycle6QueueContext(input);
    const missing = context?.classificationMode === "unique-no-piece" ? context.classPieces[0] : undefined;
    return missing ? `no ${missing} ${ordinal}` : ordinal;
  }
  const context = cycle7QueueContext(input);
  return context ? `${formatPieceSetForDisplay(context.buildPieces)} ${ordinal}` : ordinal;
}

export function buildReplayRecommendationSections(
  candidates: SetupCandidate[],
  cycle: ReplayRecommendationInput["cycle"],
): ReplayRecommendationSection[] {
  const qbCandidates = candidates.filter(({ qbCondition }) => qbCondition !== undefined);
  const standardCandidates = candidates.filter(({ qbCondition }) => qbCondition === undefined);
  if (!splitsSetupCandidatesByPieceCount(cycle)) {
    return [
      { kind: "all", label: "Setups", candidates: standardCandidates },
      ...(qbCandidates.length > 0 ? [{ kind: "qb" as const, label: "QB Setups", candidates: qbCandidates }] : []),
    ];
  }
  const sections: ReplayRecommendationSection[] = [
    { kind: "four-plus", label: "4P+ Setups", candidates: standardCandidates.filter(({ setup }) => setup.placements.length >= 4) },
    { kind: "three", label: "3P Setups", candidates: standardCandidates.filter(({ setup }) => setup.placements.length === 3) },
  ];
  const other = standardCandidates.filter(({ setup }) => setup.placements.length < 3);
  if (other.length > 0) sections.push({ kind: "other", label: "Other Setups", candidates: other });
  if (qbCandidates.length > 0 || cycle === 7) sections.push({ kind: "qb", label: "QB Setups", candidates: qbCandidates });
  return sections;
}

export function replayRecommendationLabel(candidate: SetupCandidate): string {
  return candidate.recommendationLabel
    ?? recommendationSetupLabel(candidate.setup.displayName, candidate.qbSaveTargets);
}

export function replaySetupPcRateLabel(candidate: SetupCandidate): string {
  const prefix = `${candidate.setup.placements.length}P`;
  return candidate.setup.solveRate === undefined
    ? `${prefix} —`
    : `${prefix} ${Number(candidate.setup.solveRate.toFixed(2))}%`;
}

export function queryReplaySetupRecommendations(
  input: ReplayRecommendationInput,
): ReplaySetupRecommendationResult {
  const candidates = querySetups(input);
  return buildReplaySetupRecommendationResult(input, candidates);
}

export function buildReplaySetupRecommendationResult(
  input: ReplayRecommendationInput,
  candidates: SetupCandidate[],
): ReplaySetupRecommendationResult {
  return {
    candidates,
    sections: buildReplayRecommendationSections(candidates, input.cycle),
    labels: Object.fromEntries(candidates.map((candidate) => [candidate.setup.id, replayRecommendationLabel(candidate)])),
    pcRateLabels: Object.fromEntries(candidates.map((candidate) => [candidate.setup.id, replaySetupPcRateLabel(candidate)])),
    contextLabel: replayRecommendationContextLabel(input),
  };
}
