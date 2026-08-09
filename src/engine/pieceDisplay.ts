import type { Piece } from "./types";

/** Canonical order for unordered tetromino sets shown to the user. */
export const PIECE_DISPLAY_ORDER = ["T", "O", "I", "L", "J", "S", "Z"] as const satisfies readonly Piece[];

const displayRank = new Map<Piece, number>(
  PIECE_DISPLAY_ORDER.map((piece, index) => [piece, index]),
);
const PIECE_NOTATION_TOKEN = /(?<![A-Z])([TOILJSZ]{2,})(?![A-Z])/g;

export function sortPiecesForDisplay<T extends Piece>(pieces: readonly T[]): T[] {
  return [...pieces].sort((left, right) => displayRank.get(left)! - displayRank.get(right)!);
}

export function formatPieceSetForDisplay(
  pieces: readonly Piece[],
  separator = "",
): string {
  return sortPiecesForDisplay(pieces).join(separator);
}

/**
 * Normalizes only standalone uppercase tetromino tokens inside a UI label.
 * Callers must not pass queue/order-sensitive strings to this function.
 */
export function normalizePieceNotationForDisplay(label: string): string {
  return label.replace(PIECE_NOTATION_TOKEN, (token) =>
    formatPieceSetForDisplay([...token] as Piece[]));
}
