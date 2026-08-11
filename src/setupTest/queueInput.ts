import { createBoard } from "../engine/board";
import { PIECES, type Cycle, type Piece } from "../engine/types";
import type { ReplayRecommendationInput } from "../replay/recommendationController";

export interface SetupTestBagSegment {
  label: string;
  length: number;
}

const FIRST_BAG_LENGTH: Record<Cycle, number> = {
  1: 7,
  2: 4,
  3: 1,
  4: 5,
  5: 2,
  6: 6,
  7: 3,
};

export const DEFAULT_SETUP_TEST_QUEUES: Record<Cycle, string[]> = {
  1: ["TOILJSZ"],
  2: ["TOIL", "JSZ"],
  3: ["T", "OILJSZ"],
  4: ["JOSTZ", "IL"],
  5: ["TO", "ILJSZ"],
  6: ["TOILJS", "Z"],
  7: ["TOI", "LJSZ"],
};

export function setupTestBagSegments(cycle: Cycle): SetupTestBagSegment[] {
  const firstLength = FIRST_BAG_LENGTH[cycle];
  if (firstLength === 7) return [{ label: "Current bag", length: 7 }];
  return [
    { label: "Current bag", length: firstLength },
    { label: "See next bag", length: 7 - firstLength },
  ];
}

function normalizeGroup(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

function validatePieceString(value: string, label: string, minimum: number, maximum: number): Piece[] {
  const normalized = normalizeGroup(value);
  if (normalized.length < minimum || normalized.length > maximum) {
    const expected = minimum === maximum ? `exactly ${minimum}` : `${minimum}-${maximum}`;
    throw new Error(`${label} requires ${expected} piece${maximum === 1 ? "" : "s"}.`);
  }
  const invalid = [...normalized].find((piece) => !PIECES.includes(piece as Piece));
  if (invalid) throw new Error(`Unknown piece "${invalid}". Use only T, O, I, L, J, S, and Z.`);
  return [...normalized] as Piece[];
}

export interface ParsedSetupTestQueue {
  input: ReplayRecommendationInput;
  groups: string[];
  visibleQueue: Piece[];
}

/**
 * Converts the same seven-piece HOLD/ACTIVE/NEXT window shown by Replay into
 * the production recommendation query used by both runtime frontends.
 */
export function parseSetupTestQueue(
  cycle: Cycle,
  rawGroups: readonly string[],
  holdOccupied: boolean,
): ParsedSetupTestQueue {
  const segments = setupTestBagSegments(cycle);
  if (rawGroups.length !== segments.length) {
    throw new Error(`Cycle ${cycle} requires ${segments.length} bag segment${segments.length === 1 ? "" : "s"}.`);
  }

  const groups = rawGroups.map(normalizeGroup);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const group = groups[index];
    if (group.length !== segment.length) {
      throw new Error(`${segment.label} requires exactly ${segment.length} piece${segment.length === 1 ? "" : "s"}.`);
    }
    const invalid = [...group].find((piece) => !PIECES.includes(piece as Piece));
    if (invalid) throw new Error(`Unknown piece "${invalid}". Use only T, O, I, L, J, S, and Z.`);
  }

  const visibleQueue = [...groups.join("")] as Piece[];
  const hold = holdOccupied ? visibleQueue[0] : null;
  const activeIndex = holdOccupied ? 1 : 0;
  const active = visibleQueue[activeIndex];
  if (!active) throw new Error("The visible queue does not contain an ACTIVE piece.");

  return {
    groups,
    visibleQueue,
    input: {
      cycle,
      board: createBoard(),
      active,
      hold,
      next: visibleQueue.slice(activeIndex + 1, activeIndex + 6),
      holdAvailable: true,
    },
  };
}

/** Parses an already reconstructed runtime state instead of a bag display. */
export function parseSetupTestState(
  cycle: Cycle,
  rawHold: string,
  rawActive: string,
  rawNext: string,
): ParsedSetupTestQueue {
  const holdPieces = validatePieceString(rawHold, "HOLD", 0, 1);
  const [active] = validatePieceString(rawActive, "ACTIVE", 1, 1);
  const next = validatePieceString(rawNext, "NEXT", 1, 10);
  const hold = holdPieces[0] ?? null;
  return {
    groups: [hold ?? "", active, next.join("")],
    visibleQueue: [...holdPieces, active, ...next],
    input: {
      cycle,
      board: createBoard(),
      active,
      hold,
      next,
      holdAvailable: true,
    },
  };
}
