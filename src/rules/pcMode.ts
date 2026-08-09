import type { Board, Cycle, RunState } from "../engine/types";

export const PC_MODE_MAX_STACK_HEIGHT = 4;

export function advanceCycle(cycle: Cycle, pcLines: 2 | 4): Cycle {
  const step = pcLines === 4 ? 1 : 4;
  return ((((cycle - 1) + step) % 7) + 1) as Cycle;
}

/**
 * True when the post-clear board occupies row 5 or above (0-based y >= 4).
 * A playing PCMODE position is therefore always confined to rows 1-4.
 */
export function exceedsPcModeStackHeight(board: Board): boolean {
  return board.slice(PC_MODE_MAX_STACK_HEIGHT).some((row) => row.some((cell) => cell !== null));
}

export interface PcModeLockResolution {
  run: RunState;
  perfectClear: boolean;
}

/**
 * Authoritative PCMODE post-lock semantics shared by live play and replay import.
 * `boardAfterClear` must be the board after locking and line clear.
 */
export function resolvePcModeLock(
  runBefore: RunState,
  boardAfterClear: Board,
  clearedLines: number,
): PcModeLockResolution {
  const piecesLocked = runBefore.piecesLockedSinceLastPc + 1;
  const lines = runBefore.linesSinceLastPc + clearedLines;
  let run: RunState = {
    ...runBefore,
    piecesLockedSinceLastPc: piecesLocked,
    linesSinceLastPc: lines,
    message: clearedLines ? `${clearedLines} line(s) cleared` : runBefore.message,
  };

  const boardEmpty = boardAfterClear.every((row) => row.every((cell) => cell === null));
  if (boardEmpty && (lines === 2 || lines === 4)) {
    const nextCycle = advanceCycle(run.cycle, lines);
    run = {
      ...run,
      cycle: nextCycle,
      pcCount: run.pcCount + 1,
      piecesLockedSinceLastPc: 0,
      linesSinceLastPc: 0,
      message: `${lines}-line Perfect Clear! Moving to Cycle ${nextCycle}.`,
    };
    return { run, perfectClear: true };
  }

  // Height failure is checked after line clear. This lets a lock that reaches row 5+
  // survive when that same lock clears the offending rows into a valid PC field.
  if (exceedsPcModeStackHeight(boardAfterClear)) {
    return {
      run: {
        ...run,
        status: "failed",
        message: `Stack exceeded the ${PC_MODE_MAX_STACK_HEIGHT}-row PC field.`,
      },
      perfectClear: false,
    };
  }

  if (!boardEmpty && piecesLocked >= 10) {
    return {
      run: {
        ...run,
        status: "failed",
        message: "Failed to achieve Perfect Clear within 10 minos.",
      },
      perfectClear: false,
    };
  }

  return { run, perfectClear: false };
}
