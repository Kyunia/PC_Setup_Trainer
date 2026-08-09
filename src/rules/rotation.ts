import { collides } from "../engine/board";
import {
  ORIENTATIONS,
  type ActivePiece,
  type Board,
  type Orientation,
  type Piece,
  type RotationDirection,
} from "../engine/types";
import {
  kickKey,
  parseKickProperties,
  type KickCandidate,
} from "./kickProperties";
import { JSTRIS180_PROPERTIES } from "./jstris180Properties";

const JST180_KICKS = parseKickProperties(JSTRIS180_PROPERTIES);

export interface RotationResult {
  active: ActivePiece;
  rotated: boolean;
  kickIndex: number;
  privilege: boolean;
}

export function nextOrientation(from: Orientation, direction: RotationDirection): Orientation {
  const index = ORIENTATIONS.indexOf(from);
  const delta = direction === "CW" ? 1 : direction === "CCW" ? 3 : 2;
  return ORIENTATIONS[(index + delta) % 4];
}

/**
 * jstris180.properties는 회전 중심을 기준으로 한 절대 보정값을 담고 있다.
 * 이 프로젝트의 localCells는 I/O를 포함한 각 SRS 회전 상태의 기본 위치를
 * 이미 표현하므로, 첫 후보를 빼서 충돌 검사에 필요한 상대 wall kick만 남긴다.
 */
export function kickCandidates(piece: Piece, from: Orientation, to: Orientation): readonly KickCandidate[] {
  const candidates = JST180_KICKS[kickKey(piece, from, to)];
  if (!candidates?.length) throw new Error(`JST180 kick 전환이 없습니다: ${piece}.${from}${to}`);
  const basic = candidates[0];
  return candidates.map(({ dx, dy, privilege }) => ({
    dx: dx - basic.dx,
    dy: dy - basic.dy,
    privilege,
  }));
}

export function tryRotateWithResult(
  board: Board,
  active: ActivePiece,
  direction: RotationDirection,
): RotationResult {
  const to = nextOrientation(active.orientation, direction);
  const candidates = kickCandidates(active.piece, active.orientation, to);
  for (let kickIndex = 0; kickIndex < candidates.length; kickIndex += 1) {
    const { dx, dy, privilege } = candidates[kickIndex];
    const candidate = { ...active, orientation: to, x: active.x + dx, y: active.y + dy };
    if (!collides(board, candidate)) {
      return { active: candidate, rotated: true, kickIndex, privilege };
    }
  }
  return { active, rotated: false, kickIndex: -1, privilege: false };
}

export function tryRotate(board: Board, active: ActivePiece, direction: RotationDirection): ActivePiece {
  return tryRotateWithResult(board, active, direction).active;
}
