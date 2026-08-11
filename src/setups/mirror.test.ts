import { describe, expect, it } from "vitest";
import { sourceSetupCatalog } from "./catalog";
import { expandMirroredSetups, mirrorCell, mirrorPiece, mirrorSetup, setupGeometryKey } from "./mirror";
import { validateSetup } from "./schema";
import type { SetupVariant } from "./schema";

describe("setup mirror variants", () => {
  it("좌표와 chirality가 있는 미노를 함께 반전한다", () => {
    expect(mirrorCell({ x: 2, y: 3 })).toEqual({ x: 7, y: 3 });
    expect(mirrorPiece("J")).toBe("L");
    expect(mirrorPiece("L")).toBe("J");
    expect(mirrorPiece("S")).toBe("Z");
    expect(mirrorPiece("Z")).toBe("S");
    expect(mirrorPiece("I")).toBe("I");
    expect(mirrorPiece("O")).toBe("O");
    expect(mirrorPiece("T")).toBe("T");
  });

  it("두 번 반전한 geometry는 원본과 같다", () => {
    for (const setup of sourceSetupCatalog) {
      expect(setupGeometryKey(mirrorSetup(mirrorSetup(setup)))).toBe(setupGeometryKey(setup));
    }
  });

  it("I-spin 비대칭 퍼클률을 미러 variant에 적용하고 두 번 반전하면 복원한다", () => {
    const source = {
      ...sourceSetupCatalog[0],
      solveRate: 98.21,
      mirroredSolveRate: 98.33,
    };
    const mirrored = mirrorSetup(source);
    expect(mirrored.solveRate).toBe(98.33);
    expect(mirrored.mirroredSolveRate).toBe(98.21);

    const restored = mirrorSetup(mirrored);
    expect(restored.solveRate).toBe(98.21);
    expect(restored.mirroredSolveRate).toBe(98.33);
  });

  it("별도 미러 확률이 없으면 원본 퍼클률을 유지한다", () => {
    const source = { ...sourceSetupCatalog[0], solveRate: 97, mirroredSolveRate: undefined };
    expect(mirrorSetup(source).solveRate).toBe(97);
  });

  it("미러 여부를 이름에 붙이지 않고 명시된 좌우 방향만 바꾼다", () => {
    const hills = sourceSetupCatalog.find(({ id }) => id === "cycle1-hills-a")!;
    const elephant = sourceSetupCatalog.find(({ id }) => id === "cycle1-elephant-a")!;
    expect(mirrorSetup(hills).displayName).toBe("HILLS");
    expect(mirrorSetup(elephant).displayName).toBe("ELEPHANT [Left Side]");
  });

  it("셋업 이름과 form label의 미노 구성은 미러 기준으로 표시한다", () => {
    const tilsHeart = sourceSetupCatalog.find(({ id }) => id === "pcinfokorea-c2-005-f0")!;
    expect(tilsHeart.displayName).toBe("PCO + Heart (TILS)");

    const mirrored = mirrorSetup({ ...tilsHeart, formLabel: "TILS / IJS" });
    expect(mirrored.displayName).toBe("PCO + Heart (TIJZ)");
    expect(mirrored.formLabel).toBe("TIJZ / ILZ");
    expect(mirrorSetup(mirrored).displayName).toBe("PCO + Heart (TILS)");
  });

  it("QB 이름과 form label의 단일 미노 조건도 미러 기준으로 표시한다", () => {
    const source = sourceSetupCatalog.find(({ id }) => id === "cycle1-legs-a")!;
    const mirrored = mirrorSetup({
      ...source,
      displayName: "ILJS Z QB",
      formLabel: "ILJS · Z · 4P",
    });
    expect(mirrored.displayName).toBe("ILJZ S QB");
    expect(mirrored.formLabel).toBe("ILJZ · S · 4P");
  });

  it("고유 셋업명은 미노 구성으로 오인해 바꾸지 않는다", () => {
    const source = sourceSetupCatalog.find(({ id }) => id === "cycle1-hills-a")!;
    const mirrored = mirrorSetup({ ...source, displayName: "PCO + HILLS" });
    expect(mirrored.displayName).toBe("PCO + HILLS");
  });

  it("파생 미러가 원본을 참조하며 모두 유효한 geometry다", () => {
    const expanded = expandMirroredSetups(sourceSetupCatalog);
    const ids = new Set(expanded.map(({ id }) => id));
    expect(ids.size).toBe(expanded.length);
    for (const setup of expanded) {
      expect(validateSetup(setup)).toEqual([]);
      if (setup.derivedVariant === "mirror") {
        expect(setup.mirrorOf).toBeTruthy();
        expect(ids.has(setup.mirrorOf!)).toBe(true);
      }
      if (setup.mirroredVariantId) expect(ids.has(setup.mirroredVariantId)).toBe(true);
    }
  });

  it("원본 또는 이미 등록된 geometry와 같은 미러는 중복 추가하지 않는다", () => {
    const source = sourceSetupCatalog[0];
    const mirrored = mirrorSetup(source);
    const expanded = expandMirroredSetups([source, { ...mirrored, id: "existing-mirror", mirrorOf: undefined, mirroredVariantId: undefined, derivedVariant: undefined }]);
    const keys = expanded.map(setupGeometryKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(expanded).toHaveLength(2);
  });

  it("line-clear solution shadow의 색상과 시각 셀을 정확히 좌우 반전한다", () => {
    const source: SetupVariant = {
      id: "shadow",
      cycle: 5,
      family: "test",
      displayName: "Z solution",
      geometryKind: "solution-shadow",
      pieceSignature: ["Z"],
      placements: [{
        id: "z-projection",
        piece: "Z",
        cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 5, y: 3 }],
      }],
      fumen: "v115@shadow",
      difficulty: 3,
      reviewStatus: "reviewed",
    };

    const mirrored = mirrorSetup(source);
    expect(mirrored.geometryKind).toBe("solution-shadow");
    expect(mirrored.placements[0]).toMatchObject({
      piece: "S",
      cells: [{ x: 7, y: 0 }, { x: 9, y: 0 }, { x: 6, y: 1 }, { x: 4, y: 3 }],
    });
    expect(validateSetup(mirrored)).toEqual([]);
  });
});
