import type { SearchFunctions } from '../../contracts/search-functions';
import type { PlayerId } from '../../contracts/player';
import { hasWinningLine, isBoardFull, QuartoBoard, QUARTO_BOARD_SIZE } from './board';
import {
  createGiveMove,
  createPlaceMove,
  parseGiveMoveKey,
  parsePlaceMoveKey,
  type QuartoGiveMove,
  type QuartoMove,
  type QuartoPlaceMove,
} from './move';
import { type QuartoPiece, piecesEqual } from './piece';
import {
  createQuartoState,
  getWinner,
  isTerminalState,
  opponent,
  removePiece,
  type QuartoState,
} from './state';

function listEmptyCells(board: QuartoBoard): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let row = 0; row < QUARTO_BOARD_SIZE; row++) {
    for (let col = 0; col < QUARTO_BOARD_SIZE; col++) {
      if (board.get(row, col) === null) cells.push({ row, col });
    }
  }
  return cells;
}

function canPieceLeadToWin(piece: QuartoPiece, board: QuartoBoard): boolean {
  for (const { row, col } of listEmptyCells(board)) {
    const testBoard = board.withCell(row, col, piece);
    if (hasWinningLine(testBoard)) return true;
  }
  return false;
}

function countSafePieces(board: QuartoBoard, pieces: QuartoPiece[]): number {
  return pieces.filter((piece) => !canPieceLeadToWin(piece, board)).length;
}

function wouldWinPlacement(board: QuartoBoard, piece: QuartoPiece, row: number, col: number): boolean {
  return hasWinningLine(board.withCell(row, col, piece));
}

function scorePlaceMove(state: QuartoState, move: QuartoPlaceMove, perspectivePlayer: PlayerId): number {
  if (state.stagedPiece === null) return 0;

  if (wouldWinPlacement(state.board, state.stagedPiece, move.row, move.col)) return 1;

  const testBoard = state.board.withCell(move.row, move.col, state.stagedPiece);
  const safeCount = countSafePieces(testBoard, state.availablePieces);
  const maxSafe = state.availablePieces.length;
  const normalized = maxSafe === 0 ? 0.5 : safeCount / maxSafe;

  void perspectivePlayer;
  return 0.4 + normalized * 0.5;
}

function scoreGiveMove(state: QuartoState, move: QuartoGiveMove): number {
  if (canPieceLeadToWin(move.piece, state.board)) return 0.05;
  return 0.85;
}

function applyPlaceMove(state: QuartoState, move: QuartoPlaceMove): QuartoState {
  if (state.stagedPiece === null) {
    throw new Error('Cannot place without a staged piece');
  }
  if (state.board.get(move.row, move.col) !== null) {
    throw new Error(`Cell (${move.row},${move.col}) is occupied`);
  }

  const nextBoard = state.board.withCell(move.row, move.col, state.stagedPiece);
  if (hasWinningLine(nextBoard)) {
    return createQuartoState({
      board: nextBoard,
      currentPlayer: state.currentPlayer,
      currentPhase: 'give',
      availablePieces: state.availablePieces,
      stagedPiece: null,
    });
  }

  return createQuartoState({
    board: nextBoard,
    currentPlayer: state.currentPlayer,
    currentPhase: 'give',
    availablePieces: state.availablePieces,
    stagedPiece: null,
  });
}

function applyGiveMove(state: QuartoState, move: QuartoGiveMove): QuartoState {
  const piece = state.availablePieces.find((p) => piecesEqual(p, move.piece));
  if (piece === undefined) {
    throw new Error('Piece to give is not available');
  }

  return createQuartoState({
    board: state.board,
    currentPlayer: opponent(state.currentPlayer),
    currentPhase: 'place',
    availablePieces: removePiece(state.availablePieces, piece),
    stagedPiece: piece,
  });
}

function createSearchFunctions(heuristic: 'uniform' | 'basic'): SearchFunctions<QuartoState, QuartoMove> {
  return {
    generateMoves(state, perspectivePlayer) {
      const moves: QuartoMove[] = [];

      if (state.currentPhase === 'place' && state.stagedPiece !== null) {
        for (const { row, col } of listEmptyCells(state.board)) {
          const move = createPlaceMove(state.currentPlayer, row, col);
          move.heuristicValue =
            heuristic === 'uniform'
              ? 0.5
              : scorePlaceMove(state, move, perspectivePlayer);
          moves.push(move);
        }
        return moves;
      }

      if (state.currentPhase === 'give') {
        for (const piece of state.availablePieces) {
          const move = createGiveMove(state.currentPlayer, piece);
          move.heuristicValue = heuristic === 'uniform' ? 0.5 : scoreGiveMove(state, move);
          moves.push(move);
        }
      }

      return moves;
    },

    evaluatePosition(state, perspectivePlayer) {
      if (isTerminalState(state)) {
        const winner = getWinner(state);
        if (winner === null) return 0.5;
        return winner === perspectivePlayer ? 1 : 0;
      }

      if (state.currentPhase === 'place' && state.stagedPiece !== null) {
        if (canPieceLeadToWin(state.stagedPiece, state.board)) {
          return perspectivePlayer === state.currentPlayer ? 1 : 0;
        }
      }

      if (heuristic === 'uniform') return 0.5;

      const safeCount = countSafePieces(state.board, state.availablePieces);
      const normalized =
        state.availablePieces.length === 0 ? 0.5 : safeCount / state.availablePieces.length;
      return 0.35 + normalized * 0.3;
    },

    makeMove(state, move) {
      if (move.phase === 'place') {
        return applyPlaceMove(state, move as QuartoPlaceMove);
      }
      return applyGiveMove(state, move as QuartoGiveMove);
    },
  };
}

export const quartoUniformSearch = createSearchFunctions('uniform');
export const quartoBasicSearch = createSearchFunctions('basic');

export function makeMoveFromKey(state: QuartoState, key: string): QuartoMove | null {
  const place = parsePlaceMoveKey(key);
  if (place !== null && state.currentPhase === 'place' && place.player === state.currentPlayer) {
    if (state.stagedPiece === null || state.board.get(place.row, place.col) !== null) {
      return null;
    }
    return createPlaceMove(place.player, place.row, place.col);
  }

  const give = parseGiveMoveKey(key);
  if (give !== null && state.currentPhase === 'give' && give.player === state.currentPlayer) {
    const piece = state.availablePieces.find(
      (p) =>
        p.height === give.piece.height &&
        p.color === give.piece.color &&
        p.shape === give.piece.shape &&
        p.top === give.piece.top,
    );
    if (piece === undefined) return null;
    return createGiveMove(give.player, piece);
  }

  return null;
}

export function isBoardTerminal(board: QuartoBoard): boolean {
  return hasWinningLine(board) || isBoardFull(board);
}
