import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import type { SetupVariant } from "./schema";
import { findBuildPlan, findBuildPlanCooperative } from "./reachability";

const holdOnlySetup: SetupVariant = {
  id: "unlimited-hold-fixture",
  cycle: 1,
  family: "unlimited-hold-fixture",
  displayName: "Unlimited HOLD fixture",
  pieceSignature: ["O"],
  placements: [{
    id: "unlimited-hold-fixture-o",
    piece: "O",
    cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  }],
  difficulty: 1,
  reviewStatus: "reviewed",
};

describe("recommendation build-plan HOLD semantics", () => {
  it("permits HOLD even when the legacy per-turn flag is false", () => {
    const plan = findBuildPlan(holdOnlySetup, createBoard(), "T", "O", [], false);
    expect(plan).toMatchObject({
      holds: 1,
      steps: [
        { action: "hold", piece: "T" },
        { action: "place", piece: "O", placementId: "unlimited-hold-fixture-o" },
      ],
    });
  });

  it("keeps cooperative and synchronous unlimited-HOLD searches identical", async () => {
    const synchronous = findBuildPlan(holdOnlySetup, createBoard(), "T", "O", [], false);
    const cooperative = await findBuildPlanCooperative(
      holdOnlySetup,
      createBoard(),
      "T",
      "O",
      [],
      false,
      0,
      new Map(),
      { onNode() {} },
    );
    expect(cooperative).toEqual(synchronous);
  });
});
