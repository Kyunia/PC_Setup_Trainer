import { describe, expect, it } from "vitest";
import type { SetupTestCatalogDescriptor } from "./catalogSources";
import { catalogsForCycle, defaultCatalogIdsForCycle, toggleCatalogSelection } from "./catalogSelection";

const catalogs: SetupTestCatalogDescriptor[] = [
  { id: "p-qb", label: "p-qb", cycle: 5, group: "promoted", variant: "qb", setupPath: "p-qb" },
  { id: "d-general", label: "d-general", cycle: 5, group: "draft", variant: "general", setupPath: "d-general" },
  { id: "p-general", label: "p-general", cycle: 5, group: "promoted", variant: "general", setupPath: "p-general" },
  { id: "other", label: "other", cycle: 4, group: "promoted", variant: "general", setupPath: "other" },
];

describe("setup-test catalog selection", () => {
  it("keeps the picker scoped to the selected cycle", () => {
    expect(catalogsForCycle(catalogs, 5).map(({ id }) => id))
      .toEqual(["p-qb", "d-general", "p-general"]);
  });

  it("defaults to one promoted general source", () => {
    expect(defaultCatalogIdsForCycle(catalogs, 5)).toEqual(["p-general"]);
  });

  it("adds and removes independent checkbox selections", () => {
    expect(toggleCatalogSelection(["p-general"], "p-qb", true)).toEqual(["p-general", "p-qb"]);
    expect(toggleCatalogSelection(["p-general", "p-qb"], "p-general", false)).toEqual(["p-qb"]);
  });
});
