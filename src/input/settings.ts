import type { GameAction } from "../engine/types";

export const GAME_INPUT_ACTIONS = [
  "moveLeft", "moveRight", "stepDown", "softDrop", "hardDrop",
  "rotateCW", "rotateCCW", "rotate180", "hold", "undo", "restart", "randomSeed",
] as const satisfies readonly GameAction[];

export const UI_INPUT_ACTIONS = ["exitSnapshot", "seeSolve"] as const;
export type UiInputAction = (typeof UI_INPUT_ACTIONS)[number];
export type InputAction = GameAction | UiInputAction;
export const INPUT_ACTIONS: readonly InputAction[] = [...GAME_INPUT_ACTIONS, ...UI_INPUT_ACTIONS];

export interface InputSettings {
  bindings: Record<InputAction, string>;
  das: number;
  arr: number;
  sdf: number;
}

export interface BindingModifiers {
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

export const INPUT_LIMITS = {
  das: { min: 0, max: 500 },
  arr: { min: 0, max: 200 },
  sdf: { min: 1, max: 200 },
} as const;

export const ACTION_LABELS: Record<InputAction, string> = {
  moveLeft: "Left",
  moveRight: "Right",
  stepDown: "Step Down",
  softDrop: "Soft Drop",
  hardDrop: "Hard Drop",
  rotateCW: "Rotate CW",
  rotateCCW: "Rotate CCW",
  rotate180: "180°",
  hold: "Hold",
  undo: "Undo",
  restart: "Restart (New Seed)",
  randomSeed: "Restart (Same Seed)",
  exitSnapshot: "Exit Snapshot",
  seeSolve: "See Solve",
};

export const DEFAULT_SETTINGS: InputSettings = {
  bindings: {
    moveLeft: "ArrowLeft",
    moveRight: "ArrowRight",
    stepDown: "KeyS",
    softDrop: "ArrowDown",
    hardDrop: "Space",
    rotateCW: "ArrowUp",
    rotateCCW: "KeyZ",
    rotate180: "KeyA",
    hold: "KeyC",
    undo: "Ctrl+KeyZ",
    restart: "KeyR",
    randomSeed: "F4",
    exitSnapshot: "Escape",
    seeSolve: "KeyV",
  },
  das: 100,
  arr: 16,
  sdf: 30,
};

const STORAGE_KEY = "guided-pc-input-v2";
const LEGACY_STORAGE_KEY = "guided-pc-input-v1";

export function loadInputSettings(): InputSettings {
  try {
    const currentValue = localStorage.getItem(STORAGE_KEY);
    const value = currentValue ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!value) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(value) as Partial<InputSettings>;
    const legacyBindings = { ...parsed.bindings };
    if (!currentValue && legacyBindings.undo === "KeyU") legacyBindings.undo = DEFAULT_SETTINGS.bindings.undo;
    return normalizeInputSettings({
      bindings: { ...DEFAULT_SETTINGS.bindings, ...legacyBindings },
      das: Number(parsed.das),
      arr: Number(parsed.arr),
      sdf: Number(parsed.sdf),
    });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveInputSettings(settings: InputSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeInputSettings(settings)));
  } catch {
    // Input remains usable in memory when storage is blocked or full.
  }
}

export function isModifierCode(code: string): boolean {
  return ["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"].includes(code);
}

export function createBinding(code: string, modifiers: BindingModifiers = {}): string {
  if (isModifierCode(code)) return code;
  const parts: string[] = [];
  if (modifiers.ctrlKey) parts.push("Ctrl");
  if (modifiers.altKey) parts.push("Alt");
  if (modifiers.shiftKey) parts.push("Shift");
  if (modifiers.metaKey) parts.push("Meta");
  parts.push(code);
  return parts.join("+");
}

export function displayCode(code: string): string {
  if (code.includes("+")) return code.split("+").map((part) => displayCode(part)).join(" + ");
  const names: Record<string, string> = {
    Ctrl: "Ctrl",
    Alt: "Alt",
    Shift: "Shift",
    Meta: "Meta",
    ArrowLeft: "← Left",
    ArrowRight: "→ Right",
    ArrowDown: "↓ Down",
    ArrowUp: "↑ Up",
    Space: "Space",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
    Backspace: "Backspace",
    Enter: "Enter",
    Escape: "Esc",
  };
  return names[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeInputSettings(settings: InputSettings): InputSettings {
  return {
    bindings: { ...DEFAULT_SETTINGS.bindings, ...settings.bindings },
    das: clamp(settings.das, INPUT_LIMITS.das.min, INPUT_LIMITS.das.max, DEFAULT_SETTINGS.das),
    arr: clamp(settings.arr, INPUT_LIMITS.arr.min, INPUT_LIMITS.arr.max, DEFAULT_SETTINGS.arr),
    sdf: clamp(settings.sdf, INPUT_LIMITS.sdf.min, INPUT_LIMITS.sdf.max, DEFAULT_SETTINGS.sdf),
  };
}
