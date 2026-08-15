import type { Board } from '../../contracts/board';
import { type QuartoPiece, pieceIndex, pieceKey } from './piece';

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

/** All 10 Quarto lines (4 rows, 4 columns, 2 diagonals). */
const ALL_LINES: [number, number][][] = (() => {
  const lines: [number, number][][] = [];
  for (let row = 0; row < QUARTO_BOARD_SIZE; row++) {
    lines.push(Array.from({ length: QUARTO_BOARD_SIZE }, (_, col) => [row, col] as [number, number]));
  }
  for (let col = 0; col < QUARTO_BOARD_SIZE; col++) {
    lines.push(Array.from({ length: QUARTO_BOARD_SIZE }, (_, row) => [row, col] as [number, number]));
  }
  lines.push(Array.from({ length: QUARTO_BOARD_SIZE }, (_, i) => [i, i] as [number, number]));
  lines.push(
    Array.from(
      { length: QUARTO_BOARD_SIZE },
      (_, i) => [i, QUARTO_BOARD_SIZE - 1 - i] as [number, number],
    ),
  );
  return lines;
})();

/** True iff four piece indices share at least one attribute bit (height/color/shape/top). */
function indicesShareAttribute(a: number, b: number, c: number, d: number): boolean {
  const diff = (a ^ b) | (b ^ c) | (c ^ d);
  return (diff & 8) === 0 || (diff & 4) === 0 || (diff & 2) === 0 || (diff & 1) === 0;
}

/**
 * Read-only, allocation-free: would placing `pieceIndex` at (`placeRow`, `placeCol`)
 * complete any line through that cell?
 */
function lineWinsWithPlacement(
  board: QuartoBoard,
  placedIndex: number,
  placeRow: number,
  placeCol: number,
  positions: [number, number][],
): boolean {
  let a = -1;
  let b = -1;
  let c = -1;
  let d = -1;
  let n = 0;

  for (let i = 0; i < positions.length; i++) {
    const [r, cPos] = positions[i]!;
    let index: number;
    if (r === placeRow && cPos === placeCol) {
      index = placedIndex;
    } else {
      const cell = board.get(r, cPos);
      if (cell === null) return false;
      index = pieceIndex(cell);
    }

    if (n === 0) a = index;
    else if (n === 1) b = index;
    else if (n === 2) c = index;
    else d = index;
    n++;
  }

  return n === QUARTO_BOARD_SIZE && indicesShareAttribute(a, b, c, d);
}

/**
 * Bit `i` set iff placing piece index `i` on some empty cell wins immediately.
 * Scans only almost-full lines (exactly one empty cell) — no piece×cell brute force.
 */
export function computeImmediateWinPieceMask(board: QuartoBoard): number {
  let mask = 0;

  for (let lineIndex = 0; lineIndex < ALL_LINES.length; lineIndex++) {
    const positions = ALL_LINES[lineIndex]!;
    let emptyCount = 0;
    let filled = 0;
    let i0 = -1;
    let i1 = -1;
    let i2 = -1;

    for (let p = 0; p < positions.length; p++) {
      const [row, col] = positions[p]!;
      const cell = board.get(row, col);
      if (cell === null) {
        emptyCount++;
        if (emptyCount > 1) break;
        continue;
      }
      const index = pieceIndex(cell);
      if (filled === 0) i0 = index;
      else if (filled === 1) i1 = index;
      else i2 = index;
      filled++;
    }

    if (emptyCount !== 1 || filled !== 3) continue;

    // Attributes on which the three occupied pieces already agree constrain the closer.
    let requiredBits = 0;
    let requiredValue = 0;
    for (let bit = 1; bit <= 8; bit <<= 1) {
      if (((i0 ^ i1) & bit) === 0 && ((i1 ^ i2) & bit) === 0) {
        requiredBits |= bit;
        requiredValue |= i0 & bit;
      }
    }
    if (requiredBits === 0) continue;

    for (let index = 0; index < 16; index++) {
      if ((index & requiredBits) === requiredValue) {
        mask |= 1 << index;
      }
    }
  }

  return mask;
}

let wouldCompleteLineProfilingEnabled = false;
let wouldCompleteLineProfileMs = 0;
let wouldCompleteLineProfileCalls = 0;

export function resetWouldCompleteLineProfile(): void {
  wouldCompleteLineProfileMs = 0;
  wouldCompleteLineProfileCalls = 0;
}

export function setWouldCompleteLineProfiling(enabled: boolean): void {
  wouldCompleteLineProfilingEnabled = enabled;
  if (enabled) resetWouldCompleteLineProfile();
}

export function getWouldCompleteLineProfile(): { ms: number; calls: number } {
  return { ms: wouldCompleteLineProfileMs, calls: wouldCompleteLineProfileCalls };
}

function wouldCompleteLineCore(
  board: QuartoBoard,
  piece: QuartoPiece,
  row: number,
  col: number,
): boolean {
  if (board.get(row, col) !== null) return false;

  const placedIndex = pieceIndex(piece);
  for (const positions of LINES_THROUGH[row]![col]!) {
    if (lineWinsWithPlacement(board, placedIndex, row, col, positions)) {
      return true;
    }
  }

  return false;
}

/** Read-only: would placing `piece` at (`row`, `col`) complete a Quarto line? */
export function wouldCompleteLine(
  board: QuartoBoard,
  piece: QuartoPiece,
  row: number,
  col: number,
): boolean {
  if (!wouldCompleteLineProfilingEnabled) {
    return wouldCompleteLineCore(board, piece, row, col);
  }

  const start = performance.now();
  try {
    return wouldCompleteLineCore(board, piece, row, col);
  } finally {
    wouldCompleteLineProfileMs += performance.now() - start;
    wouldCompleteLineProfileCalls++;
  }
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

/** Same as `opponentCanWinWithPiece`, but only checks the supplied empty cells. */
export function opponentCanWinWithPieceOnEmptyCells(
  board: QuartoBoard,
  piece: QuartoPiece,
  emptyCells: ReadonlyArray<{ row: number; col: number }>,
): boolean {
  for (const { row, col } of emptyCells) {
    if (wouldCompleteLine(board, piece, row, col)) return true;
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
