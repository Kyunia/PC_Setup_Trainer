import { describe, expect, it } from "vitest";
import { createBoard, placeCells } from "../engine/board";
import type { Cycle5AdvancedPolicyBundle } from "../setups/cycle5AdvancedPolicy";
import { oqbContinuationCandidates, resolveOqbProgress, type OqbProgressResult } from "../setups/oqbProgress";
import type { SetupCandidate, SetupQuery } from "../setups/query";
import type { SetupVariant } from "../setups/schema";
import {
  selectedCatalogOqbPlanId,
  selectedCatalogOqbSource,
  updateOqbPracticeFollowup,
} from "./oqbPractice";

const precondition: SetupVariant = {
  id: "pre",
  cycle: 5,
  family: "test",
  displayName: "O 1P",
  pieceSignature: ["O"],
  placements: [{
    id: "o",
    piece: "O",
    cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  }],
  difficulty: 1,
  reviewStatus: "reviewed",
};

const candidate: SetupCandidate = {
  setup: precondition,
  plan: { steps: [], holds: 0 },
  score: [],
  reasons: [],
  qbCondition: "Selected QB catalog",
};

const query: SetupQuery = {
  cycle: 5,
  board: createBoard(8),
  hold: "O",
  active: "I",
  next: ["S", "Z", "T", "L", "J"],
};

describe("setup_test OQB practice projection", () => {
  it("identifies a shared precondition by the original queue's unique matching plan", () => {
    const policy: Cycle5AdvancedPolicyBundle = {
      schemaVersion: 3,
      cycle: 5,
      classId: "test",
      entries: [{
        id: "matching-plan",
        kind: "oqb",
        sourceOrder: 1,
        initialPatterns: [{
          scope: "next-bag-five",
          parts: [{ kind: "ordered", symbols: ["S", "Z", "T"] }],
        }],
        preconditionSetupId: "pre",
        checkpoint: { placedCount: 1 },
        observation: { kind: "reveal", uiSlot: "NEXT[4]" },
        branches: [],
      }],
    };
    const source = selectedCatalogOqbSource(policy, [precondition], "selected:test")!;

    expect(selectedCatalogOqbPlanId(source, candidate, query)).toBe("matching-plan");
  });

  it("normalizes the selected draft OI policy before entering Play 0P", () => {
    const draftPrecondition: SetupVariant = {
      id: "geometry-cycle5-advanced-oi-044-f000",
      cycle: 5,
      family: "cycle5-advanced-oi",
      displayName: "OI OQB precondition",
      pieceSignature: ["O"],
      placements: [{
        id: "pre-o",
        piece: "O",
        cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
      }],
      difficulty: 3,
      reviewStatus: "draft",
    };
    const continuation = (id: string): SetupVariant => ({
      id,
      cycle: 5,
      family: "cycle5-advanced-oi",
      displayName: id,
      pieceSignature: ["I", "O"],
      placements: [
        ...draftPrecondition.placements,
        { id: `${id}-i`, piece: "I", cells: [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }] },
      ],
      difficulty: 3,
      reviewStatus: "draft",
    });
    const draftCandidate: SetupCandidate = {
      ...candidate,
      setup: draftPrecondition,
      policy: {
        ruleId: "oi5-advanced-oqb-ilz-jo",
        branchId: "precondition",
        preferred: true,
      },
    };
    const source = selectedCatalogOqbSource(
      {
        cycle: 5,
        classId: "oi",
        rules: [],
        oqbPlans: [{
          planId: "oi5-advanced-oqb-ilz-jo",
          rawInitialCondition: "[IZ]!LJO",
          preconditionSetupId: draftPrecondition.id,
          placedCheckpoint: { placedCount: 1 },
          observation: { kind: "queue-reveal", uiSlot: "NEXT[4]" },
          branches: [
            { when: { revealedPiece: "T" }, eligibleSetupIds: ["geometry-cycle5-advanced-oi-045-f000"] },
            { when: { revealedPiece: "S" }, eligibleSetupIds: ["geometry-cycle5-advanced-oi-046-f000"] },
          ],
        }],
      },
      [draftPrecondition, continuation("geometry-cycle5-advanced-oi-045-f000"), continuation("geometry-cycle5-advanced-oi-046-f000")],
      "draft:cycle-5-advanced-oi-qb-oqb-setups.json",
    )!;
    const initialQuery: SetupQuery = {
      cycle: 5,
      board: createBoard(8),
      hold: "I",
      active: "O",
      next: ["I", "Z", "L", "J", "O"],
    };
    const planId = selectedCatalogOqbPlanId(source, draftCandidate, initialQuery);
    expect(planId).toBe("oi5-advanced-oqb-ilz-jo");
    expect(resolveOqbProgress({
      selectedCandidate: draftCandidate,
      query: initialQuery,
      planId,
      policyOverride: source,
    })).toMatchObject({
      status: "precondition",
      progress: { completedPlacements: 0, checkpointPlacements: 1 },
    });

    const oPlacement = draftPrecondition.placements[0]!;
    const checkpointBoard = placeCells(createBoard(8), oPlacement.cells, oPlacement.piece);
    for (const [revealed, expectedSetupId] of [
      ["T", "geometry-cycle5-advanced-oi-045-f000"],
      ["S", "geometry-cycle5-advanced-oi-046-f000"],
    ] as const) {
      const continuation = resolveOqbProgress({
        selectedCandidate: draftCandidate,
        query: {
          ...initialQuery,
          board: checkpointBoard,
          active: "I",
          next: ["Z", "L", "J", "O", revealed],
        },
        planId,
        policyOverride: source,
      });
      expect(continuation).toMatchObject({ status: "continuation" });
      expect(continuation.status === "continuation" && continuation.continuations[0]?.sourceSetupId)
        .toBe(expectedSetupId);
    }
  });

  it("projects every equal policy continuation into a selectable QB candidate", () => {
    const progress: Extract<OqbProgressResult, { status: "continuation" }> = {
      status: "continuation",
      cycle: 5,
      policyKind: "cycle5-advanced",
      planId: "plan",
      branchId: "branch",
      stage: "continuation",
      progress: { completedPlacements: 1, checkpointPlacements: 1 },
      instruction: "Continue with the selected branch.",
      observation: { kind: "piece", piece: "L", source: "reveal", uiSlot: "NEXT[4]" },
      continuations: [
        { sourceSetupId: "a", transform: "identity", displayName: "A", setup: { ...precondition, id: "a" } },
        { sourceSetupId: "b", transform: "mirror-x", displayName: "B", setup: { ...precondition, id: "b" } },
      ],
    };
    const continuations = oqbContinuationCandidates(progress);

    expect(continuations.map(({ setup }) => setup.displayName)).toEqual(["A", "B"]);
    expect(continuations.every(({ qbCondition }) => qbCondition === "OQB L branch")).toBe(true);
    expect(continuations.every(({ plan }) => plan.steps.length === 0)).toBe(true);
  });

  it("retains an observed continuation after later placements and releases it before the checkpoint", () => {
    const progress: Extract<OqbProgressResult, { status: "continuation" }> = {
      status: "continuation",
      cycle: 5,
      policyKind: "cycle5-advanced",
      planId: "plan",
      branchId: "branch",
      stage: "continuation",
      progress: { completedPlacements: 1, checkpointPlacements: 1 },
      instruction: "Continue.",
      continuations: [{
        sourceSetupId: "a",
        transform: "identity",
        displayName: "A",
        setup: { ...precondition, id: "a" },
      }],
    };
    const observed = updateOqbPracticeFollowup(null, progress, 1);

    expect(updateOqbPracticeFollowup(observed, {
      status: "unresolved",
      cycle: 5,
      instruction: "Initial geometry no longer matches.",
      reason: "board-outside-setup",
    }, 2)).toBe(observed);
    expect(updateOqbPracticeFollowup(observed, undefined, 0)).toBeNull();
  });
});
