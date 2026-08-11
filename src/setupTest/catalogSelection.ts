import type { Cycle } from "../engine/types";
import type { SetupTestCatalogDescriptor } from "./catalogSources";

export function catalogsForCycle(
  catalogs: readonly SetupTestCatalogDescriptor[],
  cycle: Cycle,
): SetupTestCatalogDescriptor[] {
  return catalogs.filter((catalog) => catalog.cycle === cycle);
}

export function defaultCatalogIdsForCycle(
  catalogs: readonly SetupTestCatalogDescriptor[],
  cycle: Cycle,
): string[] {
  const matching = catalogsForCycle(catalogs, cycle);
  const preferred = matching.find(({ group, variant }) => group === "promoted" && variant === "general")
    ?? matching.find(({ group }) => group === "promoted")
    ?? matching[0];
  return preferred ? [preferred.id] : [];
}

export function toggleCatalogSelection(
  selectedIds: readonly string[],
  catalogId: string,
  checked: boolean,
): string[] {
  if (checked) return selectedIds.includes(catalogId) ? [...selectedIds] : [...selectedIds, catalogId];
  return selectedIds.filter((id) => id !== catalogId);
}
