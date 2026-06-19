import type { Board } from '../../contracts/board';
import { type QuartoPiece, pieceKey } from './piece';

export const QUARTO_BOARD_SIZE = 4;

export type Cell = QuartoPiece | null;

export class QuartoBoard implements Board {
  readonly cells: Cell[][];

  constructor(cells?: Cell[][]) {
    this.cells =
      cells ??
      Array.from({ length: QUARTO_BOARD_SIZE }, () =>
        Array.from({ length: QUARTO_BOARD_SIZE }, () => null),
      );
  }

  clone(): QuartoBoard {
    return new QuartoBoard(this.cells.map((row) => [...row]));
  }

  hash(): string {
    return this.cells
      .map((row) => row.map((cell) => (cell === null ? '.' : pieceKey(cell))).join(','))
      .join('/');
  }

  get(row: number, col: number): Cell {
    return this.cells[row]![col]!;
  }

  setCell(row: number, col: number, piece: QuartoPiece): void {
    this.cells[row]![col] = piece;
  }

  withCell(row: number, col: number, piece: QuartoPiece): QuartoBoard {
    const next = this.clone();
    next.setCell(row, col, piece);
    return next;
  }
}

function checkLine(pieces: QuartoPiece[]): boolean {
  if (pieces.length !== QUARTO_BOARD_SIZE) return false;

  const sameHeight = pieces.every((p) => p.height === pieces[0]!.height);
  const sameColor = pieces.every((p) => p.color === pieces[0]!.color);
  const sameShape = pieces.every((p) => p.shape === pieces[0]!.shape);
  const sameTop = pieces.every((p) => p.top === pieces[0]!.top);

  return sameHeight || sameColor || sameShape || sameTop;
}

function collectLine(board: QuartoBoard, positions: [number, number][]): QuartoPiece[] {
  const pieces: QuartoPiece[] = [];
  for (const [row, col] of positions) {
    const piece = board.get(row, col);
    if (piece !== null) pieces.push(piece);
  }
  return pieces;
}

function buildLinesThroughForCell(row: number, col: number): [number, number][][] {
  const lines: [number, number][][] = [
    Array.from({ length: QUARTO_BOARD_SIZE }, (_, c) => [row, c] as [number, number]),
    Array.from({ length: QUARTO_BOARD_SIZE }, (_, r) => [r, col] as [number, number]),
  ];

  if (row === col) {
    lines.push(Array.from({ length: QUARTO_BOARD_SIZE }, (_, i) => [i, i] as [number, number]));
  }

  if (row + col === QUARTO_BOARD_SIZE - 1) {
    lines.push(
      Array.from({ length: QUARTO_BOARD_SIZE }, (_, i) =>
        [i, QUARTO_BOARD_SIZE - 1 - i] as [number, number],
      ),
    );
  }

  return lines;
}

const LINES_THROUGH: [number, number][][][][] = Array.from(
  { length: QUARTO_BOARD_SIZE },
  (_, row) =>
    Array.from({ length: QUARTO_BOARD_SIZE }, (_, col) => buildLinesThroughForCell(row, col)),
);

function linePiecesWithPlacement(
  board: QuartoBoard,
  row: number,
  col: number,
  piece: QuartoPiece,
  positions: [number, number][],
): QuartoPiece[] | null {
  const pieces: QuartoPiece[] = [];

  for (const [r, c] of positions) {
    if (r === row && c === col) {
      pieces.push(piece);
      continue;
    }

    const cell = board.get(r, c);
    if (cell === null) return null;
    pieces.push(cell);
  }

  return pieces;
}

/** Read-only: would placing `piece` at (`row`, `col`) complete a Quarto line? */
export function wouldCompleteLine(
  board: QuartoBoard,
  piece: QuartoPiece,
  row: number,
  col: number,
): boolean {
  if (board.get(row, col) !== null) return false;

  for (const positions of LINES_THROUGH[row]![col]!) {
    const pieces = linePiecesWithPlacement(board, row, col, piece, positions);
    if (pieces !== null && pieces.length === QUARTO_BOARD_SIZE && checkLine(pieces)) {
      return true;
    }
  }

  return false;
}

/** Read-only: can an opponent win immediately by placing `piece` on an empty cell? */
export function opponentCanWinWithPiece(board: QuartoBoard, piece: QuartoPiece): boolean {
  for (let row = 0; row < QUARTO_BOARD_SIZE; row++) {
    for (let col = 0; col < QUARTO_BOARD_SIZE; col++) {
      if (board.get(row, col) !== null) continue;
      if (wouldCompleteLine(board, piece, row, col)) return true;
    }
  }

  return false;
}

export function hasWinningLine(board: QuartoBoard): boolean {
  return findWinningLine(board) !== null;
}

export function findWinningLine(board: QuartoBoard): [number, number][] | null {
  for (let row = 0; row < QUARTO_BOARD_SIZE; row++) {
    const positions: [number, number][] = Array.from({ length: QUARTO_BOARD_SIZE }, (_, col) => [
      row,
      col,
    ]);
    const pieces = collectLine(board, positions);
    if (pieces.length === QUARTO_BOARD_SIZE && checkLine(pieces)) return positions;
  }

  for (let col = 0; col < QUARTO_BOARD_SIZE; col++) {
    const positions: [number, number][] = Array.from({ length: QUARTO_BOARD_SIZE }, (_, row) => [
      row,
      col,
    ]);
    const pieces = collectLine(board, positions);
    if (pieces.length === QUARTO_BOARD_SIZE && checkLine(pieces)) return positions;
  }

  const mainDiagonal: [number, number][] = Array.from({ length: QUARTO_BOARD_SIZE }, (_, i) => [
    i,
    i,
  ]);
  const mainPieces = collectLine(board, mainDiagonal);
  if (mainPieces.length === QUARTO_BOARD_SIZE && checkLine(mainPieces)) return mainDiagonal;

  const antiDiagonal: [number, number][] = Array.from({ length: QUARTO_BOARD_SIZE }, (_, i) => [
    i,
    QUARTO_BOARD_SIZE - 1 - i,
  ]);
  const antiPieces = collectLine(board, antiDiagonal);
  if (antiPieces.length === QUARTO_BOARD_SIZE && checkLine(antiPieces)) return antiDiagonal;

  return null;
}

export function isBoardFull(board: QuartoBoard): boolean {
  return board.cells.every((row) => row.every((cell) => cell !== null));
}
