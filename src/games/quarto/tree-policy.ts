import type { PlayerId } from '../../contracts/player';
import { opponentCanWinWithPiece, wouldCompleteLine } from './board';
import { createGiveMove, createPlaceMove, type QuartoGiveMove, type QuartoMove, type QuartoPlaceMove } from './move';
import type { QuartoPiece } from './piece';
import { listEmptyCells } from './rules';
import type { QuartoState } from './state';

export type TreeHeuristic = 'uniform' | 'basic';

function countSafePiecesForTree(board: QuartoState['board'], pieces: QuartoPiece[]): number {
  return pieces.filter((piece) => !opponentCanWinWithPiece(board, piece)).length;
}

function scoreTreePlaceMove(
  state: QuartoState,
  move: QuartoPlaceMove,
  perspectivePlayer: PlayerId,
): number {
  if (state.stagedPiece === null) return 0;

  if (wouldCompleteLine(state.board, state.stagedPiece, move.row, move.col)) return 1;

  const testBoard = state.board.withCell(move.row, move.col, state.stagedPiece);
  const safeCount = countSafePiecesForTree(testBoard, state.availablePieces);
  const maxSafe = state.availablePieces.length;
  const normalized = maxSafe === 0 ? 0.5 : safeCount / maxSafe;

  void perspectivePlayer;
  return 0.4 + normalized * 0.5;
}

function scoreTreeGiveMove(state: QuartoState, move: QuartoGiveMove): number {
  if (opponentCanWinWithPiece(state.board, move.piece)) return 0.05;
  return 0.85;
}

export function generateTreeMoves(
  state: QuartoState,
  perspectivePlayer: PlayerId,
  heuristic: TreeHeuristic,
): QuartoMove[] {
  const moves: QuartoMove[] = [];

  if (state.currentPhase === 'place' && state.stagedPiece !== null) {
    for (const { row, col } of listEmptyCells(state.board)) {
      const move = createPlaceMove(state.currentPlayer, row, col);
      move.heuristicValue =
        heuristic === 'uniform' ? 0.5 : scoreTreePlaceMove(state, move, perspectivePlayer);
      moves.push(move);
    }
    return moves;
  }

  if (state.currentPhase === 'give') {
    for (const piece of state.availablePieces) {
      const move = createGiveMove(state.currentPlayer, piece);
      move.heuristicValue = heuristic === 'uniform' ? 0.5 : scoreTreeGiveMove(state, move);
      moves.push(move);
    }
  }

  return moves;
}

export function stagedPieceCanWinForTree(state: QuartoState): boolean {
  if (state.stagedPiece === null) return false;
  return opponentCanWinWithPiece(state.board, state.stagedPiece);
}

export function countSafeAvailablePiecesForTree(state: QuartoState): number {
  return countSafePiecesForTree(state.board, state.availablePieces);
}
