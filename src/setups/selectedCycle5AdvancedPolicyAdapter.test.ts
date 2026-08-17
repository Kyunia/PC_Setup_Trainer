import { describe, expect, it } from "vitest";
import {
  normalizeSelectedCycle5AdvancedPolicy,
  SelectedCycle5AdvancedPolicyError,
} from "./selectedCycle5AdvancedPolicyAdapter";

describe("selected Cycle 5 advanced policy adapter", () => {
  it("normalizes a minimal promoted direct entry without external data", () => {
    const policy = normalizeSelectedCycle5AdvancedPolicy({
      schemaVersion: 3,
      cycle: 5,
      classId: "oi",
      entries: [{
        id: "direct",
        kind: "direct",
        sourceOrder: 1,
        alternatives: [{
          pattern: {
            scope: "next-bag-five",
            parts: [{ kind: "ordered", symbols: ["T", "O", "I"] }],
          },
          setupRefs: [{ setupId: "setup", transform: "identity" }],
        }],
        bestsave: null,
        directTwoLinePc: false,
      }],
    }, "synthetic:promoted");

    expect(policy).toMatchObject({
      cycle: 5,
      classId: "oi",
      entries: [{ id: "direct", kind: "direct" }],
    });
  });

  it("preserves condition-level bestsave when flattening a selection group", () => {
    const policy = normalizeSelectedCycle5AdvancedPolicy({
      schemaVersion: 3,
      cycle: 5,
      classId: "to",
      entries: [{
        id: "group",
        kind: "selection-group",
        sourceOrder: 1,
        guardPatterns: [{
          scope: "next-bag-five",
          parts: [{ kind: "permutation", symbols: ["T", "L", "J"] }],
        }],
        decisions: [{
          id: "group-1",
          order: 1,
          patterns: [{
            scope: "next-bag-five",
            parts: [
              { kind: "permutation", symbols: ["T", "L", "J"] },
              { kind: "ordered", symbols: ["S"] },
            ],
          }],
          outcome: "setups",
          setupRefs: [{ setupId: "setup", transform: "identity" }],
          bestsave: false,
        }],
      }],
    }, "synthetic:selection-bestsave");

    expect(policy.entries).toMatchObject([{
      id: "group-1",
      kind: "direct",
      bestsave: false,
    }]);
  });

  it("fails closed with the selected source identity for malformed roots", () => {
    expect(() => normalizeSelectedCycle5AdvancedPolicy(
      { schemaVersion: 1, cycle: 5, classId: "oi", rules: [] },
      "draft:broken",
    )).toThrowError(new SelectedCycle5AdvancedPolicyError(
      "draft:broken",
      "expected promoted entries[] or draft rules/directRules[] and/or selectionTables[] together with oqbPlans[].",
    ));
    expect(() => normalizeSelectedCycle5AdvancedPolicy(
      { schemaVersion: 3, cycle: 5, classId: "oi" },
      "promoted:broken",
    )).toThrow(/promoted:broken.*entries\[\].*oqbPlans\[\]/);
  });

  it("rejects a nested branch without exactly one continuation outcome", () => {
    const malformed = {
      schemaVersion: 3,
      cycle: 5,
      classId: "ti",
      entries: [{
        id: "nested",
        kind: "oqb",
        sourceOrder: 1,
        initialPatterns: [{
          scope: "next-bag-five",
          parts: [{ kind: "ordered", symbols: ["T", "I", "O"] }],
        }],
        preconditionSetupId: "precondition",
        checkpoint: { placedCount: 1 },
        observation: { kind: "reveal", uiSlot: "NEXT[4]" },
        branches: [{
          id: "first",
          observedPieces: ["Z"],
          continuationSetupRefs: [{ setupId: "continuation", transform: "identity" }],
          postCheckpoint: {
            observation: { kind: "reveal", uiSlot: "NEXT[4]" },
            branches: [{ id: "broken", observedPieces: ["S"] }],
          },
        }],
      }],
    };

    expect(() => normalizeSelectedCycle5AdvancedPolicy(malformed, "synthetic:nested"))
      .toThrow(/synthetic:nested.*needs exactly one continuation outcome/);
  });

  it("preserves a user-confirmed mirrored OQB continuation from a rich draft", () => {
    const policy = normalizeSelectedCycle5AdvancedPolicy({
      schemaVersion: 1,
      cycle: 5,
      classId: "cycle5-oi-advanced",
      rules: [],
      oqbPlans: [{
        planId: "oi5-advanced-oqb-toz-hidden-last",
        rawInitialCondition: "[TOZ]!",
        preconditionSetupId: "geometry-cycle5-advanced-oi-008-f000",
        placedCheckpoint: { placedCount: 1, placedPieces: ["O"] },
        observation: {
          kind: "infer-hidden-last-piece",
          knownRemainingBagPieces: ["I", "L", "J", "S"],
          visibleCountFromThatSet: 3,
        },
        branches: [{
          when: { hiddenLastPieceIn: ["I", "J"] },
          eligibleSetupIds: ["geometry-cycle5-advanced-oi-009-f000"],
          geometryTransform: "mirrorX",
        }],
      }],
    }, "draft:oi-mirror");

    expect(policy.entries).toMatchObject([{
      id: "oi5-advanced-oqb-toz-hidden-last",
      kind: "oqb",
      observation: {
        kind: "hidden-bag-piece",
        knownRemainingBagPieces: ["I", "L", "J", "S"],
      },
      branches: [{
        observedPieces: ["I", "J"],
        continuationSetupRefs: [{
          setupId: "geometry-cycle5-advanced-oi-009-f000",
          transform: "mirror-x",
        }],
      }],
    }]);
  });

  it("normalizes selection-table-only IL/IJ drafts with directions and plural OQB refs", () => {
    const policy = normalizeSelectedCycle5AdvancedPolicy({
      schemaVersion: 1,
      cycle: 5,
      classId: "ilij",
      selectionTables: [{
        id: "ilij5-advanced-tjs",
        section: "[TJS]!로 시작할 경우",
        decisions: [{
          canonicalConditionText: "그 외 모든 경우 / S-before-J",
          directionCondition: { before: "S", after: "J" },
          eligibleSetupIds: ["geometry-052"],
          bestsave: false,
          outcome: "user-confirmed-directional-candidate",
        }, {
          canonicalConditionText: "[TJS]!OI",
          eligibleSetupIds: ["geometry-050"],
          bestsave: true,
          outcome: "source-selected-candidate",
          oqbPlanId: "plan",
        }],
      }],
      oqbPlans: [{
        planId: "plan",
        initialVisibleCondition: { expressions: ["[TJS]!OI"] },
        preconditionSetupIds: ["geometry-050"],
        placedCheckpoint: { placedCount: 1, placedPiece: "I" },
        observation: { kind: "queue-reveal", uiSlot: "NEXT[4]" },
        branches: [{
          observedPiece: "J/L",
          observedPieces: ["J", "L"],
          continuationSetupIds: ["geometry-051"],
        }],
      }],
    }, "draft:ilij");

    expect(policy.entries).toHaveLength(2);
    expect(policy.entries[0]).toMatchObject({
      kind: "direct",
      bestsave: false,
    });
    expect(policy.entries[0]?.kind === "direct" ? policy.entries[0].alternatives : [])
      .toEqual(expect.arrayContaining([expect.objectContaining({
        pattern: expect.objectContaining({
          scope: "next-bag-five",
          parts: [{ kind: "ordered", symbols: ["T", "S", "J"] }],
        }),
      }), expect.objectContaining({
        pattern: expect.objectContaining({
          scope: "next-bag-five",
          parts: [{ kind: "ordered", symbols: ["S", "T", "J"] }],
        }),
      }), expect.objectContaining({
        pattern: expect.objectContaining({
          scope: "next-bag-five",
          parts: [{ kind: "ordered", symbols: ["S", "J", "T"] }],
        }),
      })]));
    expect(policy.entries[1]).toMatchObject({
      id: "plan",
      kind: "oqb",
      bestsave: true,
      preconditionSetupId: "geometry-050",
      branches: [{
        observedPieces: ["J", "L"],
        continuationSetupRefs: [{ setupId: "geometry-051", transform: "identity" }],
      }],
    });
  });
});
