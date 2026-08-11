import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import { PIECES, type Piece } from "../engine/types";
import { cycle4ClassLabel, cycle4PiecePairKey } from "./cycle4Catalog";
import {
  setupCatalog,
  setupCoverageForCycle,
  setupsForCycle4Class,
  sourceSetupCatalog,
} from "./catalog";
import { cycle4QueueContext, fitsCycle4BuildPool } from "./cycle4Context";
import { queryCatalog, querySetups, type SetupQuery } from "./query";
import type { SetupVariant } from "./schema";

function query(overrides: Partial<SetupQuery> = {}): SetupQuery {
  return {
    cycle: 4,
    board: createBoard(),
    hold: "J",
    active: "O",
    next: ["S", "T", "Z", "I", "L"],
    holdAvailable: true,
    ...overrides,
  };
}

describe("4회차 5+6 일반 셋업 추천", () => {
  it("승격된 원본 geometry 56개와 21개 정상 class를 런타임에 연결한다", () => {
    const source = sourceSetupCatalog.filter(({ cycle }) => cycle === 4);
    const runtime = setupCatalog.filter(({ cycle }) => cycle === 4);
    expect(source).toHaveLength(56);
    expect(runtime.length).toBeGreaterThanOrEqual(source.length);
    expect(setupCoverageForCycle(4)).toMatchObject({
      logicalSetupCount: 47,
      setupCount: 56,
      runtimeVariantCount: runtime.length,
      complete: false,
    });
  });

  it("Qnia PCO 신규 geometry 8개만 기존 class catalog에 중복 없이 병합한다", () => {
    const source = sourceSetupCatalog.filter(({ cycle }) => cycle === 4);
    const promoted = source.filter(({ family }) => family.startsWith("qnia-cycle-4-"));
    const geometryKey = (setup: SetupVariant): string => setup.placements
      .map(({ piece, cells }) => `${piece}:${cells.map(({ x, y }) => `${x},${y}`).sort().join(";")}`)
      .sort()
      .join("|");

    expect(promoted).toHaveLength(8);
    expect(new Set(promoted.map(geometryKey))).toHaveLength(8);
    expect(promoted.every(({ fumen }) => fumen?.startsWith("v115@"))).toBe(true);
    for (const setup of promoted) {
      expect(source.filter((candidate) => geometryKey(candidate) === geometryKey(setup))).toHaveLength(1);
    }
  });

  it("HOLD + ACTIVE + NEXT 3을 첫 가방 다섯 미노로, NEXT[3]을 배치 불가 버퍼로 분리한다", () => {
    expect(cycle4QueueContext(query())).toEqual({
      buildPieces: ["J", "O", "S", "T", "Z"],
      searchNext: ["S", "T", "Z", "I", "L"],
      placeableNextCount: 3,
      missingPieces: ["I", "L"],
      classificationMode: "normal-missing-pair",
    });
  });

  it("HOLD가 비어 있으면 ACTIVE + NEXT 4 전체를 첫 가방으로 사용한다", () => {
    expect(cycle4QueueContext(query({
      hold: null,
      active: "J",
      next: ["O", "S", "T", "Z", "I"],
    }))).toEqual({
      buildPieces: ["J", "O", "S", "T", "Z"],
      searchNext: ["O", "S", "T", "Z", "I"],
      placeableNextCount: 4,
      missingPieces: ["I", "L"],
      classificationMode: "normal-missing-pair",
    });
  });

  it("21개 정상 누락쌍을 순서와 무관하게 정확히 한 class에 대응한다", () => {
    const keys = new Set<string>();
    for (let left = 0; left < PIECES.length; left += 1) {
      for (let right = left + 1; right < PIECES.length; right += 1) {
        const pair = [PIECES[left], PIECES[right]] as Piece[];
        const key = cycle4PiecePairKey(pair);
        keys.add(key);
        expect(cycle4PiecePairKey([...pair].reverse())).toBe(key);
        expect(cycle4ClassLabel(pair)).toBeDefined();
        expect(setupsForCycle4Class(pair).length).toBeGreaterThan(0);

        const buildPool = PIECES.filter((piece) => !pair.includes(piece));
        expect(setupsForCycle4Class(pair).every((setup) => fitsCycle4BuildPool(setup, buildPool))).toBe(true);
      }
    }
    expect(keys).toHaveLength(21);
  });

  it("source와 mirror class의 방향별 퍼클률을 덮어쓰지 않는다", () => {
    const source = setupsForCycle4Class(["I", "L"])
      .find(({ id }) => id === "cycle4-no-ilij-001-f000");
    const mirror = setupsForCycle4Class(["I", "J"])
      .find(({ mirrorOf }) => mirrorOf === "cycle4-no-ilij-001-f000");
    expect(source?.solveRate).toBe(99.46);
    expect(mirror?.solveRate).toBe(99.42);

    const sharedSource = setupsForCycle4Class(["O", "L"])
      .find(({ id }) => id === "cycle4-no-oloj-001-f000");
    const sharedMirror = setupsForCycle4Class(["O", "J"])
      .find(({ mirrorOf }) => mirrorOf === "cycle4-no-oloj-001-f000");
    expect(sharedSource?.solveRate).toBe(100);
    expect(sharedMirror?.solveRate).toBe(100);
  });

  it("Dragon + O의 양쪽 물리 geometry를 유지하고 큐마다 구축 가능한 방향만 추천한다", () => {
    const dragons = setupsForCycle4Class(["L", "J"])
      .filter(({ family }) => family === "pcinfokorea-cycle-4-no-lj-001");
    expect(dragons.map(({ id }) => id).sort()).toEqual([
      "cycle4-no-lj-001-f000",
      "cycle4-no-lj-001-f001",
    ]);
    expect(dragons.every(({ solveRate }) => solveRate === 98.12)).toBe(true);

    const permutations = (pieces: Piece[]): Piece[][] => pieces.length <= 1
      ? [pieces]
      : pieces.flatMap((piece, index) => permutations(pieces.filter((_, candidate) => candidate !== index))
        .map((tail) => [piece, ...tail]));
    // No LJ pool은 IOSZT이며 Dragon + O는 T를 저장한다.
    const queues = permutations(["I", "O", "S", "Z", "T"]);
    for (const dragon of dragons) {
      const buildableQueue = queues.find(([active, hold, ...next]) => queryCatalog([dragon], {
        cycle: 4,
        board: createBoard(),
        active,
        hold,
        next,
        holdAvailable: true,
      }).length === 1);
      expect(buildableQueue).toBeDefined();

      const [active, hold, ...next] = buildableQueue!;
      const candidates = queryCatalog(dragons, {
        cycle: 4,
        board: createBoard(),
        active,
        hold,
        next,
        holdAvailable: true,
      });
      expect(candidates).toHaveLength(1);
      expect(dragons.map(({ id }) => id)).toContain(candidates[0].setup.id);
      expect(candidates[0].plan.steps.some(({ action }) => action === "place")).toBe(true);
    }
  });

  it("3x4 Box + O의 O 위치별 자식은 공용 box minimal을 공유해도 추천 그룹을 분리한다", () => {
    const variants = setupsForCycle4Class(["I", "S"])
      .filter(({ family }) => family === "pcinfokorea-cycle-4-no-isiz-001");
    const groupsFor = (sourceId: string) => new Set(variants
      .filter(({ id }) => id.startsWith(sourceId))
      .map(({ recommendationGroup }) => recommendationGroup)
      .filter((group): group is string => group !== undefined));
    const leftAttachmentGroups = groupsFor("cycle4-no-isiz-001-f000");
    const rightAttachmentGroups = groupsFor("cycle4-no-isiz-001-f001");

    expect(leftAttachmentGroups.size).toBeGreaterThan(0);
    expect(rightAttachmentGroups.size).toBeGreaterThan(0);
    expect([...leftAttachmentGroups].some((group) => rightAttachmentGroups.has(group))).toBe(false);
  });

  it("정상 No IL 풀은 해당 class만 BFS로 조회하고 buffer를 geometry에 사용하지 않는다", () => {
    const candidates = querySetups(query());
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(8);
    expect(candidates.every(({ reasons }) => reasons[0] === "Classified as Cycle 4 No IL from the first five pieces.")).toBe(true);
    const buildPool = new Set<Piece>(["J", "O", "S", "T", "Z"]);
    expect(candidates.every(({ setup }) => setup.pieceSignature.every((piece) => buildPool.has(piece)))).toBe(true);
    expect(candidates.every(({ plan }) => plan.steps
      .filter(({ action }) => action === "place")
      .every(({ piece }) => buildPool.has(piece)))).toBe(true);
  });

  it("No OZ의 ILJS 4x4 Box는 class mirror로 선언된 왼쪽 anchor만 추천한다", () => {
    const screenshotQueue = query({
      hold: "T",
      active: "I",
      next: ["L", "J", "S", "O", "Z"],
    });
    expect(cycle4QueueContext(screenshotQueue)).toMatchObject({
      buildPieces: ["T", "I", "L", "J", "S"],
      missingPieces: ["O", "Z"],
    });

    const boxVariants = setupsForCycle4Class(["O", "Z"])
      .filter(({ displayName }) => displayName === "Box");
    expect(boxVariants.length).toBeGreaterThan(1);
    expect(new Set(boxVariants.map(({ placements }) => Math.min(
      ...placements.flatMap(({ cells }) => cells.map(({ x }) => x)),
    )))).toEqual(new Set([0]));

    const candidates = querySetups(screenshotQueue);
    const box = candidates.find(({ setup }) => setup.displayName === "Box");
    expect(box).toBeDefined();
    expect(box?.setup.derivedVariant).toBe("box-minimal");
    expect(box?.plan.steps.filter(({ action }) => action === "place").map(({ piece }) => piece))
      .toEqual(["I", "L", "J", "S"]);
  });

  it("중복미노 풀을 일반 No XY class로 오분류하지 않는다", () => {
    const duplicate = query({ hold: "T", active: "T", next: ["L", "J", "S", "O"] });
    expect(cycle4QueueContext(duplicate)).toMatchObject({
      missingPieces: [],
      classificationMode: "duplicate-pool-unsupported",
    });
    expect(querySetups(duplicate)).toEqual([]);
  });

  it("기본 후보 제한과 사용자 지정 후보 제한을 적용한다", () => {
    expect(querySetups(query()).length).toBeLessThanOrEqual(8);
    expect(querySetups(query({ maxCandidates: 1 }))).toHaveLength(1);
  });
});
