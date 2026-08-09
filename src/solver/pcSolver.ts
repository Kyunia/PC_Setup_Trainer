import { encoder, Field } from "tetris-fumen";
import {
  BOARD_WIDTH,
  type Board,
  type BoardCell,
  type Piece,
} from "../engine/types";

export const PC_SOLVER_URL = "https://wirelyre.github.io/tetra-tools/pc-solver.html";
const FUMEN_FIELD_HEIGHT = 23;
const VALID_CELLS = new Set<Exclude<BoardCell, null>>(["I", "J", "L", "O", "S", "T", "Z", "X"]);

export interface PcSolverInput {
  board: Board;
  active: Piece;
  hold: Piece | null;
  next: readonly Piece[];
}

export type PcSolverWindowOpen = (
  url: string,
  target: string,
  features: string,
) => Window | null;

export function pcSolverQueue(input: Pick<PcSolverInput, "active" | "hold" | "next">): Piece[] {
  return input.hold === null
    ? [input.active, ...input.next.slice(0, 6)]
    : [input.hold, input.active, ...input.next.slice(0, 5)];
}

function isEncodableBoard(board: Board): boolean {
  if (board.some((row) => row.length !== BOARD_WIDTH
    || row.some((cell) => cell !== null && !VALID_CELLS.has(cell)))) return false;
  return !board.slice(FUMEN_FIELD_HEIGHT).some((row) => row.some((cell) => cell !== null));
}

export function encodePcSolverFumen(input: PcSolverInput): string | null {
  const queue = pcSolverQueue(input);
  if (queue.length !== 7 || !isEncodableBoard(input.board)) return null;

  const field = Field.create();
  for (let y = 0; y < Math.min(input.board.length, FUMEN_FIELD_HEIGHT); y += 1) {
    const row = input.board[y]!;
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = row[x]!;
      if (cell !== null) field.set(x, y, cell);
    }
  }
  return encoder.encode([{
    field,
    comment: queue.join(""),
    flags: { colorize: true },
  }]);
}

export function pcSolverUrl(input: PcSolverInput): string | null {
  const fumen = encodePcSolverFumen(input);
  return fumen ? `${PC_SOLVER_URL}?fumen=${encodeURIComponent(fumen)}` : null;
}

export function openPcSolver(
  input: PcSolverInput,
  openWindow: PcSolverWindowOpen = (url, target, features) => window.open(url, target, features),
): boolean {
  const url = pcSolverUrl(input);
  if (!url) return false;
  try {
    const opened = openWindow(url, "_blank", "noopener,noreferrer");
    if (opened) opened.opener = null;
    return opened !== null;
  } catch {
    return false;
  }
}

