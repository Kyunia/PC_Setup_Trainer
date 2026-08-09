import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import type { Piece } from "../engine/types";
import { setupsForCycle6Class } from "./catalog";
import { cycle6QueueContext, fitsCycle6BuildPool } from "./cycle6Context";
import { querySetups, type SetupQuery } from "./query";

function query(overrides: Partial<SetupQuery> = {}): SetupQuery {
  return {
    cycle: 6,
    board: createBoard(),
    hold: "T",
    active: "O",
    next: ["L", "J", "S", "Z", "I"],
    holdAvailable: true,
    ...overrides,
  };
}

describe("6회차 6+5 일반 셋업 추천", () => {
  it("HOLD + ACTIVE + NEXT 4를 첫 가방 여섯 미노로, NEXT[4]를 배치 불가 버퍼로 분리한다", () => {
    expect(cycle6QueueContext(query())).toEqual({
      buildPieces: ["T", "O", "L", "J", "S", "Z"],
      searchNext: ["L", "J", "S", "Z", "I"],
      placeableNextCount: 4,
      classPieces: ["I"],
      classificationMode: "unique-no-piece",
    });
  });

  it("HOLD가 비어 있으면 ACTIVE + NEXT 5 전체를 첫 가방으로 사용한다", () => {
    expect(cycle6QueueContext(query({
      hold: null,
      active: "T",
      next: ["O", "L", "J", "S", "Z"],
    }))).toEqual({
      buildPieces: ["T", "O", "L", "J", "S", "Z"],
      searchNext: ["O", "L", "J", "S", "Z"],
      placeableNextCount: 5,
      classPieces: ["I"],
      classificationMode: "unique-no-piece",
    });
  });

  it("OOITSJ 같은 미쿼리 중복 풀은 어떤 No X class로도 분류하지 않는다", () => {
    const context = cycle6QueueContext(query({
      hold: "O",
      active: "O",
      next: ["I", "T", "S", "J", "L"],
    }))!;
    expect(context).toMatchObject({
      buildPieces: ["O", "O", "I", "T", "S", "J"],
      classPieces: [],
      classificationMode: "duplicate-pool-unsupported",
    });
  });

  it("OOITSJ 중복 풀에는 다른 6회차 셋업을 추천하지 않는다", () => {
    const candidates = querySetups(query({
      hold: "O",
      active: "O",
      next: ["I", "T", "S", "J", "L"],
    }));
    expect(candidates).toEqual([]);
  });

  it("정상 No I 풀은 No I 일반 catalog만 실시간 BFS로 추천한다", () => {
    const candidates = querySetups(query());
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(8);
    expect(candidates.every(({ setup }) => setup.id.startsWith("cycle6-no-i-"))).toBe(true);
    expect(candidates.every(({ setup }) => !("qbCondition" in setup))).toBe(true);
    expect(candidates.every(({ plan }) =>
      plan.steps.filter(({ action }) => action === "place").length === plan.steps.length
        || plan.steps.some(({ action }) => action === "hold"))).toBe(true);
  });

  it("No O의 ILJZ 4×4 box를 회전·이동형까지 탐색해 추천한다", () => {
    const candidates = querySetups(query({
      hold: "I",
      active: "J",
      next: ["Z", "L", "T", "S", "Z"],
    }));
    expect(candidates.some(({ setup }) => setup.recommendationGroup === "cycle6-iljs-box")).toBe(true);
  });

  it("setup signature의 중복 개수까지 첫 가방 multiset과 대조한다", () => {
    const base = setupsForCycle6Class("I")[0];
    const duplicateT = {
      ...base,
      pieceSignature: ["T", "T", "L"] as Piece[],
      placements: base.placements.slice(0, 3),
    };
    expect(fitsCycle6BuildPool(duplicateT, ["T", "T", "L", "J", "S", "Z"])).toBe(true);
    expect(fitsCycle6BuildPool(duplicateT, ["T", "O", "L", "J", "S", "Z"])).toBe(false);
  });
});
