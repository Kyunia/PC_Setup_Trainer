import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import { queryCatalog, queryCatalogCooperative, type SetupQuery } from "./query";
import { validateSetup, type SetupVariant } from "./schema";

function projectedGeometry(geometryKind?: "solution-shadow"): SetupVariant {
  return {
    id: geometryKind ? "solution-shadow" : "ordinary-malformed",
    cycle: 5,
    family: "test",
    displayName: "Projected Z",
    geometryKind,
    pieceSignature: ["Z"],
    placements: [{
      id: "z-projection",
      piece: "Z",
      cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 5, y: 3 }],
    }],
    ...(geometryKind ? { fumen: "v115@projected" } : {}),
    difficulty: 3,
    reviewStatus: "reviewed",
  };
}

const query: SetupQuery = {
  cycle: 5,
  board: createBoard(),
  active: "Z",
  hold: null,
  next: ["I", "O", "T", "L", "J"],
};

describe("solution-shadow setup schema", () => {
  it("allows explicit projected visual cells but keeps ordinary tetromino validation strict", () => {
    expect(validateSetup(projectedGeometry("solution-shadow"))).toEqual([]);
    expect(validateSetup(projectedGeometry())).toContain("z-projection: 미노 형태와 cell이 일치하지 않습니다.");
  });

  it("never submits solution shadows to synchronous or cooperative initial search", async () => {
    const shadow = projectedGeometry("solution-shadow");
    let visitedNodes = 0;

    expect(queryCatalog([shadow], query)).toEqual([]);
    expect(await queryCatalogCooperative([shadow], query, {
      onNode() { visitedNodes += 1; },
    })).toEqual([]);
    expect(visitedNodes).toBe(0);
  });
});
