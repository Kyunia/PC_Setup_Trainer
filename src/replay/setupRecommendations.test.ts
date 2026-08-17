import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import type { Cycle, Piece } from "../engine/types";
import type { SetupCandidate } from "../setups/query";
import type { ReplayRecommendationInput } from "./recommendationController";
import {
  buildReplayRecommendationSections,
  replayRecommendationLabel,
  replayRecommendationContextLabel,
  replaySetupPcRateLabel,
} from "./setupRecommendations";

function candidate(id: string, placements: number, qb = false): SetupCandidate {
  return {
    setup: {
      id,
      displayName: id,
      cycle: 1,
      placements: Array.from({ length: placements }, () => ({ piece: "I", cells: [] })),
    },
    plan: { steps: [], holds: 0 },
    score: [],
    reasons: [],
    qbCondition: qb ? "QB" : undefined,
  } as unknown as SetupCandidate;
}

describe("replay recommendation presentation", () => {
  it("keeps Cycle 4 as one unsplit standard setup section", () => {
    const sections = buildReplayRecommendationSections([candidate("four", 4), candidate("three", 3)], 4);
    expect(sections.map(({ kind }) => kind)).toEqual(["all"]);
    expect(sections[0]?.candidates.map(({ setup }) => setup.id)).toEqual(["four", "three"]);
  });

  it("keeps QB candidates separate from ordinary 3P candidates", () => {
    const sections = buildReplayRecommendationSections([
      candidate("four", 4), candidate("three", 3), candidate("qb", 3, true),
    ], 2);
    expect(sections.find(({ kind }) => kind === "three")?.candidates.map(({ setup }) => setup.id)).toEqual(["three"]);
    expect(sections.find(({ kind }) => kind === "qb")?.candidates.map(({ setup }) => setup.id)).toEqual(["qb"]);
  });

  it("shows up to two PC-rate decimals without trailing zeroes", () => {
    const rated = candidate("rated", 4);
    rated.setup.solveRate = 89.21;
    expect(replaySetupPcRateLabel(rated)).toBe("4P 89.21%");
    rated.setup.solveRate = 89.2;
    expect(replaySetupPcRateLabel(rated)).toBe("4P 89.2%");
    rated.setup.solveRate = 100;
    expect(replaySetupPcRateLabel(rated)).toBe("4P 100%");
    expect(replaySetupPcRateLabel(candidate("unrated", 3))).toBe("3P —");
  });

  it("preserves exact queue order in policy-generated recommendation labels", () => {
    const advanced = candidate("internal-name", 3, true);
    advanced.recommendationLabel = "IL - IZT[OL]! OQB";
    expect(replayRecommendationLabel(advanced)).toBe("IL - IZT[OL]! OQB");
  });

  function input(cycle: Cycle, active: Piece, hold: Piece | null, next: Piece[]): ReplayRecommendationInput {
    return { cycle, board: createBoard(), active, hold, next, holdAvailable: true };
  }

  it.each([
    [input(1, "I", null, ["J", "L", "O", "S", "T"]), "1st"],
    [input(2, "I", "T", ["L", "J", "O", "S", "Z"]), "TILJ 2nd"],
    [input(3, "I", "T", ["J", "L", "O", "S", "Z"]), "T 3rd"],
    [input(4, "I", null, ["O", "S", "T", "Z", "J"]), "no LJ 4th"],
    [input(5, "S", "L", ["I", "J", "O", "T", "Z"]), "LS 5th"],
    [input(6, "I", null, ["J", "L", "O", "S", "T"]), "no Z 6th"],
    [input(7, "S", "L", ["Z", "I", "J", "O", "T"]), "LSZ 7th"],
  ] as Array<[ReplayRecommendationInput, string]>)
  ("formats the production cycle class as $expected", (query, expected) => {
    expect(replayRecommendationContextLabel(query)).toBe(expected);
  });

  it("sorts unordered replay context pieces without changing queue data", () => {
    const query = input(2, "T", "I", ["O", "L", "J", "S", "Z"]);
    expect(replayRecommendationContextLabel(query)).toBe("TOIL 2nd");
    expect([query.hold, query.active, ...query.next]).toEqual(["I", "T", "O", "L", "J", "S", "Z"]);
    expect(replayRecommendationContextLabel(input(5, "O", "T", ["I", "L", "J", "S", "Z"])))
      .toBe("TO 5th");
  });
});
