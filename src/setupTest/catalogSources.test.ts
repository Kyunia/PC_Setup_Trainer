import { describe, expect, it } from "vitest";
import {
  loadSetupTestCatalog,
  normalizeSetupTestCatalog,
  promotedSetupTestCatalogs,
  setupTestRecommendationBundle,
} from "./catalogSources";

describe("setup-test catalog sources", () => {
  it("preserves policy-only solution-shadow geometry during selected-bundle normalization", () => {
    const descriptor = {
      id: "draft:shadow",
      label: "shadow.json",
      cycle: 5 as const,
      group: "draft" as const,
      variant: "qb" as const,
      setupPath: "shadow.json",
    };
    const [shadow] = normalizeSetupTestCatalog([{
      id: "shadow",
      geometryKind: "solution-shadow",
      pieceSignature: ["Z"],
      placements: [{
        id: "z",
        piece: "Z",
        cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 5, y: 3 }],
      }],
      fumen: "v115@shadow",
      reviewStatus: "reviewed",
    }], descriptor);

    expect(shadow).toMatchObject({
      id: "shadow",
      geometryKind: "solution-shadow",
      fumen: "v115@shadow",
    });
  });

  it("lists only manifest-bound promoted setup files and groups QB files", () => {
    expect(promotedSetupTestCatalogs.length).toBeGreaterThan(0);
    expect(new Set(promotedSetupTestCatalogs.map(({ setupPath }) => setupPath)).size)
      .toBe(promotedSetupTestCatalogs.length);
    expect(promotedSetupTestCatalogs.every(({ group }) => group === "promoted")).toBe(true);
    expect(promotedSetupTestCatalogs.some(({ setupPath, variant }) =>
      setupPath === "QB/cycle-7-qb-setups.json" && variant === "qb")).toBe(true);
  });

  it("keeps the selected bundle policy available for structured OQB probes", async () => {
    const descriptor = promotedSetupTestCatalogs.find(({ setupPath }) =>
      setupPath === "QB/cycle-5-advanced-oi-setups.json");
    expect(descriptor).toBeDefined();

    const bundle = await loadSetupTestCatalog(descriptor!);
    const policy = bundle.policy as { entries?: Array<{ kind?: string }> };

    expect(bundle.catalog.length).toBeGreaterThan(0);
    expect(policy.entries?.some(({ kind }) => kind === "oqb")).toBe(true);
    expect(setupTestRecommendationBundle(descriptor!, bundle)).toMatchObject({
      bundleId: descriptor!.id,
      kind: "cycle5-advanced",
      cycle: 5,
    });
  });

  it("classifies special recommendation stages without changing ordinary catalogs", () => {
    const cycle2Advanced = promotedSetupTestCatalogs.find(({ setupPath }) =>
      setupPath === "cycle-2-advanced-3p-setups.json")!;
    const cycle7Advanced = promotedSetupTestCatalogs.find(({ setupPath }) =>
      setupPath === "cycle-7-4p-setups.json")!;
    const fakeBundle = { catalog: [], policy: {} };

    expect(setupTestRecommendationBundle(cycle2Advanced, fakeBundle)).toMatchObject({
      kind: "structured",
      role: "advanced-3p",
    });
    expect(setupTestRecommendationBundle(cycle7Advanced, fakeBundle)).toMatchObject({
      kind: "cycle7-advanced-4p",
    });
  });
});
