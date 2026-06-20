import type { Writable } from '../../contracts/writable';
import { wouldCompleteLine, QuartoBoard, QUARTO_BOARD_SIZE } from './board';
import type { QuartoGiveMove, QuartoPlaceMove } from './move';
import { pieceAtIndex, QUARTO_PIECE_COUNT, type QuartoPiece, piecesEqual } from './piece';
import { opponent, type QuartoState } from './state';

export type EmptyCell = { row: number; col: number };

export type RolloutScratch = Writable<QuartoState> & {
  _rolloutEmptyCells?: EmptyCell[];
  /** Bit `i` set iff piece index `i` lets the opponent win on some empty cell. */
  _rolloutLethalGiveMask?: number;
  _rolloutTerminal?: boolean;
};

export function buildEmptyCells(board: QuartoBoard): EmptyCell[] {
  const cells: EmptyCell[] = [];
  for (let row = 0; row < QUARTO_BOARD_SIZE; row++) {
    for (let col = 0; col < QUARTO_BOARD_SIZE; col++) {
      if (board.get(row, col) === null) cells.push({ row, col });
    }
  }
  return cells;
}

export function listEmptyCells(board: QuartoBoard): EmptyCell[] {
  return buildEmptyCells(board);
}

export function rolloutEmptyCells(state: QuartoState): EmptyCell[] {
  return (state as RolloutScratch)._rolloutEmptyCells!;
}

export function rolloutLethalGiveMask(state: QuartoState): number {
  return (state as RolloutScratch)._rolloutLethalGiveMask ?? 0;
}

function isPieceLethalOnEmptyCells(
  board: QuartoBoard,
  piece: QuartoPiece,
  emptyCells: ReadonlyArray<EmptyCell>,
  skip?: EmptyCell,
): boolean {
  for (const { row, col } of emptyCells) {
    if (skip !== undefined && row === skip.row && col === skip.col) continue;
    if (wouldCompleteLine(board, piece, row, col)) return true;
  }
  return false;
}

function computeLethalGiveMask(board: QuartoBoard, emptyCells: EmptyCell[]): number {
  let mask = 0;
  for (let index = 0; index < QUARTO_PIECE_COUNT; index++) {
    if (isPieceLethalOnEmptyCells(board, pieceAtIndex(index), emptyCells)) {
      mask |= 1 << index;
    }
  }
  return mask;
}

function updateLethalGiveMaskAfterPlace(scratch: RolloutScratch, placedRow: number, placedCol: number): void {
  let mask = scratch._rolloutLethalGiveMask ?? 0;
  if (mask === 0) return;

  const emptyCells = scratch._rolloutEmptyCells!;
  const skip = { row: placedRow, col: placedCol };

  for (let index = 0; index < QUARTO_PIECE_COUNT; index++) {
    const bit = 1 << index;
    if ((mask & bit) === 0) continue;

    const piece = pieceAtIndex(index);
    if (!wouldCompleteLine(scratch.board, piece, placedRow, placedCol)) continue;

    if (!isPieceLethalOnEmptyCells(scratch.board, piece, emptyCells, skip)) {
      mask &= ~bit;
    }
  }

  scratch._rolloutLethalGiveMask = mask;
}

function removeEmptyCell(cells: EmptyCell[], row: number, col: number): void {
  const index = cells.findIndex((cell) => cell.row === row && cell.col === col);
  if (index !== -1) cells.splice(index, 1);
}

export function initRolloutScratch(state: QuartoState): void {
  const scratch = state as RolloutScratch;
  const emptyCells = buildEmptyCells(state.board);
  scratch._rolloutEmptyCells = emptyCells;
  scratch._rolloutLethalGiveMask = computeLethalGiveMask(state.board, emptyCells);
  scratch._rolloutTerminal = false;
}

export function isRolloutScratchTerminal(state: QuartoState): boolean {
  const scratch = state as RolloutScratch;
  if (scratch._rolloutTerminal === true) return true;
  return scratch._rolloutEmptyCells!.length === 0;
}

export function applyPlaceMoveInPlace(state: QuartoState, move: QuartoPlaceMove): void {
  if (state.stagedPiece === null) {
    throw new Error('Cannot place without a staged piece');
  }
  if (state.board.get(move.row, move.col) !== null) {
    throw new Error(`Cell (${move.row},${move.col}) is occupied`);
  }

  const writable = state as RolloutScratch;
  const wins = wouldCompleteLine(state.board, state.stagedPiece, move.row, move.col);
  if (writable._rolloutEmptyCells !== undefined) {
    updateLethalGiveMaskAfterPlace(writable, move.row, move.col);
    removeEmptyCell(writable._rolloutEmptyCells, move.row, move.col);
  }
  state.board.setCell(move.row, move.col, state.stagedPiece);
  writable.stagedPiece = null;
  writable.currentPhase = 'give';
  if (writable._rolloutEmptyCells !== undefined) {
    if (wins || writable._rolloutEmptyCells.length === 0) {
      writable._rolloutTerminal = true;
    }
  }
}

export function applyGiveMoveInPlace(state: QuartoState, move: QuartoGiveMove): void {
  const pieceIndex = state.availablePieces.findIndex((p) => piecesEqual(p, move.piece));
  if (pieceIndex === -1) {
    throw new Error('Piece to give is not available');
  }

  const writable = state as Writable<QuartoState>;
  const piece = state.availablePieces[pieceIndex]!;
  writable.availablePieces.splice(pieceIndex, 1);
  writable.stagedPiece = piece;
  writable.currentPlayer = opponent(state.currentPlayer);
  writable.currentPhase = 'place';
}

export function applyPlaceMove(state: QuartoState, move: QuartoPlaceMove): QuartoState {
  const next = state.clone() as QuartoState;
  applyPlaceMoveInPlace(next, move);
  return next;
}

export function applyGiveMove(state: QuartoState, move: QuartoGiveMove): QuartoState {
  const next = state.clone() as QuartoState;
  applyGiveMoveInPlace(next, move);
  return next;
}
