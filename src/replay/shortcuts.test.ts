import { describe, expect, it } from "vitest";
import { replayShortcutForCode } from "./shortcuts";

describe("replay shortcuts", () => {
  it.each([
    ["KeyR", "reset"],
    ["ArrowUp", "previousPc"],
    ["ArrowLeft", "previousPiece"],
    ["ArrowRight", "nextPiece"],
    ["ArrowDown", "nextPc"],
  ] as const)("maps %s to %s", (code, action) => {
    expect(replayShortcutForCode(code)).toBe(action);
  });

  it("ignores unrelated keys", () => {
    expect(replayShortcutForCode("Space")).toBeUndefined();
  });
});
