import { PIECES, type Piece } from "../engine/types";
import type { SetupQuery } from "./query";
import type { SetupVariant } from "./schema";

export type Cycle5ClassificationMode = "normal-distinct-pair" | "duplicate-pair-unsupported";

export interface Cycle5QueueContext {
  /** 5회차의 첫 bag 구간 두 미노. 정상 시작 상태에서는 HOLD + ACTIVE다. */
  classPieces: [Piece, Piece];
  /** class 두 미노와 다음 7-bag의 관측된 앞 다섯 미노로 이루어진 BFS 구축 풀. */
  buildPieces: Piece[];
  /** ACTIVE 다음에 소비할 실제 NEXT. 앞 다섯 미노까지만 geometry에 배치할 수 있다. */
  searchNext: Piece[];
  /** searchNext 중 다음 bag 소속이며 이번 실시간 BFS에 배치 가능한 수. */
  placeableNextCount: number;
  classificationMode: Cycle5ClassificationMode;
}

function uniquePieces(pieces: Piece[]): boolean {
  return new Set(pieces).size === pieces.length;
}

/** 순서와 무관한 정상 5회차 첫 두 미노 class key다. */
export function cycle5PiecePairKey(pieces: readonly Piece[]): string {
  if (pieces.length !== 2 || pieces[0] === pieces[1]) return "";
  const order = new Map(PIECES.map((piece, index) => [piece, index]));
  return [...pieces]
    .sort((left, right) => order.get(left)! - order.get(right)!)
    .join("");
}

/**
 * 5회차 시작 상태의 실시간 관측 창을 복원한다.
 *
 * 정상 5회차는 첫 구간 두 미노가 HOLD와 ACTIVE에 하나씩 있고, NEXT[0..4]는
 * 새 7-bag의 앞 다섯 미노다. 따라서 class는 HOLD/ACTIVE의 순서 없는 쌍으로
 * 결정하고, BFS에는 두 class 미노와 관측된 다음 bag 다섯 미노만 공급한다.
 * 보이지 않는 새 bag의 마지막 두 미노나 2+7+2 선택 창의 후반 미노를 추론해
 * 초기 setup geometry에 사용하지 않는다.
 */
export function cycle5QueueContext(query: SetupQuery): Cycle5QueueContext | null {
  if (query.hold === null || query.next.length < 5) return null;
  const visibleNewBag = query.next.slice(0, 5);
  if (!uniquePieces(visibleNewBag)) return null;

  const classPieces: [Piece, Piece] = [query.hold, query.active];
  return {
    classPieces,
    buildPieces: [...classPieces, ...visibleNewBag],
    searchNext: query.next,
    placeableNextCount: 5,
    classificationMode: query.hold === query.active
      ? "duplicate-pair-unsupported"
      : "normal-distinct-pair",
  };
}

function pieceCounts(pieces: readonly Piece[]): Map<Piece, number> {
  const counts = new Map<Piece, number>();
  for (const piece of pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  return counts;
}

/** setup 미노 multiset을 class 2미노 + 다음 bag 앞 5미노로 공급할 수 있는지 검사한다. */
export function fitsCycle5BuildPool(setup: SetupVariant, buildPieces: readonly Piece[]): boolean {
  if (setup.placements.length < 2 || setup.placements.length > 7) return false;
  const available = pieceCounts(buildPieces);
  const required = pieceCounts(setup.pieceSignature);
  return [...required].every(([piece, count]) => (available.get(piece) ?? 0) >= count);
}

