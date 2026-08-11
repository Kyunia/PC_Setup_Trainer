import { describe, expect, it } from "vitest";
import { setupsForCycle6Class, sourceSetupCatalog } from "./catalog";
import { setupGeometryKey } from "./mirror";
import { expandEquivalentPlacementVariants } from "./placementVariants";
import { expandBoxSetups } from "./rotation";

function isFourByFour(setup: (typeof sourceSetupCatalog)[number]): boolean {
  const cells = setup.placements.flatMap((placement) => placement.cells);
  return Math.max(...cells.map(({ x }) => x)) - Math.min(...cells.map(({ x }) => x)) === 3
    && Math.max(...cells.map(({ y }) => y)) - Math.min(...cells.map(({ y }) => y)) === 3;
}

function wholeBoxWidth(setup: (typeof sourceSetupCatalog)[number]): 3 | 4 | null {
  if (setup.placements.length !== 3 && setup.placements.length !== 4) return null;
  const cells = setup.placements.flatMap((placement) => placement.cells);
  const xs = cells.map(({ x }) => x);
  const ys = cells.map(({ y }) => y);
  const width = setup.placements.length as 3 | 4;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxX - minX !== width - 1 || maxY - minY !== 3) return null;
  const occupied = new Set(cells.map(({ x, y }) => `${x},${y}`));
  return Array.from({ length: 4 }, (_, y) =>
    Array.from({ length: width }, (_, x) => occupied.has(`${minX + x},${minY + y}`)))
    .flat().every(Boolean) ? width : null;
}

describe("공통 box geometry orbit", () => {
  it("ILJS 계열은 source anchor에서 SFinder minimal 네 개만 생성한다", () => {
    const source = sourceSetupCatalog.find((setup) =>
      [...setup.pieceSignature].sort().join("") === "IJLS" && isFourByFour(setup));
    expect(source).toBeDefined();
    const expanded = expandBoxSetups([source!]);
    expect(expanded).toHaveLength(4);
    const sourceX = Math.min(...source!.placements.flatMap(({ cells }) => cells.map(({ x }) => x)));
    const layoutsAtSource = new Set(expanded
      .map(({ placements }) => Array.from({ length: 4 }, (_, y) =>
        Array.from({ length: 4 }, (_, x) => placements.find(({ cells }) =>
          cells.some((cell) => cell.x === sourceX + x && cell.y === y))!.piece).join(""),
      ).join("/")));
    expect(layoutsAtSource).toEqual(new Set([
      "LLSI/LSSI/LSJI/JJJI",
      "JJJI/JSLI/SSLI/SLLI",
      "JLLL/JSSL/JJSS/IIII",
      "IIII/JLLL/JSSL/JJSS",
    ]));
    const xPositions = new Set(expanded.map(({ placements }) => Math.min(
      ...placements.flatMap(({ cells }) => cells.map(({ x }) => x)),
    )));
    expect(xPositions).toEqual(new Set([sourceX]));
    expect(new Set(expanded.map(setupGeometryKey)).size).toBe(expanded.length);
    expect(expanded.every(({ placements }) => placements.flatMap(({ cells }) => cells)
      .every(({ x, y }) => x >= 0 && x < 10 && y >= 0 && y < 4))).toBe(true);
    expect(expanded.every(({ derivedVariant }) => derivedVariant === "box-minimal")).toBe(true);
    expect(new Set(expanded.map(({ formLabel }) => formLabel?.match(/minimal (\d+)/)?.[1])).size).toBe(4);
    const expectedGroup = source!.recommendationGroup ?? `cycle${source!.cycle}-iljs-box`;
    expect(expanded.every(({ recommendationGroup }) =>
      recommendationGroup === expectedGroup)).toBe(true);
  });

  it("ILJO 계열은 source anchor에서 SFinder minimal 다섯 개만 생성한다", () => {
    const source = sourceSetupCatalog.find((setup) =>
      [...setup.pieceSignature].sort().join("") === "IJLO" && isFourByFour(setup));
    expect(source).toBeDefined();
    const expanded = expandBoxSetups([source!]);
    expect(expanded).toHaveLength(5);
    expect(expanded.filter(({ derivedVariant }) => derivedVariant === "box-minimal")).toHaveLength(4);
    const sourceX = Math.min(...source!.placements.flatMap(({ cells }) => cells.map(({ x }) => x)));
    const layoutsAtSource = new Set(expanded
      .map(({ placements }) => Array.from({ length: 4 }, (_, y) =>
        Array.from({ length: 4 }, (_, x) => placements.find(({ cells }) =>
          cells.some((cell) => cell.x === sourceX + x && cell.y === y))!.piece).join(""),
      ).join("/")));
    expect(layoutsAtSource).toEqual(new Set([
      "IJJJ/IJOO/ILOO/ILLL",
      "JOOL/JOOL/JJLL/IIII",
      "LLJJ/LOOJ/LOOJ/IIII",
      "IIII/JOOL/JOOL/JJLL",
      "IIII/LLJJ/LOOJ/LOOJ",
    ]));
    expect(new Set(expanded.map(({ placements }) => Math.min(
      ...placements.flatMap(({ cells }) => cells.map(({ x }) => x)),
    )))).toEqual(new Set([sourceX]));
  });

  it("명시적 physical alternative는 각 선언 anchor에서 minimal을 유지한다", () => {
    const source = sourceSetupCatalog.find((setup) =>
      [...setup.pieceSignature].sort().join("") === "IJLS" && isFourByFour(setup))!;
    const sourceX = Math.min(...source.placements.flatMap(({ cells }) => cells.map(({ x }) => x)));
    const targetX = sourceX === 0 ? 6 : 0;
    const physical = expandEquivalentPlacementVariants([{
      ...source,
      equivalentPlacementVariants: [{
        id: "opposite-wall",
        translations: source.placements.map(({ id }) => ({
          placementId: id,
          dx: targetX - sourceX,
          dy: 0,
        })),
      }],
    }]);
    const expanded = expandBoxSetups(physical);
    expect(expanded).toHaveLength(8);
    expect(new Set(expanded.map(({ placements }) => Math.min(
      ...placements.flatMap(({ cells }) => cells.map(({ x }) => x)),
    )))).toEqual(new Set([sourceX, targetX]));
  });

  it("Cycle 6 No O의 policy-authorized mirror만 반대쪽 Box 위치를 만든다", () => {
    const source = sourceSetupCatalog.find(({ id }) => id === "cycle6-no-o-005-f000")!;
    expect(source).not.toHaveProperty("boxHorizontalConstraint");
    const expanded = setupsForCycle6Class("O")
      .filter(({ recommendationGroup }) => recommendationGroup === "cycle6-iljs-box");
    expect(expanded).toHaveLength(8);
    expect(new Set(expanded.map(({ placements }) => Math.min(
      ...placements.flatMap(({ cells }) => cells.map(({ x }) => x)),
    )))).toEqual(new Set([0, 6]));
  });

  it("모든 일반 source whole Box는 데이터 anchor 밖의 가로 위치를 만들지 않는다", () => {
    const sources = sourceSetupCatalog.filter((setup) => wholeBoxWidth(setup) !== null);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      const sourceX = Math.min(...source.placements.flatMap(({ cells }) => cells.map(({ x }) => x)));
      expect(new Set(expandBoxSetups([source]).map(({ placements }) => Math.min(
        ...placements.flatMap(({ cells }) => cells.map(({ x }) => x)),
      ))), source.id).toEqual(new Set([sourceX]));
    }
  });

  it("4×4를 채우지 않는 일반 셋업은 파생하지 않는다", () => {
    const source = sourceSetupCatalog.find((setup) => setup.placements.length === 3)!;
    const expanded = expandBoxSetups([source]);
    expect(expanded).toHaveLength(1);
    expect(expanded[0].id).toBe(source.id);
  });

  it("JSL 3×4 box + O는 O를 고정하고 SFinder minimal 두 개만 묶는다", () => {
    const first = sourceSetupCatalog.find(({ id }) => id === "pcinfokorea-c2-036-f0")!;
    const generated = expandBoxSetups([first]);
    expect(generated).toHaveLength(2);

    const sourceO = first.placements.find(({ piece }) => piece === "O")!.cells
      .map(({ x, y }) => `${x},${y}`).sort().join(";");
    expect(generated.every(({ placements }) =>
      placements.find(({ piece }) => piece === "O")!.cells
        .map(({ x, y }) => `${x},${y}`).sort().join(";") === sourceO))
      .toBe(true);
    expect(generated.filter(({ derivedVariant }) => derivedVariant === "box-minimal")).toHaveLength(1);

    expect(new Set(generated.map(({ recommendationGroup }) => recommendationGroup)).size).toBe(1);
  });

  it("No S/Z 6회차 4×4 box + O는 O를 고정하고 SFinder minimal 네 개만 생성한다", () => {
    const forms = sourceSetupCatalog.filter(({ id }) => /^cycle6-no-sz-001-f00[0-7]$/.test(id));
    expect(forms).toHaveLength(1);
    const generated = expandBoxSetups([forms[0]]);
    expect(generated).toHaveLength(4);
    expect(generated.filter(({ derivedVariant }) => derivedVariant === "box-minimal")).toHaveLength(3);

    const expanded = expandBoxSetups(forms);
    expect(expanded).toHaveLength(4);
    expect(new Set(expanded.map(({ recommendationGroup }) => recommendationGroup)).size).toBe(1);

    const sourceO = forms[0].placements.find(({ piece }) => piece === "O")!.cells
      .map(({ x, y }) => `${x},${y}`).sort().join(";");
    expect(expanded.every(({ placements }) =>
      placements.find(({ piece }) => piece === "O")!.cells
        .map(({ x, y }) => `${x},${y}`).sort().join(";") === sourceO))
      .toBe(true);
  });
});
