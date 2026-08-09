export type ReplayShortcutAction = "reset" | "previousPc" | "previousPiece" | "nextPiece" | "nextPc";

const REPLAY_SHORTCUTS: Readonly<Record<string, ReplayShortcutAction>> = {
  KeyR: "reset",
  ArrowUp: "previousPc",
  ArrowLeft: "previousPiece",
  ArrowRight: "nextPiece",
  ArrowDown: "nextPc",
};

export function replayShortcutForCode(code: string): ReplayShortcutAction | undefined {
  return REPLAY_SHORTCUTS[code];
}
