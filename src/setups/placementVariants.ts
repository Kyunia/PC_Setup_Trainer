import { BOARD_WIDTH } from "../engine/types";
import type { SetupVariant, TargetPlacement } from "./schema";

function compareCells(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return left.y - right.y || left.x - right.x;
}

function translatedPlacement(
  placement: TargetPlacement,
  suffix: string,
  dx: number,
  dy: number,
): TargetPlacement {
  return {
    ...placement,
    id: `${placement.id}${suffix}`,
    cells: placement.cells
      .map(({ x, y }) => ({ x: x + dx, y: y + dy }))
      .sort(compareCells),
    orientation: undefined,
    origin: undefined,
  };
}

function expandOne(setup: SetupVariant): SetupVariant[] {
  const variants = setup.equivalentPlacementVariants ?? [];
  return variants.map((variant) => {
    const suffix = `--placement-${variant.id}`;
    const translations = new Map(
      variant.translations.map(({ placementId, dx, dy }) => [placementId, { dx, dy }]),
    );
    const placements = setup.placements.map((placement) => {
      const translation = translations.get(placement.id);
      return translation
        ? translatedPlacement(placement, suffix, translation.dx, translation.dy)
        : {
            ...placement,
            id: `${placement.id}${suffix}`,
            cells: placement.cells.map((cell) => ({ ...cell })).sort(compareCells),
          };
    });
    const occupied = new Set<string>();
    for (const placement of placements) {
      for (const { x, y } of placement.cells) {
        if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= 4) {
          throw new Error(`${setup.id}/${variant.id}: translated cell (${x},${y}) is outside 10x4`);
        }
        const key = `${x},${y}`;
        if (occupied.has(key)) throw new Error(`${setup.id}/${variant.id}: translated cell ${key} overlaps`);
        occupied.add(key);
      }
    }
    return {
      ...setup,
      id: `${setup.id}${suffix}`,
      formLabel: `${setup.formLabel ?? setup.displayName} · ${variant.id}`,
      recommendationGroup: setup.recommendationGroup ?? `placement:${setup.id}`,
      placements,
      equivalentPlacementVariants: undefined,
      fumen: undefined,
      mirrorOf: undefined,
      mirroredVariantId: undefined,
      policySourceId: setup.policySourceId ?? setup.id,
      derivedVariant: "translation",
    };
  });
}

/** Expand explicitly equivalent physical placement alternatives while retaining one logical source identity. */
export function expandEquivalentPlacementVariants(catalog: readonly SetupVariant[]): SetupVariant[] {
  const expanded: SetupVariant[] = [];
  const ids = new Set<string>();
  for (const source of catalog) {
    for (const setup of [source, ...expandOne(source)]) {
      if (ids.has(setup.id)) throw new Error(`duplicate equivalent placement variant id: ${setup.id}`);
      ids.add(setup.id);
      expanded.push(setup);
    }
  }
  return expanded;
}
