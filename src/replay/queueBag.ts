import type { Cycle, Piece } from "../engine/types";

const FIRST_BAG_LENGTH: Record<Cycle, number> = {
  1: 7,
  2: 4,
  3: 1,
  4: 5,
  5: 2,
  6: 6,
  7: 3,
};

/** Builds the seven visible choices, including HOLD when it is occupied. */
export function replaySidebarQueue(
  active: Piece,
  hold: Piece | null,
  next: readonly Piece[],
): Piece[] {
  return hold === null
    ? [active, ...next.slice(0, 6)]
    : [hold, active, ...next.slice(0, 5)];
}

/** Splits a complete HOLD/ACTIVE/NEXT seven-piece window at the cycle bag boundary. */
export function splitReplayQueueByBag(
  cycle: Cycle,
  queue: readonly Piece[],
  hasTrustworthyStart: boolean,
): Piece[][] | null {
  if (!hasTrustworthyStart || queue.length !== 7) return null;
  const firstLength = FIRST_BAG_LENGTH[cycle];
  if (firstLength === 7) return [[...queue]];
  return [queue.slice(0, firstLength), queue.slice(firstLength)];
}
