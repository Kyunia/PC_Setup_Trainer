import { describe, expect, it } from "vitest";
import rawPolicy from "../../setups/QB/cycle-2-advanced-qb-policy.json";
import rawSetups from "../../setups/QB/cycle-2-advanced-qb-setups.json";
import { createBoard } from "../engine/board";
import { PIECES, type Piece } from "../engine/types";
import {
  cycle2AdvancedQbClass,
  cycle2AdvancedQbConditionLabel,
  cycle2AdvancedQbSaveTargets,
  matchCycle2AdvancedQbPattern,
  selectCycle2AdvancedQbSetups,
  type Cycle2AdvancedQbPolicy,
} from "./cycle2AdvancedQb";
import { cycle2AdvancedQbRuntimeBundle } from "./cycle2AdvancedQbCatalog";
import { querySetups } from "./query";
import { findBuildPlan } from "./reachability";
import type { SetupVariant } from "./schema";

const policy = rawPolicy as unknown as Cycle2AdvancedQbPolicy;
const setups = rawSetups as unknown as SetupVariant[];

function combinations<T>(values: readonly T[], count: number, start = 0, prefix: T[] = []): T[][] {
  if (prefix.length === count) return [prefix];
  const result: T[][] = [];
  for (let index = start; index <= values.length - (count - prefix.length); index += 1) {
    result.push(...combinations(values, count, index + 1, [...prefix, values[index]]));
  }
  return result;
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((tail) => [value, ...tail]));
}

function match(label: string, prefix: string, conditionLabel = label) {
  const includeNextBagPatterns = label.includes("/")
      ? label.split("/").map((part) => part.trim())
      : label.startsWith("[") && label.includes(", ")
        ? label.split(", ").map((part) => part.trim())
        : [label];
  const order = conditionLabel.match(/\(([IJLOSTZ])[<>]([IJLOSTZ])\)/);
  return matchCycle2AdvancedQbPattern(
    {
      runtimeCondition: {
        includeNextBagPatterns,
        ...(order ? { nextBagOrderBefore: [order[1], order[2]] as [Piece, Piece] } : {}),
      },
    },
    [...prefix] as Piece[],
  );
}

describe("2회차 고급 QB 추천 정책", () => {
  it("승격된 284개 geometry와 policy entry를 일대일로 연결한다", () => {
    expect(setups).toHaveLength(284);
    expect(policy.entries).toHaveLength(284);
    expect(new Set(setups.map(({ id }) => id))).toEqual(new Set(policy.entries.map(({ setupId }) => setupId)));
    expect(setups.every(({ reviewStatus }) => reviewStatus === "reviewed")).toBe(true);
    expect(policy.reviewStatus).toBe("reviewed");
    expect(policy.qbSemantics?.oqbExcluded).toBe(true);
    expect(setups.every(({ displayName, formLabel }) => !/[가-힣]/u.test(`${displayName} ${formLabel ?? ""}`))).toBe(true);
    expect(policy.entries.every(({ conditionLabel, runtimeCondition }) =>
      !/[가-힣]/u.test(`${conditionLabel} ${runtimeCondition.guidance ?? ""} ${runtimeCondition.includeNextBagPatterns.join(" ")}`))).toBe(true);
  });

  it("284개 QB의 최종 세이브 미노를 정규화하고 3P 구축 잔여 미노와 구분한다", () => {
    for (const entry of policy.entries) {
      expect(entry.saveTargets.length, entry.setupId).toBeGreaterThan(0);
      expect(entry.saveTargets, entry.setupId).toEqual([...new Set(entry.saveTargets)].sort());
      expect(entry.saveTargets.every((piece) => PIECES.includes(piece))).toBe(true);
      expect(entry.saveTargetMode).toBe(entry.saveTargets.length === 1 ? "fixed" : "solution-dependent");
      expect(entry.runtimeCondition.includeNextBagPatterns.length).toBeGreaterThan(0);
    }

    const byId = new Map(policy.entries.map((entry) => [entry.setupId, entry]));
    // OIS 3P consumes O/I/S from OISZ, so its build leftover is Z; the
    // documented final QB goal is nevertheless T-save.
    expect(byId.get("cycle2-advanced-even-qb-oisz-005-f000")?.saveTargets).toEqual(["T"]);
    // This source caption omits a target; the two linked solution pages save L or O.
    expect(byId.get("cycle2-advanced-odd-qb-oilzoijs-007-f000")?.saveTargets).toEqual(["L", "O"]);
    expect(cycle2AdvancedQbSaveTargets({ saveTargets: ["L", "O", "S"] }, false)).toEqual(["L", "O", "S"]);
    expect(cycle2AdvancedQbSaveTargets({ saveTargets: ["L", "O", "S"] }, true)).toEqual(["J", "O", "Z"]);
  });

  it("21개 source class와 14개 class mirror로 35개 네 미노 pool을 모두 유일하게 분류한다", () => {
    const classes = combinations(PIECES, 4).map((pool) => cycle2AdvancedQbClass(policy, pool));
    expect(classes).toHaveLength(35);
    expect(classes.every((value) => value !== null)).toBe(true);
    expect(new Set(classes.map((value) => value?.actualPool))).toHaveLength(35);
    expect(new Set(classes.map((value) => value?.sourcePool))).toHaveLength(21);
  });

  it("집합·순서·고정 prefix·대안 표기를 구분한다", () => {
    expect(match("OJ", "TJO")).toMatchObject({ matches: true, rank: 30 });
    expect(match("OLJ", "JOL")).toMatchObject({ matches: true, rank: 10 });
    expect(match("OLJ", "JOT").matches).toBe(false);
    expect(match("I,L", "TIL")).toMatchObject({ matches: true, rank: 20 });
    expect(match("I,L", "TLI").matches).toBe(false);
    expect(match("I>L", "TIL")).toMatchObject({ matches: true, rank: 20 });
    expect(match("[LJ]!T", "JLT")).toMatchObject({ matches: true, rank: 0 });
    expect(match("[LJ]!T", "TLJ").matches).toBe(false);
    expect(match("L[JZ]!", "LZJ")).toMatchObject({ matches: true, rank: 0 });
    expect(match("=SIZ", "SIZ")).toMatchObject({ matches: true, rank: 0 });
    expect(match("=SIZ", "SZI").matches).toBe(false);
    expect(match("IL/IJ", "TIJ").matches).toBe(true);
    expect(match("LS / JS", "TJS").matches).toBe(true);
    expect(match("[LJ]!S, [JS]!L", "JLS").matches).toBe(true);
    expect(match("OLJ 1", "OLJ", "OLJ 1 (L<J) (save T)").matches).toBe(true);
    expect(match("OLJ 1", "OJL", "OLJ 1 (L<J) (save T)").matches).toBe(false);
  });

  it("자연어에서 추출한 QB 조건을 셋업명과 분리한다", () => {
    const byId = new Map(policy.entries.map((entry) => [entry.setupId, entry]));
    const ois = byId.get("cycle2-advanced-even-qb-oisz-005-f000")!;
    const oiz = byId.get("cycle2-advanced-even-qb-oisz-007-f000")!;
    expect(ois.runtimeCondition.includeNextBagPatterns).toEqual(["[LJ]!X"]);
    expect(oiz.runtimeCondition.includeNextBagPatterns).toEqual(["[LJ]!X"]);
    expect(ois.runtimeCondition?.buildOrderBefore).toEqual(["S", "Z"]);
    expect(oiz.runtimeCondition?.buildOrderBefore).toEqual(["Z", "S"]);

    const sourceDirection = selectCycle2AdvancedQbSetups(
      setups, policy, [..."OISZ"] as Piece[], [..."LJT"] as Piece[],
      { includeRuntimeDisabled: true },
    );
    expect(sourceDirection.some(({ entry }) => entry.setupId === ois.setupId)).toBe(true);
    expect(sourceDirection.some(({ entry }) => entry.setupId === oiz.setupId)).toBe(false);

    const mirrorDirection = selectCycle2AdvancedQbSetups(
      setups, policy, [..."OIZS"] as Piece[], [..."LJT"] as Piece[],
      { includeRuntimeDisabled: true },
    );
    expect(mirrorDirection.some(({ entry }) => entry.setupId === oiz.setupId)).toBe(true);
    expect(mirrorDirection.some(({ entry }) => entry.setupId === ois.setupId)).toBe(false);
  });

  it("다중 캡션·순서 예외를 축약하지 않는다", () => {
    const byId = new Map(policy.entries.map((entry) => [entry.setupId, entry]));
    const shared = byId.get("cycle2-advanced-odd-qb-oilsoijz-009-f000")!;
    for (const prefix of ["TIL", "TLJ", "TLZ", "LJZ"]) {
      expect(matchCycle2AdvancedQbPattern(shared, [...prefix] as Piece[]).matches).toBe(true);
    }

    const isz = byId.get("cycle2-advanced-odd-qb-tlsztjsz-013-f000")!;
    for (const prefix of ["ISZ", "IZS", "SIZ", "ZIS"]) {
      expect(matchCycle2AdvancedQbPattern(isz, [...prefix] as Piece[]).matches).toBe(true);
    }
    for (const prefix of ["SZI", "ZSI"]) {
      expect(matchCycle2AdvancedQbPattern(isz, [...prefix] as Piece[]).matches).toBe(false);
    }

    const form1 = byId.get("cycle2-advanced-odd-qb-olszojsz-009-f000")!;
    const form2 = byId.get("cycle2-advanced-odd-qb-olszojsz-010-f000")!;
    expect(matchCycle2AdvancedQbPattern(form1, [..."JLS"] as Piece[]).matches).toBe(true);
    expect(matchCycle2AdvancedQbPattern(form1, [..."JSL"] as Piece[]).matches).toBe(false);
    expect(matchCycle2AdvancedQbPattern(form2, [..."JSL"] as Piece[]).matches).toBe(true);
    expect(matchCycle2AdvancedQbPattern(form2, [..."JLS"] as Piece[]).matches).toBe(false);

    const oilException = byId.get("cycle2-advanced-odd-qb-oilzoijs-006-f000")!;
    expect(matchCycle2AdvancedQbPattern(oilException, [..."OLI"] as Piece[]).matches).toBe(true);
    expect(matchCycle2AdvancedQbPattern(oilException, [..."JIL"] as Piece[]).matches).toBe(true);
  });

  it("정확 조건을 일반 조건보다 우선하고, 특정 조건이 없을 때만 fallback을 쓴다", () => {
    const exact = selectCycle2AdvancedQbSetups(setups, policy, [..."TOIS"] as Piece[], [..."TOI"] as Piece[], {
      includeRuntimeDisabled: true,
    });
    expect(exact.length).toBeGreaterThan(0);
    expect(new Set(exact.map(({ entry }) => entry.runtimeCondition.includeNextBagPatterns.join("/")))).toEqual(new Set(["TOI"]));

    const bracket = selectCycle2AdvancedQbSetups(setups, policy, [..."TOIS"] as Piece[], [..."ILT"] as Piece[], {
      includeRuntimeDisabled: true,
    });
    expect(new Set(bracket.map(({ entry }) => entry.runtimeCondition.includeNextBagPatterns.join("/")))).toEqual(new Set(["[IL]!X"]));

    const fallback = selectCycle2AdvancedQbSetups(setups, policy, [..."TOIS"] as Piece[], [..."TIS"] as Piece[], {
      includeRuntimeDisabled: true,
    });
    expect(new Set(fallback.map(({ entry }) => entry.runtimeCondition.includeNextBagPatterns.join("/")))).toEqual(new Set(["All Other Cases"]));
  });

  it("class mirror는 geometry와 관측 prefix를 함께 반전한다", () => {
    const source = selectCycle2AdvancedQbSetups(setups, policy, [..."TOIS"] as Piece[], [..."OJT"] as Piece[], {
      includeRuntimeDisabled: true,
    });
    const mirrored = selectCycle2AdvancedQbSetups(setups, policy, [..."TOIZ"] as Piece[], [..."OLT"] as Piece[], {
      includeRuntimeDisabled: true,
    });
    expect(source.some(({ entry, mirroredGeometry }) => entry.runtimeCondition.includeNextBagPatterns.includes("OJ") && !mirroredGeometry)).toBe(true);
    expect(mirrored.some(({ entry, mirroredGeometry }) => entry.runtimeCondition.includeNextBagPatterns.includes("OJ") && mirroredGeometry)).toBe(true);
    expect(mirrored.every(({ setup }) => setup.id.includes("--mirror"))).toBe(true);
    expect(cycle2AdvancedQbConditionLabel({ conditionLabel: "Z" }, true)).toBe("S");
  });

  it("선택된 baseline은 다음 가방 3미노를 놓지 않고 실제 BFS로 구축 가능하다", () => {
    const prefix = [..."OJT"] as Piece[];
    const selected = selectCycle2AdvancedQbSetups(setups, policy, [..."TOIS"] as Piece[], prefix, {
      includeRuntimeDisabled: true,
    });
    const buildable = permutations([..."TOIS"] as Piece[]).some(([hold, active, first, second]) =>
      selected.some(({ setup }) => findBuildPlan(
        setup,
        createBoard(),
        active,
        hold,
        [first, second, ...prefix],
        true,
        2,
      ) !== null));
    expect(buildable).toBe(true);
  });

  it("manifest로 활성화된 승격본을 실제 querySetups의 QB 후보로 연결한다", () => {
    expect(cycle2AdvancedQbRuntimeBundle()).not.toBeNull();
    const prefix = [..."OJT"] as Piece[];
    const baselines = selectCycle2AdvancedQbSetups(setups, policy, [..."TOIS"] as Piece[], prefix);
    const order = permutations([..."TOIS"] as Piece[]).find(([hold, active, first, second]) =>
      baselines.some(({ setup }) => findBuildPlan(
        setup,
        createBoard(),
        active,
        hold,
        [first, second, ...prefix],
        true,
        2,
      ) !== null));
    expect(order).toBeDefined();
    const [hold, active, first, second] = order!;
    const candidates = querySetups({
      cycle: 2,
      board: createBoard(),
      hold,
      active,
      next: [first, second, ...prefix],
      holdAvailable: true,
    }).filter(({ qbCondition }) => qbCondition !== undefined);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some(({ qbCondition }) => qbCondition?.startsWith("OJ"))).toBe(true);
    expect(candidates.every(({ qbSaveTargets }) => (qbSaveTargets?.length ?? 0) > 0)).toBe(true);
    expect(candidates.every(({ setup }) => setup.placements.length === 3 || setup.placements.length === 4)).toBe(true);
    expect(candidates.every(({ plan }) => plan.steps
      .filter(({ action }) => action === "place")
      .every(({ piece }) => ([..."TOIS"] as Piece[]).includes(piece)))).toBe(true);
  });

  it("ILJZ + SJL에서 미러 S QB와 LJ QB를 모두 추천한다", () => {
    const candidates = querySetups({
      cycle: 2,
      board: createBoard(),
      hold: "L",
      active: "I",
      next: ["Z", "J", "S", "J", "L"],
      holdAvailable: true,
    }).filter(({ qbCondition }) => qbCondition !== undefined);

    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map(({ qbCondition }) => qbCondition))).toEqual(new Set(["S", "LJ"]));
    expect(new Set(candidates.map(({ setup }) => setup.displayName)))
      .toEqual(new Set(["ILJZ S QB", "ILJZ LJ QB"]));
    expect(candidates.every(({ setup }) => setup.id.endsWith("--mirror"))).toBe(true);
  });
});
