import { PIECES, type Piece } from "../engine/types";
import type { SetupQuery } from "./query";
import type { SetupVariant } from "./schema";

export interface Cycle3QueueContext {
  /** 2회차 종료 때 남겨 HOLD에 보존한 한 미노. 이 값이 3회차 class다. */
  classPiece: Piece;
  /** saved piece + 새 가방 일곱 미노. */
  buildPieces: Piece[];
  /** NEXT 5 뒤에 7-bag 규칙으로 확정되는 마지막 미노를 붙인 탐색 queue. */
  searchNext: Piece[];
  /** searchNext의 여섯 미노는 모두 현재 셋업에 배치할 수 있다. */
  placeableNextCount: number;
  /** 새 가방의 완전한 순서. T 3회차의 조건부 policy가 사용한다. */
  policyPrefix: Piece[];
  inferredLastPiece: Piece;
}

function uniquePieces(pieces: Piece[]): boolean {
  return new Set(pieces).size === pieces.length;
}

/**
 * 3회차 시작 상태를 `saved HOLD + ACTIVE + NEXT 5`에서 복원한다.
 *
 * ACTIVE와 NEXT 5는 새 7-bag의 앞 여섯 미노다. 서로 달라야 하며, 보이지
 * 않는 마지막 미노는 7종 중 빠진 하나로 결정된다. saved HOLD는 직전
 * 가방 소속이므로 새 가방에 같은 종류가 다시 등장해도 정상이다.
 */
export function cycle3QueueContext(query: SetupQuery): Cycle3QueueContext | null {
  if (query.hold === null || query.next.length < 5) return null;
  const visibleNewBag = [query.active, ...query.next.slice(0, 5)];
  if (!uniquePieces(visibleNewBag)) return null;
  const inferred = PIECES.find((piece) => !visibleNewBag.includes(piece));
  if (!inferred) return null;
  const policyPrefix = [...visibleNewBag, inferred];
  return {
    classPiece: query.hold,
    buildPieces: [query.hold, ...policyPrefix],
    searchNext: [...query.next.slice(0, 5), inferred],
    placeableNextCount: 6,
    policyPrefix,
    inferredLastPiece: inferred,
  };
}

function pieceCounts(pieces: Piece[]): Map<Piece, number> {
  const counts = new Map<Piece, number>();
  for (const piece of pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  return counts;
}

export function fitsCycle3BuildPool(setup: SetupVariant, buildPieces: Piece[]): boolean {
  if (setup.placements.length < 2 || setup.placements.length > 8) return false;
  const available = pieceCounts(buildPieces);
  const required = pieceCounts(setup.pieceSignature);
  return [...required].every(([piece, count]) => (available.get(piece) ?? 0) >= count);
}
