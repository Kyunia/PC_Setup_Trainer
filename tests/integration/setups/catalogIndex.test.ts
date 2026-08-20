import { describe, expect, it } from "vitest";
import {
  setupCatalog,
  setupCoverageForCycle,
  setupsForCycle,
  sourceSetupCatalog,
} from "../../../src/setups/catalog";

describe("catalog cycle index", () => {
  it("preserves exact per-cycle membership and order", () => {
    for (let cycle = 1; cycle <= 7; cycle += 1) {
      expect(setupsForCycle(cycle).map(({ id }) => id)).toEqual(
        setupCatalog.filter((setup) => setup.cycle === cycle).map(({ id }) => id),
      );
    }
  });

  it("returns stable frozen indexed buckets", () => {
    expect(setupsForCycle(5)).toBe(setupsForCycle(5));
    expect(Object.isFrozen(setupsForCycle(5))).toBe(true);
  });

  it("returns an empty immutable bucket for unknown cycles", () => {
    expect(setupsForCycle(99)).toEqual([]);
    expect(Object.isFrozen(setupsForCycle(99))).toBe(true);
  });

  it("preserves coverage counts from the previous filter expressions", () => {
    for (let cycle = 1; cycle <= 7; cycle += 1) {
      const coverage = setupCoverageForCycle(cycle);
      expect(coverage.setupCount).toBe(sourceSetupCatalog.filter((setup) => setup.cycle === cycle).length);
      expect(coverage.runtimeVariantCount).toBe(setupCatalog.filter((setup) => setup.cycle === cycle).length);
    }
  });
});
