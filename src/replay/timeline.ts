import { applyPlacementEvent, copyGameState, type AppliedPlacement } from "../engine/placement";
import { occupiedCells } from "../engine/pieces";
import { ensureQueue } from "../engine/randomizer";
import type { GameState, Piece } from "../engine/types";
import { serializeBoard, snapshotFromGameState } from "./format";
import { buildReplayPcSegments, segmentForFrame, type ReplayPcSegment } from "./navigation";
import { gameStateFromInitial, verifyReplaySemantics } from "./qpcr3";
import { replaySidebarQueue } from "./queueBag";
import type { ReplayData, ReplayDataV1, ReplayDataV3, ReplayFrame } from "./schema";

export interface ReplayTimeline {
  readonly createdAt: string;
  readonly seed: string;
  readonly length: number;
  readonly segments: ReplayPcSegment[];
  frameAt(position: number): ReplayFrame;
  nextQueueAt(position: number, minimum: number): Piece[] | null;
}

function arraysEqual(left: readonly Piece[], right: readonly Piece[]): boolean {
  return left.length === right.length && left.every((piece, index) => piece === right[index]);
}

function appendOverlappingQueue(known: Piece[], window: readonly Piece[]): boolean {
  if (arraysEqual(known.slice(-window.length), window)) return true;
  const maximum = Math.min(known.length, window.length);
  for (let overlap = maximum; overlap > 0; overlap -= 1) {
    if (!arraysEqual(known.slice(-overlap), window.slice(0, overlap))) continue;
    known.push(...window.slice(overlap));
    return true;
  }
  return false;
}

function initialFrame(state: GameState): ReplayFrame {
  return { kind: "pc-start", pcIndex: state.run.pcCount, cycle: state.run.cycle, pieceInPc: state.run.piecesLockedSinceLastPc, snapshot: snapshotFromGameState(state) };
}

function placementFrame(applied: AppliedPlacement): ReplayFrame {
  return {
    kind: "placement", pcIndex: applied.before.run.pcCount, cycle: applied.before.run.cycle,
    pieceInPc: applied.before.run.piecesLockedSinceLastPc + 1, snapshot: snapshotFromGameState(applied.after),
    displayBoard: serializeBoard(applied.lockedBoard),
    placement: {
      piece: applied.before.active.piece, orientation: applied.before.active.orientation,
      x: applied.before.active.x, y: applied.before.active.y, cells: occupiedCells(applied.before.active),
      clearedLines: applied.clearedLines, perfectClear: applied.perfectClear,
    },
  };
}

class FrameReplayTimeline implements ReplayTimeline {
  readonly createdAt: string; readonly seed: string; readonly length: number; readonly segments: ReplayPcSegment[];
  private readonly frames: ReplayFrame[];
  constructor(replay: ReplayDataV1) {
    this.createdAt = replay.createdAt; this.seed = replay.seed;
    this.frames = [];
    let currentPc = replay.frames[0]?.pcIndex;
    const placementPcs = new Set(replay.frames.filter(({ kind }) => kind === "placement").map(({ pcIndex }) => pcIndex));
    for (const [sourceIndex, frame] of replay.frames.entries()) {
      if (frame.kind === "pc-start" && sourceIndex !== 0 && !placementPcs.has(frame.pcIndex)) continue;
      if (frame.kind === "placement" && currentPc !== undefined && frame.pcIndex !== currentPc) {
        const previous = this.frames.at(-1);
        if (previous?.kind !== "pc-start" || previous.pcIndex !== frame.pcIndex) {
          const snapshot = previous?.snapshot ?? frame.snapshot;
          this.frames.push({
            kind: "pc-start", pcIndex: frame.pcIndex, cycle: frame.cycle, pieceInPc: 0,
            snapshot: { ...snapshot, run: { ...snapshot.run, pcCount: frame.pcIndex, cycle: frame.cycle, piecesLockedSinceLastPc: 0, linesSinceLastPc: 0 } },
          });
        }
      }
      this.frames.push(frame);
      currentPc = frame.pcIndex;
    }
    const normalized: ReplayDataV1 = { ...replay, frames: this.frames };
    this.length = this.frames.length; this.segments = buildReplayPcSegments(normalized);
  }
  frameAt(position: number): ReplayFrame {
    const frame = this.frames[position]; if (!frame) throw new RangeError("Replay frame is out of range."); return frame;
  }
  nextQueueAt(position: number, minimum: number): Piece[] | null {
    const source = this.frames[position];
    if (!source || !Number.isInteger(minimum) || minimum < 0) return null;
    const known = [...source.snapshot.next];
    for (let index = position + 1; known.length < minimum && index < this.frames.length; index += 1) {
      const window = this.frames[index]!.snapshot.next;
      if (window.length > 0 && !appendOverlappingQueue(known, window)) return null;
    }
    return known.length >= minimum ? known.slice(0, minimum) : null;
  }
}

interface IndexedSegment extends ReplayPcSegment { startEventIndex: number; initialState: GameState }

class Qpcr3Timeline implements ReplayTimeline {
  readonly createdAt: string; readonly seed: string; readonly length: number; readonly segments: IndexedSegment[];
  private readonly cache = new Map<number, ReplayFrame>();
  private readonly cacheLimit = 32;
  constructor(private readonly replay: ReplayDataV3) {
    verifyReplaySemantics(replay);
    this.createdAt = replay.createdAt; this.seed = replay.seed;
    const built = this.buildIndex(); this.segments = built.segments; this.length = built.length;
  }
  private buildIndex(): { segments: IndexedSegment[]; length: number } {
    let state = gameStateFromInitial(this.replay.seed, this.replay.initial);
    let frame = 0;
    const segments: IndexedSegment[] = [{
      pcIndex: state.run.pcCount, cycle: state.run.cycle, startFrame: 0, endFrame: 0,
      queue: replaySidebarQueue(state.active.piece, state.hold, state.bag.queue), startEventIndex: 0, initialState: copyGameState(state),
      hasTrustworthyStart: state.run.piecesLockedSinceLastPc === 0,
    }];
    let current = segments[0]!;
    for (let index = 0; index < this.replay.events.eventCount; index += 1) {
      const beforePc = state.run.pcCount;
      state = applyPlacementEvent(state, this.replay.events.eventAt(index), index).after;
      frame += 1; current.endFrame = frame;
      if (state.run.pcCount !== beforePc && index + 1 < this.replay.events.eventCount) {
        frame += 1;
        current = {
          pcIndex: state.run.pcCount, cycle: state.run.cycle, startFrame: frame, endFrame: frame,
          queue: replaySidebarQueue(state.active.piece, state.hold, state.bag.queue), startEventIndex: index + 1, initialState: copyGameState(state),
          hasTrustworthyStart: state.run.piecesLockedSinceLastPc === 0,
        };
        segments.push(current);
      }
    }
    return { segments, length: frame + 1 };
  }
  frameAt(position: number): ReplayFrame {
    if (!Number.isInteger(position) || position < 0 || position >= this.length) throw new RangeError("Replay frame is out of range.");
    const cached = this.cache.get(position);
    if (cached) {
      this.cache.delete(position);
      this.cache.set(position, cached);
      return cached;
    }
    const segment = segmentForFrame(this.segments, position) as IndexedSegment | undefined;
    if (!segment) throw new RangeError("Replay frame has no PC segment.");
    if (position === segment.startFrame) return this.remember(position, initialFrame(segment.initialState));
    let state = copyGameState(segment.initialState);
    const targetEvent = segment.startEventIndex + (position - segment.startFrame - 1);
    let applied: AppliedPlacement | undefined;
    for (let index = segment.startEventIndex; index <= targetEvent; index += 1) {
      applied = applyPlacementEvent(state, this.replay.events.eventAt(index), index); state = applied.after;
    }
    if (!applied) throw new Error("Replay segment calculation failed.");
    return this.remember(position, placementFrame(applied));
  }
  nextQueueAt(position: number, minimum: number): Piece[] | null {
    if (!Number.isInteger(minimum) || minimum < 0) return null;
    const state = this.stateAt(position);
    return ensureQueue(state.bag, minimum).queue.slice(0, minimum);
  }
  private stateAt(position: number): GameState {
    if (!Number.isInteger(position) || position < 0 || position >= this.length) throw new RangeError("Replay frame is out of range.");
    const segment = segmentForFrame(this.segments, position) as IndexedSegment | undefined;
    if (!segment) throw new RangeError("Replay frame has no PC segment.");
    let state = copyGameState(segment.initialState);
    if (position === segment.startFrame) return state;
    const targetEvent = segment.startEventIndex + (position - segment.startFrame - 1);
    for (let index = segment.startEventIndex; index <= targetEvent; index += 1) {
      state = applyPlacementEvent(state, this.replay.events.eventAt(index), index).after;
    }
    return state;
  }
  private remember(position: number, frame: ReplayFrame): ReplayFrame {
    this.cache.set(position, frame);
    if (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value!);
    return frame;
  }
}

export function createReplayTimeline(replay: ReplayData): ReplayTimeline {
  return replay.version === 1 ? new FrameReplayTimeline(replay) : new Qpcr3Timeline(replay);
}
