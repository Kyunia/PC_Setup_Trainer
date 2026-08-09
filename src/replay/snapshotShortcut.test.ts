import { describe, expect, it } from "vitest";
import { matchesSnapshotExitBinding } from "./snapshotShortcut";

describe("Snapshot exit shortcut", () => {
  it("matches the default Escape binding", () => {
    expect(matchesSnapshotExitBinding("Escape", { code: "Escape" })).toBe(true);
    expect(matchesSnapshotExitBinding("Escape", { code: "KeyX" })).toBe(false);
  });

  it("matches a remapped key and modifier combination", () => {
    expect(matchesSnapshotExitBinding("KeyX", { code: "KeyX" })).toBe(true);
    expect(matchesSnapshotExitBinding("Ctrl+KeyX", { code: "KeyX", ctrlKey: true })).toBe(true);
    expect(matchesSnapshotExitBinding("Ctrl+KeyX", { code: "KeyX" })).toBe(false);
  });

  it("keeps a plain binding active while another modifier is held like gameplay controls", () => {
    expect(matchesSnapshotExitBinding("Escape", { code: "Escape", shiftKey: true })).toBe(true);
  });
});
