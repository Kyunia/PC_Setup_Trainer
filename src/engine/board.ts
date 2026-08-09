import { BOARD_HEIGHT, BOARD_WIDTH, type ActivePiece, type Board, type BoardCell, type Cell, type Piece } from "./types";
import { occupiedCells } from "./pieces";

export function createBoard(height = BOARD_HEIGHT): Board {
  return Array.from({ length: height }, () => Array<BoardCell>(BOARD_WIDTH).fill(null));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function collides(board: Board, active: ActivePiece): boolean {
  return occupiedCells(active).some(({ x, y }) =>
    x < 0 || x >= BOARD_WIDTH || y < 0 || y >= board.length || board[y]?.[x] !== null,
  );
}

export function isLockable(board: Board, active: ActivePiece): boolean {
  return collides(board, { ...active, y: active.y - 1 });
}

export function hardDropY(board: Board, active: ActivePiece): number {
  let y = active.y;
  while (!collides(board, { ...active, y: y - 1 })) y -= 1;
  return y;
}

export function placeCells(board: Board, cells: Cell[], piece: Piece): Board {
  const next = cloneBoard(board);
  for (const { x, y } of cells) next[y][x] = piece;
  return next;
}

export function lockPiece(board: Board, active: ActivePiece): Board {
  return placeCells(board, occupiedCells(active), active.piece);
}

export function clearFullLines(board: Board): { board: Board; cleared: number } {
  const remaining = board.filter((row) => row.some((cell) => cell === null));
  const cleared = board.length - remaining.length;
  while (remaining.length < board.length) remaining.push(Array<BoardCell>(BOARD_WIDTH).fill(null));
  return { board: remaining, cleared };
}

export function isBoardEmpty(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell === null));
}

export function boardHash(board: Board): string {
  return board.map((row) => row.map((cell) => cell ?? ".").join("")).join("/");
}
