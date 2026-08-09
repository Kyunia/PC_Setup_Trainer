import { describe, expect, it } from "vitest";
import {
  formatPieceSetForDisplay,
  normalizePieceNotationForDisplay,
  sortPiecesForDisplay,
} from "./pieceDisplay";

describe("piece display order", () => {
  it("formats unordered mino sets as TOILJSZ without mutating the source", () => {
    const source = ["I", "T", "O", "L", "Z", "S", "J"] as const;
    expect(formatPieceSetForDisplay(source)).toBe("TOILJSZ");
    expect(sortPiecesForDisplay(source)).toEqual(["T", "O", "I", "L", "J", "S", "Z"]);
    expect(source).toEqual(["I", "T", "O", "L", "Z", "S", "J"]);
  });

  it("preserves duplicates and supports display separators", () => {
    expect(formatPieceSetForDisplay(["Z", "T", "O", "T"], "/")).toBe("T/T/O/Z");
  });

  it("normalizes piece tokens in labels without touching ordinary words", () => {
    expect(normalizePieceNotationForDisplay("PCO + Heart (ITOL / JLS)"))
      .toBe("PCO + Heart (TOIL / LJS)");
    expect(normalizePieceNotationForDisplay("HILLS + CLIFF"))
      .toBe("HILLS + CLIFF");
  });
});
