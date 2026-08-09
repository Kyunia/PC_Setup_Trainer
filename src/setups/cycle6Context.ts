import { PIECES, type Piece } from "../engine/types";
import type { SetupQuery } from "./query";
import type { SetupVariant } from "./schema";

export type Cycle6ClassificationMode = "unique-no-piece" | "duplicate-pool-unsupported";

export interface Cycle6QueueContext {
  /** 6+5 선택 창 중 첫 가방에 속하는 여섯 미노. 초기 setup 구축에만 사용한다. */
  buildPieces: Piece[];
  /** HOLD에서 마지막 구축 미노를 꺼내기 위한 다음 가방 첫 미노까지 포함한다. */
  searchNext: Piece[];
  /** searchNext 중 첫 가방 소속이며 geometry에 실제 배치할 수 있는 개수. */
  placeableNextCount: number;
  /** 정상 7-bag은 단일 No X. 쿼리하지 않은 중복 풀은 비워 둔다. */
  classPieces: Piece[];
  classificationMode: Cycle6ClassificationMode;
}

function cycle6Classes(buildPieces: Piece[]): Pick<Cycle6QueueContext, "classPieces" | "classificationMode"> {
  const distinct = new Set(buildPieces);
  if (distinct.size === 6) {
    const missing = PIECES.find((piece) => !distinct.has(piece));
    return missing
      ? { classPieces: [missing], classificationMode: "unique-no-piece" }
      : { classPieces: [], classificationMode: "unique-no-piece" };
  }

  // OOITSJ처럼 중복 미노가 있는 6회차는 일반 No X source class가 아니다.
  // 별도 쿼리 데이터가 없으므로 다른 No X catalog를 호환성만으로 재사용하지 않는다.
  return { classPieces: [], classificationMode: "duplicate-pool-unsupported" };
}

/**
 * 6회차 시작 상태의 `6+5` 경계를 복원한다.
 *
 * HOLD가 차 있으면 H + A + NEXT 4가 첫 가방 여섯 미노이고 NEXT[4]는
 * 다음 가방의 첫 미노다. HOLD가 비면 A + NEXT 5가 첫 가방 여섯 미노다.
 * QB catalog는 이 context에서 조회하지 않는다.
 */
export function cycle6QueueContext(query: SetupQuery): Cycle6QueueContext | null {
  if (query.hold !== null) {
    if (query.next.length < 5) return null;
    const buildPieces = [query.hold, query.active, ...query.next.slice(0, 4)];
    return {
      buildPieces,
      searchNext: query.next,
      placeableNextCount: 4,
      ...cycle6Classes(buildPieces),
    };
  }

  if (query.next.length < 5) return null;
  const buildPieces = [query.active, ...query.next.slice(0, 5)];
  return {
    buildPieces,
    searchNext: query.next,
    placeableNextCount: 5,
    ...cycle6Classes(buildPieces),
  };
}

function pieceCounts(pieces: Piece[]): Map<Piece, number> {
  const counts = new Map<Piece, number>();
  for (const piece of pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  return counts;
}

/** setup의 모든 미노를 첫 가방 여섯 미노의 multiset으로 공급할 수 있는지 검사한다. */
export function fitsCycle6BuildPool(setup: SetupVariant, buildPieces: Piece[]): boolean {
  if (setup.placements.length < 3 || setup.placements.length > 5) return false;
  const available = pieceCounts(buildPieces);
  const required = pieceCounts(setup.pieceSignature);
  return [...required].every(([piece, count]) => (available.get(piece) ?? 0) >= count);
}
