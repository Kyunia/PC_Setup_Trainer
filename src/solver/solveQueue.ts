import { formatPieceSetForDisplay } from "../engine/pieceDisplay";
import { PIECES, type Cycle, type GameState, type Piece } from "../engine/types";

export interface SolveQueueAnalysis {
  groups: Piece[][];
  nextBagRemainder: Piece[];
  nextCycle: Cycle;
}

export interface SavePrediction {
  save: Piece;
  nextCycle: Cycle;
  pool: Piece[];
  label: string;
}

const ordinalByCycle: Record<Cycle, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "5th",
  6: "6th",
  7: "7th",
};

function nextCycle(cycle: Cycle): Cycle {
  return (cycle === 7 ? 1 : cycle + 1) as Cycle;
}

function piecesFromPattern(pattern: string): Piece[] {
  const pieces = [...pattern] as Piece[];
  if (pieces.some((piece) => !PIECES.includes(piece))) {
    throw new Error("Solve queue contains an invalid piece.");
  }
  return pieces;
}

/**
 * Splits the exact solver window at physical 7-bag boundaries. A PC consumes
 * ten placed pieces, so the current absolute offset is recoverable from cycle
 * and the number of pieces already locked in this PC.
 */
export function analyzeSolveQueue(
  pattern: string,
  cycle: Cycle,
  piecesLockedSinceLastPc: number,
): SolveQueueAnalysis {
  const pieces = piecesFromPattern(pattern);
  const absoluteOffset = (cycle - 1) * 10 + piecesLockedSinceLastPc;
  let capacity = 7 - (absoluteOffset % 7);
  const groups: Piece[][] = [];
  let cursor = 0;
  while (cursor < pieces.length) {
    const group = pieces.slice(cursor, cursor + capacity);
    groups.push(group);
    cursor += group.length;
    capacity = 7;
  }

  const finalObservedBag = groups.at(-1) ?? [];
  const uniqueFinalBag = new Set(finalObservedBag);
  const nextBagRemainder = finalObservedBag.length < 7 && uniqueFinalBag.size === finalObservedBag.length
    ? PIECES.filter((piece) => !uniqueFinalBag.has(piece))
    : [];

  return { groups, nextBagRemainder, nextCycle: nextCycle(cycle) };
}

function predictionLabel(next: Cycle, pool: Piece[]): string {
  const ordinal = ordinalByCycle[next];
  const formattedPool = formatPieceSetForDisplay(pool);
  const counts = new Map<Piece, number>();
  for (const piece of pool) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  const duplicates = [...counts]
    .filter(([, count]) => count > 1)
    .map(([piece]) => piece);
  if (duplicates.length > 0) {
    return `Dupe ${formatPieceSetForDisplay(duplicates)} ${ordinal} (${formattedPool})`;
  }

  if (next === 4 && pool.length === 5) {
    const present = new Set(pool);
    return `No ${formatPieceSetForDisplay(PIECES.filter((piece) => !present.has(piece)))} ${ordinal} (${formattedPool})`;
  }
  if (next === 6 && pool.length === 6) {
    const present = new Set(pool);
    return `No ${formatPieceSetForDisplay(PIECES.filter((piece) => !present.has(piece)))} ${ordinal} (${formattedPool})`;
  }
  if (next === 1 && pool.length === 7) return `7-bag ${ordinal} (${formattedPool})`;
  return `${formattedPool} ${ordinal}`;
}

export function predictSavedPiece(
  analysis: SolveQueueAnalysis,
  save: Piece,
): SavePrediction {
  const pool = [save, ...analysis.nextBagRemainder];
  return {
    save,
    nextCycle: analysis.nextCycle,
    pool,
    label: predictionLabel(analysis.nextCycle, pool),
  };
}

export function formatSolveQueueGroups(groups: readonly (readonly Piece[])[]): string {
  return groups.map((group) => group.join("")).join("  ");
}

export function formatNextBagRemainder(analysis: SolveQueueAnalysis): string {
  const pieces = analysis.nextBagRemainder.length > 0 ? analysis.nextBagRemainder : [...PIECES];
  return `[${formatPieceSetForDisplay(pieces)}]!`;
}

/** Keeps a calculated shadow through intermediate line clears, but not a PC boundary or reset. */
export function liveSolveSessionKey(
  state: { seed: GameState["seed"]; run: Pick<GameState["run"], "pcCount" | "cycle"> },
  selectedId: string | null,
  resetNonce: number,
): string {
  return `${state.seed}:${state.run.pcCount}:${state.run.cycle}:${selectedId ?? "-"}:${resetNonce}`;
}

export function shouldShowLiveSolveShadow(
  calculatedLinesSinceLastPc: number,
  currentLinesSinceLastPc: number,
): boolean {
  return calculatedLinesSinceLastPc === currentLinesSinceLastPc;
}
