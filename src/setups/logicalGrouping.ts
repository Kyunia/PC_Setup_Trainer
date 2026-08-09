import { BOARD_WIDTH, type Cell, type Piece } from "../engine/types";
import type { SetupVariant } from "./schema";

export type LogicalSetupRelation = "single" | "composition" | "mirror" | "forms" | "positional" | "mixed";

export interface LogicalSetupGroup<T extends SetupVariant = SetupVariant> {
  key: string;
  cycle: SetupVariant["cycle"];
  family: string;
  displayName: string;
  pieceCount: number;
  relation: LogicalSetupRelation;
  children: T[];
}

function compareCells(left: Cell, right: Cell): number {
  return left.y - right.y || left.x - right.x;
}

function cellKey(cells: Cell[]): string {
  return cells
    .sort(compareCells)
    .map(({ x, y }) => `${x},${y}`)
    .join(";");
}

function occupiedCells(setup: SetupVariant): Cell[] {
  const unique = new Map<string, Cell>();
  for (const { cells } of setup.placements) {
    for (const cell of cells) unique.set(`${cell.x},${cell.y}`, cell);
  }
  return [...unique.values()];
}

export function exactOccupiedSilhouetteKey(setup: SetupVariant): string {
  return cellKey(occupiedCells(setup));
}

export function canonicalOccupiedMirrorSilhouetteKey(setup: SetupVariant): string {
  const cells = occupiedCells(setup);
  const source = cellKey([...cells]);
  const mirror = cellKey(cells.map(({ x, y }) => ({ x: BOARD_WIDTH - 1 - x, y })));
  return source < mirror ? source : mirror;
}

function mirroredPiece(piece: Piece): Piece {
  if (piece === "J") return "L";
  if (piece === "L") return "J";
  if (piece === "S") return "Z";
  if (piece === "Z") return "S";
  return piece;
}

function labeledGeometryKey(setup: SetupVariant, mirrored: boolean): string {
  return setup.placements
    .map(({ piece, cells }) => {
      const normalizedPiece = mirrored ? mirroredPiece(piece) : piece;
      const normalizedCells = mirrored
        ? cells.map(({ x, y }) => ({ x: BOARD_WIDTH - 1 - x, y }))
        : [...cells];
      return `${normalizedPiece}:${cellKey(normalizedCells)}`;
    })
    .sort()
    .join("|");
}

/** Piece assignments remain significant; only a true horizontal tetromino mirror is canonicalized. */
export function canonicalLabeledMirrorGeometryKey(setup: SetupVariant): string {
  const source = labeledGeometryKey(setup, false);
  const mirror = labeledGeometryKey(setup, true);
  return source < mirror ? source : mirror;
}

export function logicalSetupGroupKey(setup: SetupVariant): string {
  return [
    setup.cycle,
    setup.family,
    setup.placements.length,
    logicalDisplayNameBase(setup.displayName || setup.family).toLocaleLowerCase(),
  ].join("|");
}

function logicalDisplayNameBase(displayName: string): string {
  return displayName
    .replace(/\s+\(([IJLOSTZ][IJLOSTZ /+.-]*)\)$/i, "")
    .replace(/\s+\[(left|right) side\]$/i, "")
    .trim();
}

function logicalDisplayName(children: SetupVariant[]): string {
  const names = [...new Set(children.map(({ displayName, family }) => displayName || family))];
  if (names.length === 1) return names[0];
  const bases = [...new Set(names.map(logicalDisplayNameBase))];
  return bases.length === 1 ? bases[0] : children[0].family;
}

function relationFor(children: SetupVariant[]): LogicalSetupRelation {
  if (children.length === 1) return "single";
  const exactShapes = new Set(children.map(exactOccupiedSilhouetteKey));
  const canonicalShapes = new Set(children.map(canonicalOccupiedMirrorSilhouetteKey));
  const signatures = new Set(children.map(({ pieceSignature }) => [...pieceSignature].sort().join("")));
  const hasCompositionForms = signatures.size > 1;
  if (canonicalShapes.size > 1) return hasCompositionForms ? "mixed" : "positional";
  if (exactShapes.size > 1) return hasCompositionForms ? "mixed" : "mirror";
  if (hasCompositionForms) return "composition";
  return "forms";
}

/**
 * Groups records for review/presentation only. Child records remain authoritative BFS geometry.
 * A family may contain composition, mirror, translation, rotation, or condition-selected positional
 * forms; none of those physical variants are collapsed by this function.
 */
export function groupLogicalSetups<T extends SetupVariant>(setups: readonly T[]): LogicalSetupGroup<T>[] {
  const grouped = new Map<string, T[]>();
  for (const setup of setups) {
    const key = logicalSetupGroupKey(setup);
    const children = grouped.get(key);
    if (children) children.push(setup);
    else grouped.set(key, [setup]);
  }

  return [...grouped.entries()].map(([key, children]) => ({
    key,
    cycle: children[0].cycle,
    family: children[0].family,
    displayName: logicalDisplayName(children),
    pieceCount: children[0].placements.length,
    relation: relationFor(children),
    children,
  }));
}
