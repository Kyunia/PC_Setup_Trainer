import { describe, expect, it, vi } from "vitest";
import { GameSession } from "./game";
import { createBoard } from "./board";
import { occupiedCells, spawnPiece } from "./pieces";
import type { Piece } from "./types";
import { MAX_SEED_UTF8_BYTES, seedUtf8ByteLength } from "./seed";

describe("game session practice controls", () => {
  it("accepts seeds at the UTF-8 replay boundary and rejects longer seeds without restarting", () => {
    const session = new GameSession("original-seed");
    const accepted = "😀".repeat(MAX_SEED_UTF8_BYTES / 4);
    expect(seedUtf8ByteLength(accepted)).toBe(MAX_SEED_UTF8_BYTES);
    session.setSeed(accepted);
    expect(session.state.seed).toBe(accepted);
    const before = session.state;
    expect(() => session.setSeed(`${accepted}😀`)).toThrow(`${MAX_SEED_UTF8_BYTES} UTF-8 bytes`);
    expect(session.state).toBe(before);
  });
  it("현재 미노를 보이는 필드 안에 스폰한다", () => {
    const active = spawnPiece("T");
    expect(Math.max(...occupiedCells(active).map(({ y }) => y))).toBeLessThan(20);
  });

  it("미노를 놓기 전에도 홀드를 계속 교환할 수 있다", () => {
    const session = new GameSession("unlimited-hold");
    const first = session.state.active.piece;
    const second = session.state.bag.queue[0];

    expect(session.dispatch("hold")).toBe(true);
    expect(session.state.active.piece).toBe(second);
    expect(session.state.hold).toBe(first);

    expect(session.dispatch("hold")).toBe(true);
    expect(session.state.active.piece).toBe(first);
    expect(session.state.hold).toBe(second);

    expect(session.dispatch("hold")).toBe(true);
    expect(session.state.active.piece).toBe(second);
    expect(session.state.hold).toBe(first);
  });

  it("한 칸 내리기 액션은 현재 미노를 정확히 한 칸 내린다", () => {
    const session = new GameSession("single-cell-drop");
    const beforeY = session.state.active.y;

    expect(session.dispatch("stepDown")).toBe(true);
    expect(session.state.active.y).toBe(beforeY - 1);
  });

  it("Restart 액션은 새 랜덤 시드로 게임을 재시작한다", () => {
    const session = new GameSession("old-seed");
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    expect(session.dispatch("restart")).toBe(true);
    expect(session.state.seed).not.toBe("old-seed");
    expect(session.state.run.cycle).toBe(1);
    expect(session.state.run.pcCount).toBe(0);
    vi.restoreAllMocks();
  });

  it("F4용 재시작 액션은 현재 시드를 유지한다", () => {
    const session = new GameSession("same-seed");
    session.dispatch("hardDrop");

    expect(session.dispatch("randomSeed")).toBe(true);
    expect(session.state.seed).toBe("same-seed");
    expect(session.state.run.cycle).toBe(1);
    expect(session.state.run.pcCount).toBe(0);
  });

  it("uses a finite exact queue and fixed restart state for an eight-row Snapshot session", () => {
    const base = new GameSession("snapshot-base").state;
    const queue = "IJLOSTZIJL".split("") as Piece[];
    const session = new GameSession({
      ...base, board: createBoard(8), active: spawnPiece("T", 8), hold: null,
      bag: { rngState: 0, queue }, seed: "snapshot-fixed",
    });

    expect(session.dispatch("hold")).toBe(true);
    expect(session.state.active.piece).toBe("I");
    expect(session.state.bag.queue).toEqual(queue.slice(1));
    session.dispatch("restart");
    expect(session.state.active).toEqual(spawnPiece("T", 8));
    expect(session.state.hold).toBeNull();
    expect(session.state.bag.queue).toEqual(queue);
  });

  it("does not consume a post-terminal piece in a fixed Snapshot session", () => {
    const base = new GameSession("snapshot-terminal").state;
    const board = createBoard(8);
    for (let y = 0; y < 2; y += 1) board[y] = Array.from({ length: 10 }, (_, x) => x === 4 || x === 5 ? null : "I");
    const queue = "IJLOSTZIJ".split("") as Piece[];
    const session = new GameSession({
      ...base, board, active: spawnPiece("O", 8), hold: "T", bag: { rngState: 0, queue },
      run: { ...base.run, piecesLockedSinceLastPc: 9 }, seed: "snapshot-terminal",
    });

    expect(session.dispatch("hardDrop")).toBe(true);
    expect(session.state.run.pcCount).toBe(base.run.pcCount + 1);
    expect(session.state.bag.queue).toEqual(queue);
  });
});
