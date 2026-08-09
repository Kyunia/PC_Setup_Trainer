import { describe, expect, it } from "vitest";
import { createBoard } from "../engine/board";
import { occupiedCells, sortedCellKey } from "../engine/pieces";
import { ORIENTATIONS, PIECES, type ActivePiece, type Orientation } from "../engine/types";
import { JSTRIS180_PROPERTIES } from "./jstris180Properties";
import { kickKey, parseKickProperties } from "./kickProperties";
import {
  kickCandidates,
  nextOrientation,
  tryRotate,
  tryRotateWithResult,
} from "./rotation";

const rawTable = parseKickProperties(JSTRIS180_PROPERTIES);

describe("JST180 runtime kick table", () => {
  it("모든 미노의 CW, CCW, 180 전환을 properties에서 읽어 정규화한다", () => {
    for (const piece of PIECES) {
      for (const from of ORIENTATIONS) {
        for (const direction of ["CW", "CCW", "R180"] as const) {
          const to = nextOrientation(from, direction);
          const raw = rawTable[kickKey(piece, from, to)];
          const basic = raw[0];
          expect(kickCandidates(piece, from, to), `${piece}.${from}${to}`).toEqual(
            raw.map(({ dx, dy, privilege }) => ({
              dx: dx - basic.dx,
              dy: dy - basic.dy,
              privilege,
            })),
          );
        }
      }
    }
  });

  it("Hard Drop SRS의 JLSTZ와 I 0->R kick 순서를 유지한다", () => {
    expect(kickCandidates("T", "N", "E")).toEqual([
      { dx: 0, dy: 0, privilege: false },
      { dx: -1, dy: 0, privilege: false },
      { dx: -1, dy: 1, privilege: false },
      { dx: 0, dy: -2, privilege: false },
      { dx: -1, dy: -2, privilege: true },
    ]);
    expect(kickCandidates("I", "N", "E")).toEqual([
      { dx: 0, dy: 0, privilege: false },
      { dx: -2, dy: 0, privilege: false },
      { dx: 1, dy: 0, privilege: false },
      { dx: -2, dy: -1, privilege: false },
      { dx: 1, dy: 2, privilege: false },
    ]);
  });

  it("빈 공간에서 O 회전은 겉보기 위치를 바꾸지 않는다", () => {
    const board = createBoard();
    const active: ActivePiece = { piece: "O", orientation: "N", x: 4, y: 10 };
    const rotated = tryRotate(board, active, "CW");

    expect(rotated.orientation).toBe("E");
    expect(sortedCellKey(occupiedCells(rotated))).toBe(sortedCellKey(occupiedCells(active)));
  });

  it("앞선 후보가 막히면 정의된 순서대로 다음 wall kick을 사용한다", () => {
    const board = createBoard();
    board[4][4] = "J";
    const active: ActivePiece = { piece: "T", orientation: "N", x: 4, y: 5 };

    const result = tryRotateWithResult(board, active, "CW");

    expect(result).toMatchObject({
      rotated: true,
      kickIndex: 1,
      privilege: false,
      active: { orientation: "E", x: 3, y: 5 },
    });
  });

  it("일반 후보가 모두 막힌 T 슬롯에서 마지막 특수 kick으로 spin한다", () => {
    const board = createBoard();
    board[4][4] = "J";
    board[6][3] = "L";
    const active: ActivePiece = { piece: "T", orientation: "N", x: 4, y: 5 };

    const result = tryRotateWithResult(board, active, "CW");

    expect(result).toMatchObject({
      rotated: true,
      kickIndex: 4,
      privilege: true,
      active: { orientation: "E", x: 3, y: 3 },
    });
  });

  it("모든 후보가 막히면 회전을 취소하고 원래 객체를 유지한다", () => {
    const board = createBoard();
    const active: ActivePiece = { piece: "T", orientation: "N", x: 4, y: 5 };
    for (const to of ["E"] as Orientation[]) {
      for (const { dx, dy } of kickCandidates(active.piece, active.orientation, to)) {
        for (const { x, y } of occupiedCells({ ...active, orientation: to, x: active.x + dx, y: active.y + dy })) {
          if (!occupiedCells(active).some((cell) => cell.x === x && cell.y === y)) board[y][x] = "Z";
        }
      }
    }

    const result = tryRotateWithResult(board, active, "CW");
    expect(result.rotated).toBe(false);
    expect(result.active).toBe(active);
  });
});
