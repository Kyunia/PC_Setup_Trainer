import { describe, expect, it } from "vitest";
import rawCycle6NoOQb from "../../setups/QB/cycle-6-no-o-qb-setups.json";
import { sourceSetupCatalog } from "./catalog";
import type { SetupVariant } from "./schema";
import {
  canonicalLabeledMirrorGeometryKey,
  exactOccupiedSilhouetteKey,
  groupLogicalSetups,
} from "./logicalGrouping";

describe("logical setup presentation groups", () => {
  it("keeps Cycle 2 PCO + Heart compositions as physical children of one logical parent", () => {
    const children = sourceSetupCatalog.filter(({ family }) => family === "pco-heart");
    const groups = groupLogicalSetups(children);

    expect(children).toHaveLength(8);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      displayName: "PCO + Heart",
      relation: "mixed",
      pieceCount: 4,
    });
    expect(groups[0].children).toHaveLength(8);
    expect(new Set(groups[0].children.map(({ pieceSignature }) => [...pieceSignature].sort().join(""))).size)
      .toBeGreaterThan(1);
  });

  it("groups Dragon + O source mirrors without deleting either authoritative geometry", () => {
    const children = sourceSetupCatalog.filter(({ id }) =>
      id === "cycle4-no-lj-001-f000" || id === "cycle4-no-lj-001-f001");
    const groups = groupLogicalSetups(children);

    expect(children).toHaveLength(2);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ displayName: "Dragon + O", relation: "mirror" });
    expect(groups[0].children).toHaveLength(2);
    expect(new Set(children.map(exactOccupiedSilhouetteKey)).size).toBe(2);
    expect(new Set(children.map(canonicalLabeledMirrorGeometryKey)).size).toBe(1);
  });

  it("groups Cycle 7 composition analogues under their shared family silhouette", () => {
    const children = sourceSetupCatalog.filter(({ cycle, family }) => cycle === 7 && family === "heart-t");
    const groups = groupLogicalSetups(children);

    expect(children).toHaveLength(4);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ displayName: "Heart + T", relation: "composition" });
    expect(new Set(children.map(({ pieceSignature }) => [...pieceSignature].sort().join(""))).size).toBe(4);
  });

  it("keeps positional forms as children of one family parent without changing either geometry", () => {
    const children = sourceSetupCatalog.filter(({ id }) =>
      id === "cycle4-no-isiz-001-f000" || id === "cycle4-no-isiz-001-f001");
    const groups = groupLogicalSetups(children);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ displayName: "3x4 Box + O", relation: "positional" });
    expect(groups[0].children).toHaveLength(2);
    expect(new Set(children.map(exactOccupiedSilhouetteKey)).size).toBe(2);
    expect(new Set(children.map(canonicalLabeledMirrorGeometryKey)).size).toBe(2);
  });

  it("does not merge differently named setup types that reuse a broad family", () => {
    const boxTypes = sourceSetupCatalog.filter(({ cycle, family }) => cycle === 2 && family === "box");
    const groups = groupLogicalSetups(boxTypes);

    expect(boxTypes.some(({ displayName }) => displayName.startsWith("4x4 Box"))).toBe(true);
    expect(boxTypes.map(({ displayName }) => displayName)).toContain("3x4 Box + O");
    expect(groups).toHaveLength(2);
    expect(groups.map(({ displayName, children }) => [displayName, children.length]).sort())
      .toEqual([["3x4 Box + O", 2], ["4x4 Box", 2]]);
  });

  it("does not merge different families even when their geometry is identical", () => {
    const source = sourceSetupCatalog.find(({ id }) => id === "cycle4-no-lj-001-f000")!;
    const otherFamily = {
      ...source,
      id: `${source.id}-other-family`,
      family: `${source.family}-other`,
    };

    expect(groupLogicalSetups([source, otherFamily])).toHaveLength(2);
  });

  it("forms logical parents for representative multi-form families in Cycles 1, 3, 4, 5, and 6", () => {
    const cases = [
      { cycle: 1, family: "grace-system", count: 2 },
      { cycle: 3, family: "pcinfokorea-extra-i-source-item-001", count: 2 },
      { cycle: 4, family: "pcinfokorea-cycle-4-no-lj-001", count: 2 },
      { cycle: 5, family: "pcinfokorea-cycle-5-lj-024", count: 8 },
    ] as const;

    for (const expected of cases) {
      const children = sourceSetupCatalog.filter(({ cycle, family }) =>
        cycle === expected.cycle && family === expected.family);
      const groups = groupLogicalSetups(children);
      expect(children, `${expected.cycle}/${expected.family}`).toHaveLength(expected.count);
      expect(groups, `${expected.cycle}/${expected.family}`).toHaveLength(1);
      expect(groups[0].children).toHaveLength(expected.count);
    }

    const cycle6Children = (rawCycle6NoOQb as SetupVariant[])
      .filter(({ family }) => family === "pcinfokorea-c6-no-o-source-item-037");
    expect(cycle6Children).toHaveLength(2);
    expect(groupLogicalSetups(cycle6Children)).toHaveLength(1);
  });
});
