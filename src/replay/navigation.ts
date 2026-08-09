import type { Cycle, Piece } from "../engine/types";
import { replaySidebarQueue } from "./queueBag";
import type { ReplayDataV1 } from "./schema";

export interface ReplayPcSegment {
  pcIndex: number;
  cycle: Cycle;
  startFrame: number;
  endFrame: number;
  queue: Piece[];
  /** True only when startFrame is a verified 0P boundary for this PC. */
  hasTrustworthyStart: boolean;
}
export function buildReplayPcSegments(replay: ReplayDataV1): ReplayPcSegment[] {
  const framesByPc = new Map<number, Array<{ frameIndex: number; frame: ReplayDataV1["frames"][number] }>>();
  replay.frames.forEach((frame, frameIndex) => {
    const frames = framesByPc.get(frame.pcIndex) ?? [];
    frames.push({ frameIndex, frame }); framesByPc.set(frame.pcIndex, frames);
  });
  const initialPcIndex = replay.frames[0]?.pcIndex;
  return [...framesByPc.entries()].map(([pcIndex, frames]): ReplayPcSegment | null => {
    const boundary = frames.find(({ frame }) => frame.kind === "pc-start") ?? frames[0];
    const placements = frames.filter(({ frame }) => frame.kind === "placement");
    if (!boundary || (pcIndex !== initialPcIndex && placements.length === 0)) return null;
    const hasTrustworthyStart = boundary.frame.kind === "pc-start"
      && boundary.frame.pieceInPc === 0
      && boundary.frame.snapshot.run.pcCount === pcIndex
      && boundary.frame.snapshot.run.cycle === boundary.frame.cycle
      && boundary.frame.snapshot.run.piecesLockedSinceLastPc === 0;
    return {
      pcIndex, cycle: boundary.frame.cycle, startFrame: boundary.frameIndex,
      endFrame: placements.at(-1)?.frameIndex ?? boundary.frameIndex,
      queue: replaySidebarQueue(
        boundary.frame.snapshot.active,
        boundary.frame.snapshot.hold,
        boundary.frame.snapshot.next,
      ),
      hasTrustworthyStart,
    };
  }).filter((segment): segment is ReplayPcSegment => segment !== null).sort((a, b) => a.startFrame - b.startFrame);
}

export function segmentForFrame(segments: readonly ReplayPcSegment[], frameIndex: number): ReplayPcSegment | undefined {
  let low = 0; let high = segments.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1; const segment = segments[mid]!;
    if (frameIndex < segment.startFrame) high = mid - 1;
    else if (frameIndex > segment.endFrame) low = mid + 1;
    else return segment;
  }
  return undefined;
}
