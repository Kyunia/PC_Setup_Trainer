import { PIECES, type Piece } from "../engine/types";
import type { SetupQuery } from "./query";
import type { SetupVariant } from "./schema";

export type Cycle4ClassificationMode = "normal-missing-pair" | "duplicate-pool-unsupported";

export interface Cycle4QueueContext {
  /** 5+6 선택 창 중 첫 가방에 속하는 다섯 미노. 초기 setup 구축에만 사용한다. */
  buildPieces: Piece[];
  /** HOLD에서 마지막 구축 미노를 꺼내기 위한 다음 가방 첫 미노까지 포함한다. */
  searchNext: Piece[];
  /** searchNext 중 첫 가방 소속이며 geometry에 실제 배치할 수 있는 개수. */
  placeableNextCount: number;
  /** 정상 7-bag에서 첫 다섯 미노에 없는 두 미노. 중복 풀에서는 비워 둔다. */
  missingPieces: Piece[];
  classificationMode: Cycle4ClassificationMode;
}

function classifyCycle4(buildPieces: Piece[]): Pick<Cycle4QueueContext, "missingPieces" | "classificationMode"> {
  const distinct = new Set(buildPieces);
  if (distinct.size !== 5) {
    // 중복미노 4회차는 별도 source class가 필요하다. 일반 No XY catalog에
    // 억지로 대응시키면 geometry와 성공률을 잘못 적용하므로 추천하지 않는다.
    return { missingPieces: [], classificationMode: "duplicate-pool-unsupported" };
  }

  return {
    missingPieces: PIECES.filter((piece) => !distinct.has(piece)),
    classificationMode: "normal-missing-pair",
  };
}

/**
 * 4회차 시작 상태의 `5+6` 경계를 복원한다.
 *
 * HOLD가 차 있으면 H + A + NEXT 3이 첫 가방 다섯 미노이고 NEXT[3]은
 * 다음 가방의 첫 미노다. HOLD가 비면 A + NEXT 4가 첫 가방 다섯 미노다.
 * QB/OQB catalog는 이 context에서 조회하지 않는다.
 */
export function cycle4QueueContext(query: SetupQuery): Cycle4QueueContext | null {
  if (query.hold !== null) {
    if (query.next.length < 4) return null;
    const buildPieces = [query.hold, query.active, ...query.next.slice(0, 3)];
    return {
      buildPieces,
      searchNext: query.next,
      placeableNextCount: 3,
      ...classifyCycle4(buildPieces),
    };
  }

  if (query.next.length < 5) return null;
  const buildPieces = [query.active, ...query.next.slice(0, 4)];
  return {
    buildPieces,
    searchNext: query.next,
    placeableNextCount: 4,
    ...classifyCycle4(buildPieces),
  };
}

function pieceCounts(pieces: Piece[]): Map<Piece, number> {
  const counts = new Map<Piece, number>();
  for (const piece of pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  return counts;
}

/** setup의 모든 미노를 첫 가방 다섯 미노의 multiset으로 공급할 수 있는지 검사한다. */
export function fitsCycle4BuildPool(setup: SetupVariant, buildPieces: Piece[]): boolean {
  if (setup.placements.length < 2 || setup.placements.length > 5) return false;
  const available = pieceCounts(buildPieces);
  const required = pieceCounts(setup.pieceSignature);
  return [...required].every(([piece, count]) => (available.get(piece) ?? 0) >= count);
}
