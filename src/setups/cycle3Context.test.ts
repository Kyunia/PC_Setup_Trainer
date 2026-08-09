import { describe, expect, it } from "vitest";
import { createBoard, placeCells } from "../engine/board";
import { setupCoverageForCycle, setupsForCycle3Class } from "./catalog";
import { cycle3QueueContext, fitsCycle3BuildPool } from "./cycle3Context";
import { querySetups, resolveCycle3StagedSetup, type SetupQuery } from "./query";
import type { SetupVariant } from "./schema";
import { validateSetup } from "./schema";

function query(overrides: Partial<SetupQuery> = {}): SetupQuery {
  return {
    cycle: 3,
    board: createBoard(),
    hold: "O",
    active: "I",
    next: ["J", "L", "S", "T", "Z"],
    holdAvailable: true,
    ...overrides,
  };
}

describe("Cycle 3 saved-piece class and 7-bag inference", () => {
  it("HOLD의 잔여 미노를 class로 사용하고 ACTIVE + NEXT 5에서 마지막 가방 미노를 추론한다", () => {
    expect(cycle3QueueContext(query())).toMatchObject({
      classPiece: "O",
      buildPieces: ["O", "I", "J", "L", "S", "T", "Z", "O"],
      searchNext: ["J", "L", "S", "T", "Z", "O"],
      placeableNextCount: 6,
      policyPrefix: ["I", "J", "L", "S", "T", "Z", "O"],
      inferredLastPiece: "O",
    });
  });

  it("새 가방의 보이는 여섯 미노가 중복되거나 HOLD가 없으면 입력을 거부한다", () => {
    expect(cycle3QueueContext(query({ next: ["I", "J", "L", "S", "T"] }))).toBeNull();
    expect(cycle3QueueContext(query({ hold: null }))).toBeNull();
  });

  it("O·T·I·L/J·S/Z를 저장 미노별 class 파일에서만 불러온다", () => {
    const o = setupsForCycle3Class("O");
    const t = setupsForCycle3Class("T");
    const l = setupsForCycle3Class("L");
    const j = setupsForCycle3Class("J");
    const i = setupsForCycle3Class("I");
    const s = setupsForCycle3Class("S");
    const z = setupsForCycle3Class("Z");
    expect(o.length).toBeGreaterThan(36);
    expect(t.length).toBeGreaterThan(54);
    expect(l).toHaveLength(122);
    expect(j).toHaveLength(122);
    expect(i.length).toBeGreaterThanOrEqual(28);
    expect(s).toHaveLength(32);
    expect(z).toHaveLength(32);
    expect(o.every(({ id }) => id.startsWith("cycle3-extra-o-"))).toBe(true);
    expect(t.every(({ id }) => id.startsWith("cycle3-extra-t-"))).toBe(true);
    expect(l.every(({ id }) => id.startsWith("cycle3-extra-lj-") && !id.includes("--mirror"))).toBe(true);
    expect(j.every(({ id }) => id.startsWith("cycle3-extra-lj-") && id.includes("--mirror"))).toBe(true);
    expect(i.every(({ id }) => id.startsWith("cycle3-extra-i-"))).toBe(true);
    expect(s.every(({ id }) => id.startsWith("cycle3-extra-sz-") && !id.endsWith("--mirror"))).toBe(true);
    expect(z.every(({ id }) => id.startsWith("cycle3-extra-sz-") && id.endsWith("--mirror"))).toBe(true);
    expect(t.every(({ displayName, formLabel }) =>
      !displayName.includes("해법") && !formLabel?.includes("해법") && formLabel !== displayName)).toBe(true);
  });

  it("승격한 모든 3회차 geometry가 공통 런타임 schema를 만족한다", () => {
    const promoted = ["O", "T", "I", "L", "J", "S", "Z"].flatMap((piece) =>
      setupsForCycle3Class(piece as "O" | "T" | "I" | "L" | "J" | "S" | "Z"));
    expect(promoted.length).toBeGreaterThan(0);
    for (const setup of promoted) {
      expect(validateSetup(setup)).toEqual([]);
      expect(setup.reviewStatus).toBe("reviewed");
      expect(setup.difficulty).toBeGreaterThanOrEqual(1);
      expect(setup.difficulty).toBeLessThanOrEqual(5);
      expect(setup.displayName.includes("해법")).toBe(false);
      expect(setup.formLabel?.includes("해법") ?? false).toBe(false);
      expect(setup.formLabel === setup.displayName || (setup.formLabel?.startsWith(setup.displayName) ?? false)).toBe(false);
    }
    expect(setupCoverageForCycle(3)).toMatchObject({
      logicalSetupCount: 196,
      setupCount: 203,
      complete: false,
    });
  });

  it("O 3회차는 live DOM의 asset byte와 이름·확률을 같은 record에 연결한다", () => {
    const byId = new Map(setupsForCycle3Class("O").map((setup) => [setup.id, setup]));
    const expected = [
      ["cycle3-extra-o-024-f000", "Butter Tower + Cliff, 93.97%", 93.97, 5],
      ["cycle3-extra-o-020-f000", "Legs, 100%", 100, 4],
      ["cycle3-extra-o-023-f000", "Cliff + O, 95.99%", 95.99, 4],
      ["cycle3-extra-o-026-f000", "Antidote (Hold T), 89.52%", 89.52, 4],
      ["cycle3-extra-o-013-f000", "3P Legs, 99.72%", 99.72, 3],
      ["cycle3-extra-o-031-f000", "99.60%", 99.6, 3],
    ] as const;

    for (const [id, displayName, solveRate, placementCount] of expected) {
      expect(byId.get(id)).toMatchObject({ displayName, solveRate });
      expect(byId.get(id)?.placements).toHaveLength(placementCount);
    }
  });

  function completedBoard(setup: SetupVariant) {
    return setup.placements.reduce(
      (board, placement) => placeCells(board, placement.cells, placement.piece),
      createBoard(),
    );
  }

  it("T-[TILJ] OQB는 독립 4P 후보 대신 공통 2P base만 먼저 추천한다", () => {
    const candidates = querySetups({
      cycle: 3,
      board: createBoard(),
      hold: "T",
      active: "L",
      next: ["T", "I", "J", "S", "Z"],
      holdAvailable: true,
      maxCandidates: 100,
    });
    const sourceIds = candidates.map(({ setup }) => setup.id.split("--box-")[0].replace(/--mirror$/, ""));
    expect(sourceIds).toContain("cycle3-extra-t-044-f000");
    expect(sourceIds).not.toContain("cycle3-extra-t-045-f000");
    expect(sourceIds).not.toContain("cycle3-extra-t-046-f000");
    expect(sourceIds).not.toContain("cycle3-extra-t-048-f000");
    expect(sourceIds).not.toContain("cycle3-extra-t-035-f000");
    expect(sourceIds).not.toContain("cycle3-extra-t-038-f000");
  });

  it("공통 2P 이후 NEXT 끝이 S/Z면 해당 I/J continuation으로 전환한다", () => {
    const base = setupsForCycle3Class("T").find(({ id }) => id === "cycle3-extra-t-044-f000")!;
    const resolution = resolveCycle3StagedSetup({
      cycle: 3,
      board: completedBoard(base),
      active: "I",
      hold: "J",
      next: ["O", "T", "L", "Z", "S"],
      holdAvailable: true,
    }, base);
    expect(resolution).toMatchObject({
      ruleId: "extra-t-tilj-method-one-next-bag",
      branchId: "extra-t-tilj-method-one-s-or-z",
      action: "extend-setup",
    });
    expect(resolution?.candidate?.setup.id.split("--box-")[0]).toBe("cycle3-extra-t-045-f000");
    expect(resolution?.candidate?.plan.steps.filter(({ action }) => action === "place")).toHaveLength(2);
  });

  it("T + IS 3P의 특수 prefix는 3P에서 해법으로, 그 외에는 복원한 media-35 4P로 전환한다", () => {
    const base = setupsForCycle3Class("T").find(({ id }) => id === "cycle3-extra-t-032-f000")!;
    const board = completedBoard(base);
    const special = resolveCycle3StagedSetup({
      cycle: 3, board, active: "L", hold: "O", next: ["J", "L", "S", "T", "S"], holdAvailable: true,
    }, base);
    expect(special).toMatchObject({ action: "solve-from-precondition", branchId: "extra-t-tils-is-ts" });
    expect(special?.candidate).toBeUndefined();

    const ordinary = resolveCycle3StagedSetup({
      cycle: 3, board, active: "L", hold: "O", next: ["T", "S", "Z", "O", "J"], holdAvailable: true,
    }, base);
    expect(ordinary).toMatchObject({ action: "extend-setup", branchId: "default" });
    expect(ordinary?.candidate?.setup.id.split("--box-")[0]).toBe("cycle3-extra-t-035-f000");
  });

  it("Extra I 브레인데드 section의 90.48%를 두 형태의 모든 GIF frame에 적용한다", () => {
    const byId = new Map(setupsForCycle3Class("I").map((setup) => [setup.id, setup]));
    for (const id of [
      "cycle3-extra-i-001-f000",
      "cycle3-extra-i-001-f001",
      "cycle3-extra-i-002-f000",
      "cycle3-extra-i-002-f001",
    ]) {
      expect(byId.get(id)?.solveRate).toBe(90.48);
    }
  });

  it("saved piece와 새 가방 전체 7미노 안에 드는 setup만 구축 후보로 남긴다", () => {
    const context = cycle3QueueContext(query())!;
    const catalog = setupsForCycle3Class("O");
    expect(catalog.some((setup) => fitsCycle3BuildPool(setup, context.buildPieces))).toBe(true);
    expect(catalog.filter((setup) => fitsCycle3BuildPool(setup, context.buildPieces))
      .every((setup) => setup.pieceSignature.every((piece) => context.buildPieces.includes(piece)))).toBe(true);
  });
});
