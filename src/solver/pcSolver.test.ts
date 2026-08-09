import { decoder } from "tetris-fumen";
import { describe, expect, it, vi } from "vitest";
import { createBoard } from "../engine/board";
import { createGameState } from "../engine/game";
import type { Board, Piece } from "../engine/types";
import {
  encodePcSolverFumen,
  openPcSolver,
  pcSolverQueue,
  pcSolverUrl,
  type PcSolverInput,
} from "./pcSolver";

function boardFromRows(rows: string[]): Board {
  const board = createBoard();
  rows.forEach((row, y) => {
    board[y] = [...row].map((cell) => cell === "." ? null : cell as Exclude<Board[number][number], null>);
  });
  return board;
}

function input(overrides: Partial<PcSolverInput> = {}): PcSolverInput {
  return {
    board: createBoard(),
    active: "I",
    hold: "T",
    next: ["Z", "S", "O", "J", "L", "T", "I"],
    ...overrides,
  };
}

describe("shared PC Solver link", () => {
  it("matches the provided colored field and seven-piece comment Fumen", () => {
    const board = boardFromRows([
      "IT.....OOL",
      "ITT....OOL",
      "IT......LL",
      "I.........",
    ]);
    const fumen = encodePcSolverFumen(input({ board }));
    expect(fumen).toBe("v115@9gwhIewhwwFehlwhxwDeRpglwhwwEeRpglJeAgWHAU?eLuCv/jBA");
    expect(decoder.decode(fumen!)[0]?.comment).toBe("TIZSOJL");
    expect(new URL(pcSolverUrl(input({ board }))!).searchParams.get("fumen")).toBe(fumen);
  });

  it("uses ACTIVE plus six NEXT pieces when HOLD is empty without placing ACTIVE on the field", () => {
    const state = createGameState("pc-solver-main");
    state.board[0]![0] = "J";
    state.active = { piece: "T", orientation: "S", x: 7, y: 12 };
    state.hold = null;
    state.bag.queue = [..."IOLJSZT"] as Piece[];
    const gameInput = input({
      board: state.board,
      active: state.active.piece,
      hold: state.hold,
      next: state.bag.queue,
    });
    const page = decoder.decode(encodePcSolverFumen(gameInput)!)[0]!;
    expect(pcSolverQueue(gameInput)).toEqual([..."TIOLJSZ"]);
    expect(page.comment).toBe("TIOLJSZ");
    expect(page.field.at(0, 0)).toBe("J");
    expect(page.field.at(7, 12)).toBe("_");
  });

  it("fails closed for short queues, malformed rows, or occupancy at y=23", () => {
    expect(encodePcSolverFumen(input({ next: ["Z", "S"] }))).toBeNull();
    expect(encodePcSolverFumen(input({ board: [[null]] }))).toBeNull();
    const board = createBoard();
    board[23]![0] = "I";
    expect(encodePcSolverFumen(input({ board }))).toBeNull();
  });

  it("opens a generated URL in an isolated tab and does not open invalid input", () => {
    const opened = { opener: {} } as Window;
    const openWindow = vi.fn(() => opened);
    expect(openPcSolver(input(), openWindow)).toBe(true);
    expect(openWindow).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/wirelyre\.github\.io\/tetra-tools\/pc-solver\.html\?fumen=/),
      "_blank",
      "noopener,noreferrer",
    );
    expect(opened.opener).toBeNull();

    const invalidOpen = vi.fn(() => opened);
    expect(openPcSolver(input({ next: [] }), invalidOpen)).toBe(false);
    expect(invalidOpen).not.toHaveBeenCalled();
  });
});

