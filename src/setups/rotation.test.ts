import { describe, expect, it } from "vitest";
import { sourceSetupCatalog } from "./catalog";
import { setupGeometryKey } from "./mirror";
import { expandBoxSetups } from "./rotation";

function isFourByFour(setup: (typeof sourceSetupCatalog)[number]): boolean {
  const cells = setup.placements.flatMap((placement) => placement.cells);
  return Math.max(...cells.map(({ x }) => x)) - Math.min(...cells.map(({ x }) => x)) === 3
    && Math.max(...cells.map(({ y }) => y)) - Math.min(...cells.map(({ y }) => y)) === 3;
}

describe("공통 box geometry orbit", () => {
  it("ILJS 계열은 SFinder 회전형 minimal 네 개와 일곱 가로 위치만 생성한다", () => {
    const source = sourceSetupCatalog.find((setup) =>
      [...setup.pieceSignature].sort().join("") === "IJLS" && isFourByFour(setup));
    expect(source).toBeDefined();
    const expanded = expandBoxSetups([source!]);
    expect(expanded).toHaveLength(28);
    const layoutsAtX0 = new Set(expanded
      .filter(({ placements }) => Math.min(
        ...placements.flatMap(({ cells }) => cells.map(({ x }) => x)),
      ) === 0)
      .map(({ placements }) => Array.from({ length: 4 }, (_, y) =>
        Array.from({ length: 4 }, (_, x) => placements.find(({ cells }) =>
          cells.some((cell) => cell.x === x && cell.y === y))!.piece).join(""),
      ).join("/")));
    expect(layoutsAtX0).toEqual(new Set([
      "LLSI/LSSI/LSJI/JJJI",
      "JJJI/JSLI/SSLI/SLLI",
      "JLLL/JSSL/JJSS/IIII",
      "IIII/JLLL/JSSL/JJSS",
    ]));
    const xPositions = new Set(expanded.map(({ placements }) => Math.min(
      ...placements.flatMap(({ cells }) => cells.map(({ x }) => x)),
    )));
    expect(xPositions).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
    expect(new Set(expanded.map(setupGeometryKey)).size).toBe(expanded.length);
    expect(expanded.every(({ placements }) => placements.flatMap(({ cells }) => cells)
      .every(({ x, y }) => x >= 0 && x < 10 && y >= 0 && y < 4))).toBe(true);
    expect(expanded.every(({ derivedVariant }) => derivedVariant === "box-minimal")).toBe(true);
    expect(new Set(expanded.map(({ formLabel }) => formLabel?.match(/minimal (\d+)/)?.[1])).size).toBe(4);
    const expectedGroup = source!.recommendationGroup ?? `cycle${source!.cycle}-iljs-box`;
    expect(expanded.every(({ recommendationGroup }) =>
      recommendationGroup === expectedGroup)).toBe(true);
  });

  it("ILJO 계열은 SFinder 회전형 minimal 다섯 개와 일곱 가로 위치만 생성한다", () => {
    const source = sourceSetupCatalog.find((setup) =>
      [...setup.pieceSignature].sort().join("") === "IJLO" && isFourByFour(setup));
    expect(source).toBeDefined();
    const expanded = expandBoxSetups([source!]);
    expect(expanded).toHaveLength(35);
    expect(expanded.filter(({ derivedVariant }) => derivedVariant === "box-minimal")).toHaveLength(34);
    const layoutsAtX0 = new Set(expanded
      .filter(({ placements }) => Math.min(
        ...placements.flatMap(({ cells }) => cells.map(({ x }) => x)),
      ) === 0)
      .map(({ placements }) => Array.from({ length: 4 }, (_, y) =>
        Array.from({ length: 4 }, (_, x) => placements.find(({ cells }) =>
          cells.some((cell) => cell.x === x && cell.y === y))!.piece).join(""),
      ).join("/")));
    expect(layoutsAtX0).toEqual(new Set([
      "IJJJ/IJOO/ILOO/ILLL",
      "JOOL/JOOL/JJLL/IIII",
      "LLJJ/LOOJ/LOOJ/IIII",
      "IIII/JOOL/JOOL/JJLL",
      "IIII/LLJJ/LOOJ/LOOJ",
    ]));
    expect(new Set(expanded.map(({ placements }) => Math.min(
      ...placements.flatMap(({ cells }) => cells.map(({ x }) => x)),
    )))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
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
