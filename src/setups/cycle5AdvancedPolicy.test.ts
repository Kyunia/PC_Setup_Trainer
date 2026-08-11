import { describe, expect, it } from "vitest";
import type { Piece } from "../engine/types";
import {
  cycle5AdvancedInitialBfsSetupIds,
  cycle5AdvancedQueuePatternMatches,
  cycle5AdvancedSetupDisplayName,
  matchingCycle5AdvancedEntries,
  resolveCycle5AdvancedOqbContinuation,
  selectCycle5AdvancedInitialDecision,
  type Cycle5AdvancedOqbPlan,
  type Cycle5AdvancedPolicyBundle,
  type Cycle5AdvancedQueuePattern,
  type Cycle5AdvancedQueueState,
} from "./cycle5AdvancedPolicy";

const ordered = (...symbols: Array<Piece | "X">) => ({ kind: "ordered" as const, symbols });
const permutation = (...symbols: Array<Piece | "X">) => ({ kind: "permutation" as const, symbols });
const pattern = (
  scope: Cycle5AdvancedQueuePattern["scope"],
  ...parts: Cycle5AdvancedQueuePattern["parts"]
): Cycle5AdvancedQueuePattern => ({ scope, parts });

describe("Cycle 5 advanced QB/OQB policy", () => {
  it("matches ordered and permutation segments against the declared queue scope", () => {
    const state: Cycle5AdvancedQueueState = {
      hold: "O",
      active: "I",
      next: ["O", "T", "I", "S", "Z"],
    };
    expect(cycle5AdvancedQueuePatternMatches(
      pattern("visible-seven", ordered("O", "I"), permutation("T", "I", "O")),
      state,
    )).toBe(true);
    expect(cycle5AdvancedQueuePatternMatches(
      pattern("next-bag-five", permutation("T", "I", "O")),
      state,
    )).toBe(true);
    expect(cycle5AdvancedQueuePatternMatches(
      pattern("next-bag-five", permutation("O", "I", "S")),
      state,
    )).toBe(false);
  });

  it("supports one-piece X wildcards and explicit exclusions without parsing source prose", () => {
    const state: Cycle5AdvancedQueueState = {
      hold: "O",
      active: "I",
      next: ["T", "Z", "L", "J", "S"],
    };
    const queuePattern: Cycle5AdvancedQueuePattern = {
      scope: "next-bag-five",
      parts: [permutation("T", "Z"), ordered("L"), permutation("S", "X")],
      excludes: [{ parts: [permutation("T", "Z"), ordered("L", "J", "S")] }],
    };
    expect(cycle5AdvancedQueuePatternMatches(queuePattern, state)).toBe(false);
    expect(cycle5AdvancedQueuePatternMatches(
      { ...queuePattern, excludes: undefined },
      state,
    )).toBe(true);
  });

  it("uses explicit OI queue policy even when a Hold-S-labelled sibling is also buildable", () => {
    const leftPattern = pattern("visible-seven", ordered("O", "I"), permutation("T", "I", "O"));
    const rightPattern = pattern("visible-seven", ordered("O", "I"), permutation("O", "I", "S"));
    const bundle: Cycle5AdvancedPolicyBundle = {
      schemaVersion: 1,
      cycle: 5,
      classId: "oi",
      entries: [
        {
          id: "oi-left",
          kind: "direct",
          sourceOrder: 1,
          alternatives: [{ pattern: leftPattern, setupRefs: [{ setupId: "left" }] }],
        },
        {
          id: "oi-right",
          kind: "direct",
          sourceOrder: 2,
          alternatives: [{
            pattern: rightPattern,
            setupRefs: [{ setupId: "right", displayHoldPiece: "S" }],
          }],
        },
      ],
    };
    const matches = matchingCycle5AdvancedEntries(bundle, {
      hold: "O",
      active: "I",
      next: ["O", "T", "I", "S", "Z"],
    });
    const selected = selectCycle5AdvancedInitialDecision(matches, new Set(["left", "right"]));
    expect(matches.map(({ entry }) => entry.id)).toEqual(["oi-left"]);
    expect(selected).toMatchObject({ kind: "direct", ruleId: "oi-left", setupRefs: [{ setupId: "left" }] });
  });

  it("does not widen a TL rule through Hold-T H/A exchange", () => {
    const bundle: Cycle5AdvancedPolicyBundle = {
      schemaVersion: 1,
      cycle: 5,
      classId: "tltj",
      entries: [{
        id: "tl-explicit",
        kind: "direct",
        sourceOrder: 1,
        alternatives: [{
          pattern: pattern("visible-seven", permutation("T", "L"), permutation("T", "L"), ordered("I")),
          setupRefs: [{ setupId: "tl-setup", displayHoldPiece: "T" }],
        }],
      }],
    };
    expect(matchingCycle5AdvancedEntries(bundle, {
      hold: "T",
      active: "L",
      next: ["L", "O", "T", "I", "S"],
    })).toEqual([]);
  });

  it("keeps every buildable sibling attached to the same explicit direct rule", () => {
    const bundle: Cycle5AdvancedPolicyBundle = {
      schemaVersion: 1,
      cycle: 5,
      classId: "oi",
      entries: [{
        id: "two-setups",
        kind: "direct",
        sourceOrder: 1,
        alternatives: [{
          pattern: pattern("next-bag-five", permutation("O", "S", "Z"), permutation("L", "J")),
          setupRefs: [{ setupId: "a" }, { setupId: "b" }, { setupId: "unbuildable" }],
        }],
      }],
    };
    const matches = matchingCycle5AdvancedEntries(bundle, {
      hold: "O",
      active: "I",
      next: ["S", "O", "Z", "J", "L"],
    });
    expect(selectCycle5AdvancedInitialDecision(matches, new Set(["a", "b"]))).toMatchObject({
      kind: "direct",
      setupRefs: [{ setupId: "a" }, { setupId: "b" }],
    });
  });

  it("selects an OQB precondition by BFS, then resolves reveal directly without BFS input", () => {
    const plan: Cycle5AdvancedOqbPlan = {
      id: "oi-oqb",
      kind: "oqb",
      sourceOrder: 1,
      initialPatterns: [pattern("next-bag-five", permutation("I", "S", "Z"), permutation("T", "O"))],
      preconditionSetupId: "o-1p",
      checkpoint: { placedCount: 1 },
      observation: { kind: "reveal", uiSlot: "NEXT[4]" },
      branches: [
        {
          id: "reveal-l",
          observedPieces: ["L"],
          continuationSetupRefs: [{ setupId: "left-a" }, { setupId: "left-b" }],
        },
        {
          id: "reveal-j",
          observedPieces: ["J"],
          continuationSetupRefs: [{ setupId: "right" }],
        },
      ],
    };
    const bundle: Cycle5AdvancedPolicyBundle = {
      schemaVersion: 1,
      cycle: 5,
      classId: "oi",
      entries: [plan],
    };
    const matches = matchingCycle5AdvancedEntries(bundle, {
      hold: "O",
      active: "I",
      next: ["S", "I", "Z", "O", "T"],
    });
    expect(cycle5AdvancedInitialBfsSetupIds(matches)).toEqual(["o-1p"]);
    expect(selectCycle5AdvancedInitialDecision(matches, new Set(["o-1p"]))).toMatchObject({
      kind: "oqb",
      preconditionSetupId: "o-1p",
    });
    expect(resolveCycle5AdvancedOqbContinuation(plan, "L")).toEqual({
      planId: "oi-oqb",
      branchId: "reveal-l",
      continuationSetupRefs: [{ setupId: "left-a" }, { setupId: "left-b" }],
      bestsave: undefined,
    });
    expect(resolveCycle5AdvancedOqbContinuation(plan, "T")).toBeNull();
  });

  it("keeps Hold-X as presentation metadata only", () => {
    expect(cycle5AdvancedSetupDisplayName("OI-OI", {
      setupId: "oi-oi",
      displayHoldPiece: "S",
    })).toBe("OI-OI (Hold S)");
    expect(cycle5AdvancedSetupDisplayName("OI-OL", { setupId: "oi-ol" })).toBe("OI-OL");
  });
});
