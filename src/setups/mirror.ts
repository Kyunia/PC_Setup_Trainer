import { BOARD_WIDTH, type Cell, type Piece } from "../engine/types";
import type { SetupVariant, TargetPlacement } from "./schema";

const MIRRORED_PIECE: Record<Piece, Piece> = {
  I: "I",
  J: "L",
  L: "J",
  O: "O",
  S: "Z",
  T: "T",
  Z: "S",
};

export function mirrorPiece(piece: Piece): Piece {
  return MIRRORED_PIECE[piece];
}

export function mirrorCell({ x, y }: Cell): Cell {
  return { x: BOARD_WIDTH - 1 - x, y };
}

function compareCells(left: Cell, right: Cell): number {
  return left.y - right.y || left.x - right.x;
}

function mirrorPlacement(placement: TargetPlacement): TargetPlacement {
  return {
    id: `${placement.id}--mirror`,
    piece: mirrorPiece(placement.piece),
    cells: placement.cells.map(mirrorCell).sort(compareCells),
    // cells가 authoritative하다. 원본 orientation/origin을 그대로 두면 반전 후 잘못된 상태가 된다.
    orientation: undefined,
    origin: undefined,
  };
}

function normalizeChiralPairOrder(pieces: string, left: Piece, right: Piece): string {
  const characters = [...pieces];
  const indices = characters
    .map((piece, index) => piece === left || piece === right ? index : -1)
    .filter((index) => index >= 0);
  if (!characters.includes(left) || !characters.includes(right)) return pieces;

  const ordered = indices.map((index) => characters[index]).sort((a, b) => {
    if (a === b) return 0;
    return a === left ? -1 : 1;
  });
  indices.forEach((index, orderIndex) => { characters[index] = ordered[orderIndex]; });
  return characters.join("");
}

function mirrorPieceComposition(composition: string): string {
  const mirrored = [...composition].map((piece) => mirrorPiece(piece as Piece)).join("");
  return normalizeChiralPairOrder(normalizeChiralPairOrder(mirrored, "L", "J"), "S", "Z");
}

function mirrorPieceCompositions(label: string): string {
  return label.replace(/(^|[^A-Za-z])([IJLOSTZ]{1,8})(?=$|[^A-Za-z])/g,
    (_match, prefix: string, composition: string) => `${prefix}${mirrorPieceComposition(composition)}`);
}

/** Mirrors standalone piece notation for user-facing policy/setup labels. */
export function mirrorPieceNotationForDisplay(label: string): string {
  return mirrorPieceCompositions(label);
}

function mirrorDisplayName(displayName: string): string {
  const mirroredSide = /\[Right Side\]/i.test(displayName)
    ? displayName.replace(/\[Right Side\]/i, "[Left Side]")
    : /\[Left Side\]/i.test(displayName)
      ? displayName.replace(/\[Left Side\]/i, "[Right Side]")
      : displayName;
  return mirrorPieceCompositions(mirroredSide);
}

function mirrorFormLabel(formLabel?: string): string | undefined {
  if (!formLabel) return formLabel;
  const mirroredSide = formLabel.startsWith("left")
    ? `right${formLabel.slice("left".length)}`
    : formLabel.startsWith("right")
      ? `left${formLabel.slice("right".length)}`
      : formLabel;
  return mirrorPieceCompositions(mirroredSide);
}

function mirrorSide(side?: SetupVariant["side"]): SetupVariant["side"] {
  if (side === "left") return "right";
  if (side === "right") return "left";
  return side;
}

export function mirrorSetup(setup: SetupVariant): SetupVariant {
  return {
    ...setup,
    id: `${setup.id}--mirror`,
    displayName: mirrorDisplayName(setup.displayName),
    formLabel: mirrorFormLabel(setup.formLabel),
    side: mirrorSide(setup.side),
    pieceSignature: setup.pieceSignature.map(mirrorPiece),
    placements: setup.placements.map(mirrorPlacement),
    fumen: undefined,
    // geometry는 대칭이어도 I-spin 도달성 때문에 퍼클률은 비대칭일 수 있다.
    solveRate: setup.mirroredSolveRate ?? setup.solveRate,
    mirroredSolveRate: setup.solveRate,
    mirrorOf: setup.id,
    mirroredVariantId: setup.id,
    derivedVariant: "mirror",
  };
}

export function setupGeometryKey(setup: SetupVariant): string {
  return setup.placements
    .map(({ piece, cells }) => `${piece}:${cells.map(({ x, y }) => `${x},${y}`).sort().join(";")}`)
    .sort()
    .join("|");
}

export function expandMirroredSetups(sourceCatalog: SetupVariant[]): SetupVariant[] {
  const cycles = Array.from(new Set(sourceCatalog.map((s) => s.cycle)));
  const expanded: SetupVariant[] = [];

  for (const cycle of cycles) {
    const cycleCatalog = sourceCatalog.filter((s) => s.cycle === cycle);
    const cycleExpanded = cycleCatalog.map((setup) => ({ ...setup }));
    const byId = new Map(cycleExpanded.map((setup) => [setup.id, setup]));
    const geometryIds = new Map(cycleExpanded.map((setup) => [setupGeometryKey(setup), setup.id]));

    for (const source of cycleCatalog) {
      const mirrored = mirrorSetup(source);
      const existingGeometryId = geometryIds.get(setupGeometryKey(mirrored));
      const sourceCopy = byId.get(source.id)!;

      if (existingGeometryId) {
        if (existingGeometryId !== source.id) sourceCopy.mirroredVariantId = existingGeometryId;
        continue;
      }
      if (byId.has(mirrored.id)) throw new Error(`미러 setup id가 기존 catalog와 충돌합니다: ${mirrored.id}`);

      sourceCopy.mirroredVariantId = mirrored.id;
      cycleExpanded.push(mirrored);
      byId.set(mirrored.id, mirrored);
      geometryIds.set(setupGeometryKey(mirrored), mirrored.id);
    }
    expanded.push(...cycleExpanded);
  }

  return expanded;
}
