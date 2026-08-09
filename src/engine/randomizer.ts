import { PIECES, type BagState, type Piece } from "./types";

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

function nextRandom(state: number): { state: number; value: number } {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return { state: next >>> 0, value: (next >>> 0) / 4294967296 };
}

export function createBagState(seed: string): BagState {
  return { rngState: hashSeed(seed), queue: [] };
}

function appendBag(state: BagState): BagState {
  const bag = [...PIECES] as Piece[];
  let rngState = state.rngState;
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const random = nextRandom(rngState);
    rngState = random.state;
    const j = Math.floor(random.value * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return { rngState, queue: [...state.queue, ...bag] };
}

export function ensureQueue(state: BagState, minimum: number): BagState {
  let next = { ...state, queue: [...state.queue] };
  while (next.queue.length < minimum) next = appendBag(next);
  return next;
}

export function drawPiece(state: BagState): { piece: Piece; bag: BagState } {
  const ready = ensureQueue(state, 7);
  const [piece, ...queue] = ready.queue;
  return { piece, bag: ensureQueue({ rngState: ready.rngState, queue }, 7) };
}
