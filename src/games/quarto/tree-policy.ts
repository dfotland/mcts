import type { PlayerId } from '../../contracts/player';
import { computeImmediateWinPieceMask, findImmediateWinCell } from './board';
import { createGiveMove, createPlaceMove, type QuartoGiveMove, type QuartoMove, type QuartoPlaceMove } from './move';
import { blendTowardDraw, pWinFromSafeFraction } from './p-win';
import { pieceIndex, type QuartoPiece } from './piece';
import { listEmptyCells } from './rules';
import type { QuartoState } from './state';

export type TreeHeuristic = 'uniform' | 'basic';

function countSafePiecesWithMask(pieces: QuartoPiece[], lethalMask: number): number {
  let safe = 0;
  for (const piece of pieces) {
    if ((lethalMask & (1 << pieceIndex(piece))) === 0) safe++;
  }
  return safe;
}

function scoreSafePieceFractionAfterPlace(
  state: QuartoState,
  row: number,
  col: number,
  staged: QuartoPiece,
  emptyAfterPlace: number,
): number {
  const board = state.board;
  board.setCell(row, col, staged);
  const lethalMask = computeImmediateWinPieceMask(board);
  board.cells[row]![col] = null;

  const maxSafe = state.availablePieces.length;
  if (maxSafe === 0) return blendTowardDraw(0.5, emptyAfterPlace);
  const safeCount = countSafePiecesWithMask(state.availablePieces, lethalMask);
  return blendTowardDraw(pWinFromSafeFraction(safeCount / maxSafe), emptyAfterPlace);
}

function scoreTreePlaceMoves(state: QuartoState, perspectivePlayer: PlayerId): QuartoPlaceMove[] {
  void perspectivePlayer;
  const moves: QuartoPlaceMove[] = [];
  if (state.stagedPiece === null) return moves;

  const staged = state.stagedPiece;
  const winCell = findImmediateWinCell(state.board, staged);
  const emptyCells = listEmptyCells(state.board);
  const emptyAfterPlace = emptyCells.length - 1;

  for (const { row, col } of emptyCells) {
    const move = createPlaceMove(state.currentPlayer, row, col);
    if (winCell !== null && winCell.row === row && winCell.col === col) {
      move.heuristicValue = 1;
    } else {
      move.heuristicValue = scoreSafePieceFractionAfterPlace(
        state,
        row,
        col,
        staged,
        emptyAfterPlace,
      );
    }
    moves.push(move);
  }

  return moves;
}

function scoreTreeGiveMoves(state: QuartoState): QuartoGiveMove[] {
  const moves: QuartoGiveMove[] = [];
  const lethalMask = computeImmediateWinPieceMask(state.board);
  const emptyCount = listEmptyCells(state.board).length;
  const safeGivePWin = blendTowardDraw(0.5, emptyCount);

  for (const piece of state.availablePieces) {
    const move = createGiveMove(state.currentPlayer, piece);
    move.heuristicValue =
      (lethalMask & (1 << pieceIndex(piece))) !== 0 ? 0 : safeGivePWin;
    moves.push(move);
  }

  return moves;
}

export function generateTreeMoves(
  state: QuartoState,
  perspectivePlayer: PlayerId,
  heuristic: TreeHeuristic,
): QuartoMove[] {
  if (state.currentPhase === 'place' && state.stagedPiece !== null) {
    if (heuristic === 'uniform') {
      const moves: QuartoMove[] = [];
      for (const { row, col } of listEmptyCells(state.board)) {
        const move = createPlaceMove(state.currentPlayer, row, col);
        move.heuristicValue = 0.5;
        moves.push(move);
      }
      return moves;
    }
    return scoreTreePlaceMoves(state, perspectivePlayer);
  }

  if (state.currentPhase === 'give') {
    if (heuristic === 'uniform') {
      const moves: QuartoMove[] = [];
      for (const piece of state.availablePieces) {
        const move = createGiveMove(state.currentPlayer, piece);
        move.heuristicValue = 0.5;
        moves.push(move);
      }
      return moves;
    }
    return scoreTreeGiveMoves(state);
  }

  return [];
}

export function stagedPieceCanWinForTree(state: QuartoState): boolean {
  if (state.stagedPiece === null) return false;
  return findImmediateWinCell(state.board, state.stagedPiece) !== null;
}

export function countSafeAvailablePiecesForTree(state: QuartoState): number {
  const lethalMask = computeImmediateWinPieceMask(state.board);
  return countSafePiecesWithMask(state.availablePieces, lethalMask);
}
