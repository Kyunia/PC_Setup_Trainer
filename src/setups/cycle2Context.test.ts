import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import type { Piece } from "../engine/types";
import { cycle2QueueContext, fitsCycle2BuildPool } from "./cycle2Context";
import { setupCatalog, setupPolicyForCycle, sourceSetupCatalog } from "./catalog";
import { findBuildPlan } from "./reachability";

describe("2회차 큐 경계", () => {
  it("HOLD + ACTIVE + NEXT 2와 다음 가방 첫 3개를 분리한다", () => {
    const context = cycle2QueueContext({
      cycle: 2,
      board: createBoard(),
      hold: "T",
      active: "I",
      next: ["S", "Z", "L", "O", "J"],
    });
    expect(context).toEqual({
      buildPieces: ["T", "I", "S", "Z"],
      searchNext: ["S", "Z", "L", "O", "J"],
      placeableNextCount: 2,
      policyPrefix: ["L", "O", "J"],
    });
  });

  it("HOLD가 비면 ACTIVE + NEXT 3으로 구축하되 숨은 정책 미노를 사용하지 않는다", () => {
    const context = cycle2QueueContext({
      cycle: 2,
      board: createBoard(),
      hold: null,
      active: "I",
      next: ["S", "Z", "T", "L", "O"],
    });
    expect(context).toEqual({
      buildPieces: ["I", "S", "Z", "T"],
      searchNext: ["S", "Z", "T", "L", "O"],
      placeableNextCount: 3,
    });
  });

  it("4P는 정확히 네 미노, 3P는 그 부분집합일 때만 통과한다", () => {
    const fourPiece = sourceSetupCatalog.find(({ cycle, placements }) => cycle === 2 && placements.length === 4)!;
    const loz = sourceSetupCatalog.find(({ id }) => id === "pcinfokorea-c2-020")!;
    const osz = sourceSetupCatalog.find(({ id }) => id === "pcinfokorea-c2-037-f0")!;
    const mirroredLoz = setupCatalog.find(({ id }) => id === "pcinfokorea-c2-020--mirror")!;
    const policy = setupPolicyForCycle(2);
    expect(fitsCycle2BuildPool(fourPiece, [...fourPiece.pieceSignature])).toBe(true);
    expect(fitsCycle2BuildPool(fourPiece, [...fourPiece.pieceSignature.slice(0, 3), "Z"])).toBe(false);
    const pool = (pieces: string) => [...pieces] as Piece[];
    expect(fitsCycle2BuildPool(loz, pool("TLOZ"), policy)).toBe(true);
    expect(fitsCycle2BuildPool(loz, pool("ILOZ"), policy)).toBe(false);
    expect(fitsCycle2BuildPool(osz, pool("IOSZ"), policy)).toBe(true);
    expect(fitsCycle2BuildPool(osz, pool("LOSZ"), policy)).toBe(false);
    expect(fitsCycle2BuildPool(mirroredLoz, pool("TJOS"), policy)).toBe(true);
    expect(fitsCycle2BuildPool(mirroredLoz, pool("TLOZ"), policy)).toBe(false);
  });

  it("다음 가방 버퍼 미노는 스폰·홀드할 수 있지만 setup에 놓을 수 없다", () => {
    const setup = sourceSetupCatalog.find(({ id }) => id === "pcinfokorea-c2-022")!;
    const plan = findBuildPlan(
      setup,
      createBoard(),
      "I",
      "S",
      ["T", "J", "Z"],
      true,
      1,
    );
    expect(plan).toBeNull();
  });
});
