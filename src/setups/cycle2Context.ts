import type { Piece } from "../engine/types";
import { mirrorPiece } from "./mirror";
import type { StructuredSetupPolicy } from "./policy";
import type { SetupQuery } from "./query";
import type { SetupVariant } from "./schema";

export interface Cycle2QueueContext {
  buildPieces: Piece[];
  /** 홀드에서 마지막 구축 미노를 꺼낼 때 필요한 다음 가방 버퍼까지 포함한 보이는 NEXT */
  searchNext: Piece[];
  /** searchNext 중 실제 setup geometry에 놓을 수 있는 앞부분의 개수 */
  placeableNextCount: number;
  policyPrefix?: Piece[];
}

/**
 * 2회차의 남은 가방과 다음 가방을 분리한다.
 *
 * HOLD가 차 있으면 H + A + NEXT 2가 구축 미노 4개이고 NEXT의 나머지 3개가
 * 다음 가방 prefix다. HOLD가 비어 있으면 A + NEXT 3으로 구축은 가능하지만
 * See7에 다음 가방의 세 번째 미노가 보이지 않으므로 조건부 정책은 적용하지 않는다.
 */
export function cycle2QueueContext(query: SetupQuery): Cycle2QueueContext | null {
  if (query.hold !== null) {
    if (query.next.length < 2) return null;
    return {
      buildPieces: [query.hold, query.active, ...query.next.slice(0, 2)],
      searchNext: query.next,
      placeableNextCount: 2,
      policyPrefix: query.next.length >= 5 ? query.next.slice(2, 5) : undefined,
    };
  }
  if (query.next.length < 3) return null;
  return {
    buildPieces: [query.active, ...query.next.slice(0, 3)],
    searchNext: query.next,
    placeableNextCount: 3,
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

export function fitsCycle2BuildPool(
  setup: SetupVariant,
  buildPieces: Piece[],
  policy?: StructuredSetupPolicy,
): boolean {
  if (setup.placements.length !== 3 && setup.placements.length !== 4) return false;
  const available = pieceCounts(buildPieces);
  const required = pieceCounts(setup.pieceSignature);
  if (![...required].every(([piece, count]) => (available.get(piece) ?? 0) >= count)) return false;
  if (setup.placements.length === 4) return true;

  const constraint = policy?.buildConstraints?.find(({ candidateSetupIds }) =>
    candidateSetupIds.includes(setup.id)
    || (setup.mirrorOf !== undefined && candidateSetupIds.includes(setup.mirrorOf)));
  if (!constraint) return false;

  const savedPiece = setup.mirrorOf
    ? mirrorPiece(constraint.requiredSavedPiece)
    : constraint.requiredSavedPiece;
  const expectedPool = [...setup.pieceSignature, savedPiece];
  return sortedSignature(buildPieces) === sortedSignature(expectedPool);
}
