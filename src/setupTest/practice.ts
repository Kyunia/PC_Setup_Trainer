import { createBoard } from "../engine/board";
import { spawnPiece } from "../engine/pieces";
import { createBagState, ensureQueue } from "../engine/randomizer";
import { PIECES, type BagState, type GameState, type Piece } from "../engine/types";
import { SNAPSHOT_BOARD_HEIGHT } from "../replay/snapshot";
import type { SetupQuery } from "../setups/query";
import { setupTestBagSegments, type ParsedSetupTestQueue } from "./queueInput";

export interface ExtendedSetupTestQueue {
  visibleQueue: Piece[];
  rngState: number;
}

function assertUniqueSegment(pieces: readonly Piece[], label: string): void {
  if (new Set(pieces).size !== pieces.length) {
    throw new Error(`${label} contains a duplicate piece and is not a valid 7-bag segment.`);
  }
}

function randomBag(state: BagState): { pieces: Piece[]; state: BagState } {
  const ready = ensureQueue({ rngState: state.rngState, queue: [] }, PIECES.length);
  return {
    pieces: ready.queue.slice(0, PIECES.length),
    state: { rngState: ready.rngState, queue: [] },
  };
}

/**
 * Keeps every entered piece in order, completes the partially observed bag,
 * then appends one complete random bag. The first segment is the cycle's
 * remaining current-bag window; every later segment is a full seven-bag.
 */
export function extendSetupTestQueue(
  cycle: ParsedSetupTestQueue["input"]["cycle"],
  knownQueue: readonly Piece[],
  seed: string,
): ExtendedSetupTestQueue {
  const firstBagLength = setupTestBagSegments(cycle)[0].length;
  if (knownQueue.length < firstBagLength) {
    throw new Error(`0P Practice requires at least ${firstBagLength} entered pieces for Cycle ${cycle}.`);
  }

  let offset = 0;
  let segmentLength = firstBagLength;
  let segmentNumber = 1;
  while (knownQueue.length - offset >= segmentLength) {
    const segment = knownQueue.slice(offset, offset + segmentLength);
    assertUniqueSegment(segment, segmentNumber === 1 ? "Current bag" : `Bag ${segmentNumber}`);
    offset += segmentLength;
    segmentLength = PIECES.length;
    segmentNumber += 1;
  }

  const partialBag = knownQueue.slice(offset);
  assertUniqueSegment(partialBag, `Bag ${segmentNumber}`);

  let randomState = createBagState(seed);
  const extended = [...knownQueue];
  if (partialBag.length > 0) {
    const completionBag = randomBag(randomState);
    const observed = new Set(partialBag);
    extended.push(...completionBag.pieces.filter((piece) => !observed.has(piece)));
    randomState = completionBag.state;
  }

  const followingBag = randomBag(randomState);
  extended.push(...followingBag.pieces);
  return { visibleQueue: extended, rngState: followingBag.state.rngState };
}

export function setupTestPracticeSeed(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `setup-test:${uuid}` : `setup-test:${Date.now()}:${Math.random()}`;
}

export function createSetupTestPracticeState(
  parsed: ParsedSetupTestQueue,
  seed = setupTestPracticeSeed(),
): GameState {
  const extended = extendSetupTestQueue(parsed.input.cycle, parsed.visibleQueue, seed);
  const activeIndex = parsed.input.hold === null ? 0 : 1;
  if (extended.visibleQueue[activeIndex] !== parsed.input.active) {
    throw new Error("The entered HOLD/ACTIVE state does not match the bag queue.");
  }

  return {
    board: createBoard(SNAPSHOT_BOARD_HEIGHT),
    active: spawnPiece(parsed.input.active, SNAPSHOT_BOARD_HEIGHT),
    hold: parsed.input.hold,
    holdUsedThisTurn: false,
    bag: {
      rngState: extended.rngState,
      queue: extended.visibleQueue.slice(activeIndex + 1),
    },
    run: {
      cycle: parsed.input.cycle,
      pcCount: 0,
      piecesLockedSinceLastPc: 0,
      linesSinceLastPc: 0,
      status: "playing",
      message: `Cycle ${parsed.input.cycle} 0P practice.`,
    },
    seed,
  };
}

export function setupQueryFromPracticeState(state: GameState): SetupQuery & { holdAvailable: true } {
  return {
    cycle: state.run.cycle,
    board: state.board,
    active: state.active.piece,
    hold: state.hold,
    next: state.bag.queue,
    holdAvailable: true,
  };
}
