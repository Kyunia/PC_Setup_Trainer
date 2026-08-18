import { BOARD_WIDTH, type Cell, type Piece } from "../engine/types";
import { setupGeometryKey } from "./mirror";
import type { SetupVariant, TargetPlacement } from "./schema";

interface BoxComponent {
  placementIndexes: number[];
  width: 3 | 4;
  height: 4;
  minX: number;
  minY: number;
}

function compareCells(left: Cell, right: Cell): number {
  return left.y - right.y || left.x - right.x;
}

// SFinder congruent_cover + normal minimals for [TILJS]!. Rows are stored
// bottom-to-top. Wall access changes the minimal cover: the left wall needs
// eight physical geometries (102/120), while the right wall needs five
// (108/120). A multi-page minimal contributes every physical geometry.
const ILJS_LEFT_BOX_MINIMAL_ROWS = [
  ["LLSI", "LSSI", "LSJI", "JJJI"],
  ["JJJI", "JSLI", "SSLI", "SLLI"],
  ["JLLL", "JSSL", "JJSS", "IIII"],
  ["IIII", "JLLL", "JSSL", "JJSS"],
  ["IJJJ", "IJSL", "ISSL", "ISLL"],
  ["SSJJ", "LSSJ", "LLLJ", "IIII"],
  ["ILLS", "ILSS", "ILSJ", "IJJJ"],
  ["IIII", "SSJJ", "LSSJ", "LLLJ"],
] as const;

const ILJS_RIGHT_BOX_MINIMAL_ROWS = [
  ["LLSI", "LSSI", "LSJI", "JJJI"],
  ["JJJI", "JSLI", "SSLI", "SLLI"],
  ["JLLL", "JSSL", "JJSS", "IIII"],
  ["IIII", "JLLL", "JSSL", "JJSS"],
  ["IJJJ", "IJSL", "ISSL", "ISLL"],
] as const;

// [TILJO]! has five minimal geometries on either wall (110/120), but the
// first physical geometry is mirrored at the opposite wall.
const ILJO_LEFT_BOX_MINIMAL_ROWS = [
  ["IJJJ", "IJOO", "ILOO", "ILLL"],
  ["JOOL", "JOOL", "JJLL", "IIII"],
  ["LLJJ", "LOOJ", "LOOJ", "IIII"],
  ["IIII", "JOOL", "JOOL", "JJLL"],
  ["IIII", "LLJJ", "LOOJ", "LOOJ"],
] as const;

const ILJO_RIGHT_BOX_MINIMAL_ROWS = [
  ["LLLI", "OOLI", "OOJI", "JJJI"],
  ["JOOL", "JOOL", "JJLL", "IIII"],
  ["LLJJ", "LOOJ", "LOOJ", "IIII"],
  ["IIII", "JOOL", "JOOL", "JJLL"],
  ["IIII", "LLJJ", "LOOJ", "LOOJ"],
] as const;

const LJS_THREE_BY_FOUR_MINIMAL_ROWS = [
  ["LLS", "LSS", "LSJ", "JJJ"],
  ["JJJ", "JSL", "SSL", "SLL"],
] as const;

function mirrorPiece(piece: Piece): Piece {
  if (piece === "J") return "L";
  if (piece === "L") return "J";
  if (piece === "S") return "Z";
  if (piece === "Z") return "S";
  return piece;
}

function tilingFromRows(
  setup: SetupVariant,
  component: BoxComponent,
  rows: readonly string[],
  mirrored: boolean,
): TargetPlacement[] {
  const cellsByPiece = new Map<Piece, Cell[]>();
  rows.forEach((row, y) => [...row].forEach((canonicalPiece, x) => {
    const piece = mirrored ? mirrorPiece(canonicalPiece as Piece) : canonicalPiece as Piece;
    const cells = cellsByPiece.get(piece) ?? [];
    cells.push({ x: mirrored ? component.width - 1 - x : x, y });
    cellsByPiece.set(piece, cells);
  }));
  return component.placementIndexes.map((index) => {
    const source = setup.placements[index];
    const cells = cellsByPiece.get(source.piece);
    if (!cells || cells.length !== 4) {
      throw new Error(`box minimal을 만들 수 없습니다: ${setup.id}/${source.piece}`);
    }
    return { id: source.id, piece: source.piece, cells: cells.sort(compareCells) };
  });
}

type BoxWallSide = "left" | "right";

function boxWallSide(component: BoxComponent): BoxWallSide | null {
  if (component.minX === 0) return "left";
  if (component.minX + component.width === BOARD_WIDTH) return "right";
  return null;
}

function oppositeWall(side: BoxWallSide): BoxWallSide {
  return side === "left" ? "right" : "left";
}

function boxMinimalTilings(
  setup: SetupVariant,
  component: BoxComponent,
  targetX = component.minX,
): TargetPlacement[][] {
  const signature = selectedSignature(setup, component);
  const wholeSetup = component.placementIndexes.length === setup.placements.length;
  if (wholeSetup && component.width === 4 && (signature === "IJLS" || signature === "IJLZ")) {
    const physicalSide = boxWallSide({ ...component, minX: targetX });
    if (!physicalSide) return [];
    // IJLZ is the piece-and-position mirror of IJLS, so its canonical SFinder
    // wall is the opposite of the physical wall before tilingFromRows mirrors it.
    const sfinderSide = signature === "IJLZ" ? oppositeWall(physicalSide) : physicalSide;
    const rowsForWall = sfinderSide === "left"
      ? ILJS_LEFT_BOX_MINIMAL_ROWS
      : ILJS_RIGHT_BOX_MINIMAL_ROWS;
    return rowsForWall.map((rows) =>
      tilingFromRows(setup, component, rows, signature === "IJLZ"));
  }
  if (wholeSetup && component.width === 4 && signature === "IJLO") {
    const physicalSide = boxWallSide({ ...component, minX: targetX });
    if (!physicalSide) return [];
    const rowsForWall = physicalSide === "left"
      ? ILJO_LEFT_BOX_MINIMAL_ROWS
      : ILJO_RIGHT_BOX_MINIMAL_ROWS;
    return rowsForWall.map((rows) => tilingFromRows(setup, component, rows, false));
  }
  if (!wholeSetup && component.width === 3 && (signature === "JLS" || signature === "JLZ")) {
    const outside = setup.placements.filter((_, index) => !component.placementIndexes.includes(index));
    if (outside.length === 1 && outside[0].piece === "O") {
      return LJS_THREE_BY_FOUR_MINIMAL_ROWS.map((rows) =>
        tilingFromRows(setup, component, rows, signature === "JLZ"));
    }
  }
  if (!wholeSetup && component.width === 4 && (signature === "IJLS" || signature === "IJLZ")) {
    const outside = setup.placements.filter((_, index) => !component.placementIndexes.includes(index));
    if (outside.length === 1 && outside[0].piece === "O") {
      const physicalSide = boxWallSide(component);
      if (!physicalSide) return [];
      const sfinderSide = signature === "IJLZ" ? oppositeWall(physicalSide) : physicalSide;
      const rowsForWall = sfinderSide === "left"
        ? ILJS_LEFT_BOX_MINIMAL_ROWS
        : ILJS_RIGHT_BOX_MINIMAL_ROWS;
      return rowsForWall.map((rows) =>
        tilingFromRows(setup, component, rows, signature === "IJLZ"));
    }
  }
  return [];
}

function componentTilingKey(placements: TargetPlacement[], offsetX = 0, offsetY = 0): string {
  return placements
    .map(({ piece, cells }) => `${piece}:${cells
      .map(({ x, y }) => `${x - offsetX},${y - offsetY}`)
      .sort()
      .join(";")}`)
    .sort()
    .join("|");
}

function sourceMinimalIndex(
  setup: SetupVariant,
  component: BoxComponent,
  tilings: TargetPlacement[][],
): number {
  const sourcePlacements = component.placementIndexes.map((index) => setup.placements[index]);
  const sourceKey = componentTilingKey(sourcePlacements, component.minX, component.minY);
  return tilings.findIndex((tiling) => componentTilingKey(tiling) === sourceKey);
}

function combinations(length: number, size: number): number[][] {
  const result: number[][] = [];
  function visit(start: number, selected: number[]): void {
    if (selected.length === size) {
      result.push(selected);
      return;
    }
    for (let index = start; index <= length - (size - selected.length); index += 1) {
      visit(index + 1, [...selected, index]);
    }
  }
  visit(0, []);
  return result;
}

function filledRectangle(
  setup: SetupVariant,
  placementIndexes: number[],
  width: 3 | 4,
): BoxComponent | null {
  const cells = placementIndexes.flatMap((index) => setup.placements[index].cells);
  if (cells.length !== width * 4) return null;
  const minX = Math.min(...cells.map(({ x }) => x));
  const maxX = Math.max(...cells.map(({ x }) => x));
  const minY = Math.min(...cells.map(({ y }) => y));
  const maxY = Math.max(...cells.map(({ y }) => y));
  if (maxX - minX !== width - 1 || maxY - minY !== 3) return null;

  const occupied = new Set(cells.map(({ x, y }) => `${x},${y}`));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!occupied.has(`${x},${y}`)) return null;
    }
  }
  return { placementIndexes, width, height: 4, minX, minY };
}

/** 셋업 전체 또는 셋업 안의 4×4/3×4 완전 충전 부분을 찾는다. */
function findBoxComponent(setup: SetupVariant): BoxComponent | null {
  if (setup.placements.length >= 4) {
    for (const indexes of combinations(setup.placements.length, 4)) {
      const component = filledRectangle(setup, indexes, 4);
      if (component) return component;
    }
  }
  if (setup.placements.length >= 3) {
    for (const indexes of combinations(setup.placements.length, 3)) {
      const component = filledRectangle(setup, indexes, 3);
      if (component) return component;
    }
  }
  return null;
}

function rotateSquareCell({ x, y }: Cell, size: number): Cell {
  return { x: y, y: size - 1 - x };
}

function rotateComponentCell(
  cell: Cell,
  component: BoxComponent,
  quarterTurns: number,
  targetX: number,
  targetY: number,
): Cell {
  let local = { x: cell.x - component.minX, y: cell.y - component.minY };
  if (component.width === 3) {
    // 3×4를 90° 돌리면 높이가 3이 되므로 4-line box가 아니다. 두 180° 방향만 사용한다.
    if (quarterTurns === 2) {
      local = { x: component.width - 1 - local.x, y: component.height - 1 - local.y };
    }
  } else {
    for (let turn = 0; turn < quarterTurns; turn += 1) {
      local = rotateSquareCell(local, component.width);
    }
  }
  return { x: local.x + targetX, y: local.y + targetY };
}

function selectedSignature(setup: SetupVariant, component: BoxComponent): string {
  return component.placementIndexes
    .map((index) => setup.placements[index].piece)
    .sort()
    .join("");
}

function boxFamily(setup: SetupVariant, component: BoxComponent): string {
  if (component.width === 3) return "3x4";
  const signature = selectedSignature(setup, component);
  if (signature === "IJLO") return "oilj";
  if (signature === "IJLS" || signature === "IJLZ") return "iljs";
  return "4x4";
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function outsideGeometryKey(setup: SetupVariant, component: BoxComponent): string {
  const selected = new Set(component.placementIndexes);
  return setup.placements
    .filter((_, index) => !selected.has(index))
    .map(({ piece, cells }) => `${piece}:${cells.map(({ x, y }) => `${x},${y}`).sort().join(";")}`)
    .sort()
    .join("|");
}

function boxRecommendationGroup(setup: SetupVariant, component: BoxComponent): string {
  if (setup.recommendationGroup) return setup.recommendationGroup;
  const base = `cycle${setup.cycle}-${boxFamily(setup, component)}-box`;
  if (component.placementIndexes.length === setup.placements.length) return base;
  const attachment = `${component.minX},${component.minY}|${outsideGeometryKey(setup, component)}`;
  return `${base}-plus-${stableHash(attachment)}`;
}

function transformedFormLabel(
  formLabel: string | undefined,
  degrees: number,
  targetX: number,
): string {
  const base = formLabel && formLabel !== "neutral" ? `${formLabel} · ` : "";
  return `${base}box ${degrees}° x${targetX}`;
}

function horizontalTargets(setup: SetupVariant, component: BoxComponent): number[] {
  const signature = selectedSignature(setup, component);
  const wholeSetup = component.placementIndexes.length === setup.placements.length;
  // The paired left/right SFinder congruent-cover fields are an explicit
  // runtime allowlist for the two pure common 4x4 Box families. This is not a
  // general translation rule: partial boxes and every other setup retain only
  // their promoted/declared physical anchor.
  if (wholeSetup && component.width === 4
    && (signature === "IJLS" || signature === "IJLZ" || signature === "IJLO")) {
    return [0, BOARD_WIDTH - component.width];
  }
  return [component.minX];
}

function transformBoxSetup(
  setup: SetupVariant,
  component: BoxComponent,
  quarterTurns: number,
  targetX: number,
  targetY: number,
): SetupVariant {
  const degrees = quarterTurns * 90;
  const suffix = `--box-r${degrees}-x${targetX}`;
  const selected = new Set(component.placementIndexes);
  const moved = targetX !== component.minX || targetY !== component.minY;
  return {
    ...setup,
    id: `${setup.id}${suffix}`,
    formLabel: transformedFormLabel(setup.formLabel, degrees, targetX),
    recommendationGroup: boxRecommendationGroup(setup, component),
    placements: setup.placements.map((placement, index): TargetPlacement => ({
      ...placement,
      id: `${placement.id}${suffix}`,
      cells: selected.has(index)
        ? placement.cells.map((cell) => rotateComponentCell(
          cell,
          component,
          quarterTurns,
          targetX,
          targetY,
        )).sort(compareCells)
        : placement.cells.map((cell) => ({ ...cell })).sort(compareCells),
      ...(selected.has(index) ? { orientation: undefined, origin: undefined } : {}),
    })),
    fumen: undefined,
    mirrorOf: undefined,
    mirroredVariantId: undefined,
    derivedVariant: quarterTurns === 0
      ? "translation"
      : moved ? "rotation-translation" : "rotation",
  };
}

function minimalBoxSetup(
  setup: SetupVariant,
  component: BoxComponent,
  placements: TargetPlacement[],
  minimalIndex: number,
  targetX: number,
  targetY: number,
): SetupVariant {
  const suffix = `--box-minimal-m${minimalIndex + 1}-x${targetX}`;
  return {
    ...setup,
    id: `${setup.id}${suffix}`,
    formLabel: `${setup.formLabel && setup.formLabel !== "neutral" ? `${setup.formLabel} · ` : ""}box minimal ${minimalIndex + 1} x${targetX}`,
    recommendationGroup: boxRecommendationGroup(setup, component),
    placements: setup.placements.map((sourcePlacement, index) => {
      const componentIndex = component.placementIndexes.indexOf(index);
      const placement = componentIndex >= 0 ? placements[componentIndex] : sourcePlacement;
      return {
        ...placement,
        id: `${placement.id}${suffix}`,
        cells: componentIndex >= 0
          ? placement.cells.map(({ x, y }) => ({ x: x + targetX, y: y + targetY })).sort(compareCells)
          : placement.cells.map((cell) => ({ ...cell })).sort(compareCells),
        ...(componentIndex >= 0 ? { orientation: undefined, origin: undefined } : {}),
      };
    }),
    fumen: undefined,
    mirrorOf: undefined,
    mirroredVariantId: undefined,
    policySourceId: setup.policySourceId ?? setup.mirrorOf ?? setup.id,
    derivedVariant: "box-minimal",
  };
}

/**
 * 회차와 무관하게 완전히 채워진 4×4 및 3×4 box의 geometry orbit를 만든다.
 *
 * Box minimal/rotation variants are generated only at each promoted physical
 * source anchor. Horizontal translations must already exist as canonical
 * records, explicit equivalentPlacementVariants, or policy-authorized mirrors.
 * `box + O`처럼 나머지 미노가 있으면 그 미노와 box anchor를 그대로 둔다.
 * source에 이미 모든 방향이 있더라도 geometry 중복은 만들지 않고 같은
 * attachment별 그룹으로 묶는다.
 */
export function expandBoxSetups(sourceCatalog: SetupVariant[]): SetupVariant[] {
  const minimalSources = new Map<SetupVariant, {
    component: BoxComponent;
    sourceMinimalIndex: number;
  }>();
  for (const source of sourceCatalog) {
    const component = findBoxComponent(source);
    if (!component) continue;
    const tilings = boxMinimalTilings(source, component);
    if (tilings.length) {
      minimalSources.set(source, {
        component,
        sourceMinimalIndex: sourceMinimalIndex(source, component, tilings),
      });
    }
  }

  // Recognized box families are runtime replacements: the production source
  // remains untouched, while recommendation geometry uses only SFinder minimals.
  const retainedSources = sourceCatalog
    .filter((setup) => (minimalSources.get(setup)?.sourceMinimalIndex ?? 0) >= 0);
  const retainedSourceIds = new Set(retainedSources.map(({ id }) => id));
  const expanded = retainedSources.map((setup) => {
    if (!minimalSources.has(setup)) return { ...setup };
    const missingMirrorSource = setup.mirrorOf !== undefined && !retainedSourceIds.has(setup.mirrorOf);
    return {
      ...setup,
      ...(missingMirrorSource ? { policySourceId: setup.policySourceId ?? setup.mirrorOf } : {}),
      mirrorOf: missingMirrorSource ? undefined : setup.mirrorOf,
      mirroredVariantId: setup.mirroredVariantId && retainedSourceIds.has(setup.mirroredVariantId)
        ? setup.mirroredVariantId
        : undefined,
    };
  });
  const geometryKeysByCycle = new Map<number, Set<string>>();
  for (const setup of expanded) {
    const keys = geometryKeysByCycle.get(setup.cycle) ?? new Set<string>();
    keys.add(setupGeometryKey(setup));
    geometryKeysByCycle.set(setup.cycle, keys);
  }

  for (const source of sourceCatalog) {
    const minimal = minimalSources.get(source);
    const component = minimal?.component ?? findBoxComponent(source);
    if (!component) continue;
    const sourceCopy = minimal?.sourceMinimalIndex === -1
      ? { ...source }
      : expanded.find(({ id }) => id === source.id)!;
    const geometryKeys = geometryKeysByCycle.get(source.cycle) ?? new Set<string>();
    geometryKeysByCycle.set(source.cycle, geometryKeys);
    sourceCopy.recommendationGroup = boxRecommendationGroup(source, component);

    const turns = component.width === 4 ? [0, 1, 2, 3] : [0, 2];
    const targetXs = horizontalTargets(source, component);
    const targetY = component.minY;

    if (minimal) {
      for (const targetX of targetXs) {
        const targetTilings = boxMinimalTilings(source, component, targetX);
        for (let minimalIndex = 0; minimalIndex < targetTilings.length; minimalIndex += 1) {
          const variant = minimalBoxSetup(
            sourceCopy,
            component,
            targetTilings[minimalIndex],
            minimalIndex,
            targetX,
            targetY,
          );
          const key = setupGeometryKey(variant);
          if (geometryKeys.has(key)) continue;
          expanded.push(variant);
          geometryKeys.add(key);
        }
      }
      continue;
    }

    for (const quarterTurns of turns) {
      for (const targetX of targetXs) {
        const transformed = transformBoxSetup(
          sourceCopy,
          component,
          quarterTurns,
          targetX,
          targetY,
        );
        const key = setupGeometryKey(transformed);
        if (geometryKeys.has(key)) continue;
        expanded.push(transformed);
        geometryKeys.add(key);
      }
    }

  }
  return expanded;
}

/** @deprecated 새 코드는 이동까지 포함하는 expandBoxSetups를 사용한다. */
export const expandRotatedBoxSetups = expandBoxSetups;
