import type { Piece } from "../engine/types";
import { mirrorPiece } from "./mirror";
import type { StructuredSetupPolicy } from "./policy";
import type { SetupQuery } from "./query";
import type { SetupVariant } from "./schema";

export interface Cycle7QueueContext {
  buildPieces: Piece[];
  /** 마지막 구축 미노를 HOLD에서 꺼낼 때 사용할 다음 가방 버퍼까지 포함한 NEXT */
  searchNext: Piece[];
  /** searchNext 중 7회차 setup geometry에 실제로 놓을 수 있는 앞부분의 개수 */
  placeableNextCount: number;
}

/**
 * 7회차의 3+7 가방 경계를 분리한다.
 *
 * HOLD가 차 있으면 H + A + NEXT 1이 이전 가방의 남은 세 미노다.
 * HOLD가 비어 있으면 A + NEXT 2가 남은 세 미노다. 그 뒤에 보이는 미노는
 * 다음 가방의 버퍼이며 HOLD에서 마지막 구축 미노를 꺼내는 데만 사용할 수 있다.
 */
export function cycle7QueueContext(query: SetupQuery): Cycle7QueueContext | null {
  if (query.hold !== null) {
    if (query.next.length < 1) return null;
    return {
      buildPieces: [query.hold, query.active, query.next[0]],
      searchNext: query.next,
      placeableNextCount: 1,
    };
  }
  if (query.next.length < 2) return null;
  return {
    buildPieces: [query.active, ...query.next.slice(0, 2)],
    searchNext: query.next,
    placeableNextCount: 2,
  };
}

function pieceCounts(pieces: Piece[]): Map<Piece, number> {
  const counts = new Map<Piece, number>();
  for (const piece of pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  return counts;
}

function sortedSignature(pieces: Piece[]): string {
  return [...pieces].sort().join("");
}

export function fitsCycle7BuildPool(
  setup: SetupVariant,
  buildPieces: Piece[],
  policy?: StructuredSetupPolicy,
): boolean {
  if (setup.placements.length !== 2 && setup.placements.length !== 3) return false;
  const available = pieceCounts(buildPieces);
  const required = pieceCounts(setup.pieceSignature);
  if (![...required].every(([piece, count]) => (available.get(piece) ?? 0) >= count)) return false;
  if (setup.placements.length === 3) {
    return sortedSignature(buildPieces) === sortedSignature(setup.pieceSignature);
  }

  const constraint = policy?.buildConstraints?.find(({ candidateSetupIds }) =>
    candidateSetupIds.includes(setup.id)
    || (setup.mirrorOf !== undefined && candidateSetupIds.includes(setup.mirrorOf)));
  if (!constraint) return false;

  const savedPiece = setup.mirrorOf
    ? mirrorPiece(constraint.requiredSavedPiece)
    : constraint.requiredSavedPiece;
  return sortedSignature(buildPieces) === sortedSignature([...setup.pieceSignature, savedPiece]);
}
