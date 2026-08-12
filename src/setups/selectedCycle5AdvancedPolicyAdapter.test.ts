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

  it("fails closed with the selected source identity for malformed roots", () => {
    expect(() => normalizeSelectedCycle5AdvancedPolicy(
      { schemaVersion: 1, cycle: 5, classId: "oi", rules: [] },
      "draft:broken",
    )).toThrowError(new SelectedCycle5AdvancedPolicyError(
      "draft:broken",
      "expected promoted entries[] or draft rules/directRules[] together with oqbPlans[].",
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
});
