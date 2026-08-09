import { describe, expect, it } from "vitest";
import { recommendationSetupLabel } from "./recommendationLabel";

describe("recommendation setup labels", () => {
  it.each([
    ["OI-LZ (⇔ OI-JS) Form 1", "OI-LZ"],
    ["Box + Hill 5P (Mirrorable)", "Box + Hill 5P"],
    ["Legs + I 5P (Mirrorable)", "Legs + I 5P"],
    ["SZ-ILZ 4P (Hold S, Mirrorable)", "SZ-ILZ 4P"],
    ["Braindead 7P (Form 1 Mirror)", "Braindead 7P"],
    ["Beginner 5P Setup Form 2", "Beginner 5P Setup"],
    ["T + OIL (Form 3)", "T + OIL"],
    ["LJ-OI Form 2 (99.84%)", "LJ-OI (99.84%)"],
  ])("분류용 표기를 숨긴다: %s", (source, expected) => {
    expect(recommendationSetupLabel(source)).toBe(expected);
  });

  it.each([
    "PCO + Heart (TIJZ)",
    "4x4 Box (OILJ)",
    "ELEPHANT [Left Side]",
  ])("셋업 식별에 필요한 이름은 유지한다: %s", (name) => {
    expect(recommendationSetupLabel(name)).toBe(name);
  });

  it("QB 최종 세이브 미노를 정렬·중복 제거해 이름 뒤에 표시한다", () => {
    expect(recommendationSetupLabel("TOSZ TL QB", ["O"])).toBe("TOSZ TL QB (save O)");
    expect(recommendationSetupLabel("OILZ TIJ QB", ["O", "L", "O"])).toBe("OILZ TIJ QB (save O/L)");
  });

  it("셋업 이름의 미노 토큰을 TOILJSZ 순서로 표시한다", () => {
    expect(recommendationSetupLabel("PCO + Heart (ITOL)"))
      .toBe("PCO + Heart (TOIL)");
    expect(recommendationSetupLabel("OSZ JLS/JLZ QB"))
      .toBe("OSZ LJS/LJZ QB");
  });
});
