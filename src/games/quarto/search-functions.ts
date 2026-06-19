import type { RolloutMovePick, SearchFunctions } from '../../contracts/search-functions';
import type { Writable } from '../../contracts/writable';
import type { PlayerId } from '../../contracts/player';
import {
  hasWinningLine,
  isBoardFull,
  opponentCanWinWithPiece,
  opponentCanWinWithPieceOnEmptyCells,
  QuartoBoard,
  QUARTO_BOARD_SIZE,
  wouldCompleteLine,
} from './board';
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
  getWinner,
  isTerminalState,
  opponent,
  type QuartoState,
} from './state';

type EmptyCell = { row: number; col: number };

type RolloutScratch = Writable<QuartoState> & {
  _rolloutEmptyCells?: EmptyCell[];
  _rolloutTerminal?: boolean;
};

function buildEmptyCells(board: QuartoBoard): EmptyCell[] {
  const cells: EmptyCell[] = [];
  for (let row = 0; row < QUARTO_BOARD_SIZE; row++) {
    for (let col = 0; col < QUARTO_BOARD_SIZE; col++) {
      if (board.get(row, col) === null) cells.push({ row, col });
    }
  }
  return cells;
}

function ensureRolloutEmptyCells(state: QuartoState): EmptyCell[] {
  const scratch = state as RolloutScratch;
  if (scratch._rolloutEmptyCells === undefined) {
    scratch._rolloutEmptyCells = buildEmptyCells(state.board);
  }
  return scratch._rolloutEmptyCells;
}

function removeEmptyCell(cells: EmptyCell[], row: number, col: number): void {
  const index = cells.findIndex((cell) => cell.row === row && cell.col === col);
  if (index !== -1) cells.splice(index, 1);
}

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
  return opponentCanWinWithPiece(board, piece);
}

function countSafePieces(board: QuartoBoard, pieces: QuartoPiece[]): number {
  return pieces.filter((piece) => !opponentCanWinWithPiece(board, piece)).length;
}

function wouldWinPlacement(board: QuartoBoard, piece: QuartoPiece, row: number, col: number): boolean {
  return wouldCompleteLine(board, piece, row, col);
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

function applyPlaceMoveInPlace(state: QuartoState, move: QuartoPlaceMove): void {
  if (state.stagedPiece === null) {
    throw new Error('Cannot place without a staged piece');
  }
  if (state.board.get(move.row, move.col) !== null) {
    throw new Error(`Cell (${move.row},${move.col}) is occupied`);
  }

  const writable = state as RolloutScratch;
  const wins = wouldCompleteLine(state.board, state.stagedPiece, move.row, move.col);
  state.board.setCell(move.row, move.col, state.stagedPiece);
  writable.stagedPiece = null;
  writable.currentPhase = 'give';
  if (writable._rolloutEmptyCells !== undefined) {
    removeEmptyCell(writable._rolloutEmptyCells, move.row, move.col);
  }
  if (wins || (writable._rolloutEmptyCells !== undefined && writable._rolloutEmptyCells.length === 0)) {
    writable._rolloutTerminal = true;
  }
}

function applyGiveMoveInPlace(state: QuartoState, move: QuartoGiveMove): void {
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

function applyPlaceMove(state: QuartoState, move: QuartoPlaceMove): QuartoState {
  const next = state.clone() as QuartoState;
  applyPlaceMoveInPlace(next, move);
  return next;
}

function applyGiveMove(state: QuartoState, move: QuartoGiveMove): QuartoState {
  const next = state.clone() as QuartoState;
  applyGiveMoveInPlace(next, move);
  return next;
}

function generateRolloutPlaceMove(
  state: QuartoState,
  rng: () => number,
): RolloutMovePick<QuartoPlaceMove> | null {
  if (state.stagedPiece === null) return null;

  const emptyCells = ensureRolloutEmptyCells(state);

  for (const { row, col } of emptyCells) {
    if (wouldCompleteLine(state.board, state.stagedPiece, row, col)) {
      return {
        move: createPlaceMove(state.currentPlayer, row, col),
        terminalAfterApply: true,
      };
    }
  }

  let chosen: EmptyCell | null = null;
  let emptyCount = 0;

  for (const cell of emptyCells) {
    emptyCount++;
    if (rng() < 1 / emptyCount) chosen = cell;
  }

  if (chosen === null) return null;
  return createPlaceMove(state.currentPlayer, chosen.row, chosen.col);
}

function generateRolloutGiveMove(state: QuartoState, rng: () => number): QuartoGiveMove | null {
  const pieces = state.availablePieces;
  if (pieces.length === 0) return null;

  const emptyCells = ensureRolloutEmptyCells(state);

  const safe: QuartoPiece[] = [];
  for (const piece of pieces) {
    if (!opponentCanWinWithPieceOnEmptyCells(state.board, piece, emptyCells)) safe.push(piece);
  }

  const pool = safe.length > 0 ? safe : pieces;
  const piece = pool[Math.floor(rng() * pool.length)]!;
  return createGiveMove(state.currentPlayer, piece);
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

    generateRolloutMove(state, _perspectivePlayer, rng) {
      if (state.currentPhase === 'place' && state.stagedPiece !== null) {
        return generateRolloutPlaceMove(state, rng);
      }

      if (state.currentPhase === 'give') {
        return generateRolloutGiveMove(state, rng);
      }

      return null;
    },

    isRolloutTerminal(state) {
      const scratch = state as RolloutScratch;
      if (scratch._rolloutTerminal === true) return true;
      if (scratch._rolloutEmptyCells !== undefined && scratch._rolloutEmptyCells.length === 0) {
        return true;
      }
      return false;
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

    applyMove(state, move) {
      if (move.phase === 'place') {
        applyPlaceMoveInPlace(state, move as QuartoPlaceMove);
        return;
      }
      applyGiveMoveInPlace(state, move as QuartoGiveMove);
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
