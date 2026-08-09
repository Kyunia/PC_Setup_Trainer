import { PIECES, type Cycle, type Piece } from "../engine/types";

const CYCLE_BY_REMAINING_PIECES: Readonly<Record<number, Cycle>> = {
  1: 3,
  2: 5,
  3: 7,
  4: 2,
  5: 4,
  6: 6,
  7: 1,
};

export interface QueueJumpTarget {
  normalized: string;
  pieces: Piece[];
  cycle: Cycle;
}

export function parseQueueJumpInput(input: string): QueueJumpTarget {
  const normalized = input.toUpperCase().replace(/[\s,]+/g, "");
  if (normalized.length < 1 || normalized.length > 7) {
    throw new Error("Enter between 1 and 7 minos.");
  }
  const pieces = [...normalized];
  if (pieces.some((piece) => !(PIECES as readonly string[]).includes(piece))) {
    throw new Error("Use only I, J, L, O, S, T, and Z.");
  }
  return {
    normalized,
    pieces: pieces as Piece[],
    cycle: CYCLE_BY_REMAINING_PIECES[pieces.length],
  };
}
