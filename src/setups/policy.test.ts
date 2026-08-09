import { describe, expect, it } from "vitest";
import { PIECES, type Piece } from "../engine/types";
import { setupPolicyForCycle, setupsForCycle, sourceSetupCatalog } from "./catalog";
import { evaluateSelectionPolicy } from "./policy";

const catalog = setupsForCycle(2);
const policy = setupPolicyForCycle(2)!;

function setup(id: string) {
  return catalog.find((candidate) => candidate.id === id)!;
}

function evaluate(id: string, prefix: string) {
  return evaluateSelectionPolicy(policy, setup(id), catalog, [...prefix] as Piece[]);
}

describe("2회차 조건부 추천 policy", () => {
  it("모든 원본 3P geometry에 명시적 세이브 조건이 있다", () => {
    const sourceThreePieceIds = sourceSetupCatalog
      .filter(({ cycle, placements }) => cycle === 2 && placements.length === 3)
      .map(({ id }) => id)
      .sort();
    const constrainedIds = policy.buildConstraints
      ?.flatMap(({ candidateSetupIds }) => candidateSetupIds)
      .sort();
    expect(constrainedIds).toEqual(sourceThreePieceIds);
    expect(policy.buildConstraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ requiredSavedPiece: "T", exactPoolSignature: "LOZT" }),
      expect.objectContaining({ requiredSavedPiece: "I", exactPoolSignature: "IOSZ" }),
    ]));
  });

  it("JLST의 ILO/LIO와 기본 방향을 구분한다", () => {
    expect(evaluate("pcinfokorea-c2-025-f1", "ILO")).toMatchObject({ preferred: true, solveRate: 100 });
    expect(evaluate("pcinfokorea-c2-025-f0", "ILO")).toMatchObject({ preferred: false });
    expect(evaluate("pcinfokorea-c2-025-f0", "JST")).toMatchObject({ preferred: true, solveRate: 100 });
  });

  it("TOSZ의 8개 특수 prefix에서 오른쪽을 선택한다", () => {
    for (const prefix of ["LOZ", "OLZ", "OIL", "OLI", "IOL", "ILO", "LOI", "LIO"]) {
      expect(evaluate("pcinfokorea-c2-027-f1", prefix)).toMatchObject({ preferred: true, solveRate: 100 });
      expect(evaluate("pcinfokorea-c2-027-f0", prefix)).toMatchObject({ preferred: false });
    }
    expect(evaluate("pcinfokorea-c2-027-f0", "JST")).toMatchObject({ preferred: true, solveRate: 100 });
  });

  it("OSZ에서 L/J가 모두 보이면 먼저 나온 미노의 방향을 따른다", () => {
    expect(evaluate("pcinfokorea-c2-037-f1", "LJI")).toMatchObject({ preferred: true, solveRate: 100 });
    expect(evaluate("pcinfokorea-c2-037-f0", "LJI")).toMatchObject({ preferred: false });
    expect(evaluate("pcinfokorea-c2-037-f0", "JLI")).toMatchObject({ preferred: true, solveRate: 100 });
    expect(evaluate("pcinfokorea-c2-037-f1", "JLI")).toMatchObject({ preferred: false });
    expect(evaluate("pcinfokorea-c2-037-f0", "IOT")).toMatchObject({ preferred: true, solveRate: 100 });
    expect(evaluate("pcinfokorea-c2-037-f1", "IOT")).toMatchObject({ preferred: true, solveRate: 100 });
  });

  it("3x4 Box + O는 대표 geometry에서 만든 두 minimal에 같은 방향 정책을 적용한다", () => {
    expect(evaluate("pcinfokorea-c2-036-f0", "JLI")).toMatchObject({ preferred: true, solveRate: 100 });
    expect(evaluate("pcinfokorea-c2-036-f0--box-minimal-m1-x0", "JLI"))
      .toMatchObject({ preferred: true, solveRate: 100 });
    expect(evaluate("pcinfokorea-c2-036-f1", "JLI")).toMatchObject({ preferred: false });
    expect(evaluate("pcinfokorea-c2-036-f1--box-minimal-m1-x0", "JLI"))
      .toMatchObject({ preferred: false });
  });

  it("파생 미러의 formLabel과 side를 반전하고 같은 방향 정책을 적용한다", () => {
    const mirrored = setup("pcinfokorea-c2-036-f0--mirror");
    expect(mirrored).toMatchObject({ formLabel: "right", side: "right" });
    expect(evaluateSelectionPolicy(policy, mirrored, catalog, [..."LJI"] as Piece[])).toMatchObject({
      preferred: true,
      solveRate: 100,
    });
  });

  it("다음 가방 prefix가 보이지 않으면 조건부 100%를 적용하지 않는다", () => {
    const evaluation = evaluateSelectionPolicy(policy, setup("pcinfokorea-c2-025-f0"), catalog, undefined);
    expect(evaluation).toMatchObject({
      branchId: "unobserved",
      preferred: false,
    });
    expect(evaluation?.solveRate).toBeUndefined();
  });

  it("7P3의 210개 prefix에서 모든 규칙이 적어도 한 권장 geometry를 선택한다", () => {
    const prefixes = PIECES.flatMap((first) =>
      PIECES.filter((second) => second !== first).flatMap((second) =>
        PIECES.filter((third) => third !== first && third !== second)
          .map((third) => [first, second, third] as Piece[])));

    expect(prefixes).toHaveLength(210);
    for (const rule of policy.selectionRules) {
      const candidates = rule.candidateSetupIds.map(setup);
      for (const prefix of prefixes) {
        const evaluations = candidates.map((candidate) =>
          evaluateSelectionPolicy(policy, candidate, catalog, prefix));
        expect(evaluations.some((evaluation) => evaluation?.preferred)).toBe(true);
        expect(evaluations.filter((evaluation) => evaluation?.preferred)
          .every((evaluation) => evaluation?.solveRate === 100)).toBe(true);
      }
    }
  });
});
