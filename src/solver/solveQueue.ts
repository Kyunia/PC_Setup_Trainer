import { formatPieceSetForDisplay } from "../engine/pieceDisplay";
import { PIECES, type Cycle, type GameState, type Piece } from "../engine/types";
import { selectionHoldCount, type PlacementTransitionOptions } from "../engine/placement";
import type { PlacementHistory } from "../engine/placementHistory";

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

export interface SolveQueueBagHistory {
  initialHasHold: boolean;
  locks: { piece: Piece; holds: 0 | 1 | 2 }[];
  pendingHolds: 0 | 1 | 2;
}

interface TaggedPiece {
  piece: Piece;
  bagIndex: number;
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
  history: SolveQueueBagHistory,
): SolveQueueAnalysis {
  const pieces = piecesFromPattern(pattern);
  const startOffset = (cycle - 1) * 10;
  let nextOffset = startOffset;
  let holdTag: number | null = null;
  if (history.initialHasHold) holdTag = nextOffset++;
  let activeTag = nextOffset++;
  const placed: TaggedPiece[] = [];

  const applyHold = () => {
    if (holdTag === null) {
      holdTag = activeTag;
      activeTag = nextOffset++;
    } else {
      [activeTag, holdTag] = [holdTag, activeTag];
    }
  };
  for (const lock of history.locks) {
    for (let count = 0; count < lock.holds; count += 1) applyHold();
    placed.push({ piece: lock.piece, bagIndex: Math.floor(activeTag / 7) });
    activeTag = nextOffset++;
  }
  for (let count = 0; count < history.pendingHolds; count += 1) applyHold();

  const visibleTags = [
    ...(holdTag === null ? [] : [holdTag]),
    activeTag,
    ...Array.from({ length: Math.max(0, pieces.length - (holdTag === null ? 1 : 2)) }, () => nextOffset++),
  ];
  if (visibleTags.length < pieces.length) throw new Error("Solve queue bag trace is incomplete.");
  const taggedPattern = pieces.map((piece, index): TaggedPiece => ({
    piece,
    bagIndex: Math.floor(visibleTags[index]! / 7),
  }));

  const groups: Piece[][] = [];
  let previousBagIndex: number | null = null;
  for (const tagged of taggedPattern) {
    if (tagged.bagIndex !== previousBagIndex) groups.push([]);
    groups.at(-1)!.push(tagged.piece);
    previousBagIndex = tagged.bagIndex;
  }

  const finalBagIndex = taggedPattern.at(-1)?.bagIndex;
  const knownFinalBag = finalBagIndex === undefined ? [] : [
    ...placed.filter((tagged) => tagged.bagIndex === finalBagIndex).map(({ piece }) => piece),
    ...taggedPattern.filter((tagged) => tagged.bagIndex === finalBagIndex).map(({ piece }) => piece),
  ];
  const uniqueFinalBag = new Set(knownFinalBag);
  const nextBagRemainder = knownFinalBag.length < 7 && uniqueFinalBag.size === knownFinalBag.length
    ? PIECES.filter((piece) => !uniqueFinalBag.has(piece))
    : [];

  return { groups, nextBagRemainder, nextCycle: nextCycle(cycle) };
}

export function solveQueueBagHistory(
  placementHistory: PlacementHistory,
  currentState: GameState,
  options: PlacementTransitionOptions = {},
): SolveQueueBagHistory {
  const checkpoint = placementHistory.pcCheckpoints().at(-1);
  if (!checkpoint) throw new Error("Solve queue analysis has no PC checkpoint.");
  return {
    initialHasHold: checkpoint.state.hold !== null,
    locks: placementHistory.eventLog().slice(checkpoint.eventIndex).map(({ piece, holds }) => ({ piece, holds })),
    pendingHolds: selectionHoldCount(placementHistory.turnStartState(), currentState, options),
  };
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
