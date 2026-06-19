import type { RolloutMovePick, SearchFunctions } from '../../contracts/search-functions';
import type { Writable } from '../../contracts/writable';
import type { PlayerId } from '../../contracts/player';
import { findWinner, isBoardFull, type TicTacToeBoard } from './board';
import { createMove, type TicTacToeMove } from './move';
import {
  getWinner,
  isTerminalState,
  nextPlayer,
  type TicTacToeState,
} from './state';

type RolloutScratch = Writable<TicTacToeState> & {
  _rolloutTerminal?: boolean;
};

function opponent(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

function applyMoveOnBoard(board: TicTacToeBoard, player: PlayerId, row: number, col: number): TicTacToeBoard {
  if (board.get(row, col) !== null) {
    throw new Error(`Cell (${row},${col}) is occupied`);
  }
  return board.withCell(row, col, player);
}

function listLegalMoves(state: TicTacToeState): TicTacToeMove[] {
  const moves: TicTacToeMove[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (state.board.get(row, col) === null) {
        moves.push(createMove(state.currentPlayer, row, col));
      }
    }
  }
  return moves;
}

function wouldWin(board: TicTacToeBoard, player: PlayerId, row: number, col: number): boolean {
  const next = applyMoveOnBoard(board, player, row, col);
  return findWinner(next) === player;
}

function scoreMove(state: TicTacToeState, move: TicTacToeMove, perspectivePlayer: PlayerId): number {
  const { row, col, player } = move;

  if (wouldWin(state.board, player, row, col)) return 1;

  const opp = opponent(perspectivePlayer);
  if (wouldWin(state.board, opp, row, col)) return 0.9;

  return 0.5;
}

function lineScore(board: TicTacToeBoard, perspectivePlayer: PlayerId): number {
  let score = 0;

  const lines: [number, number][][] = [
    [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 2],
    ],
    [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    [
      [0, 2],
      [1, 1],
      [2, 0],
    ],
  ];

  for (const line of lines) {
    let mine = 0;
    let theirs = 0;
    let empty = 0;
    for (const [r, c] of line) {
      const cell = board.get(r, c);
      if (cell === null) empty++;
      else if (cell === perspectivePlayer) mine++;
      else theirs++;
    }
    if (mine > 0 && theirs > 0) continue;
    if (mine === 2 && empty === 1) score += 0.15;
    if (theirs === 2 && empty === 1) score -= 0.15;
  }

  return Math.max(0, Math.min(1, 0.5 + score));
}

function applyMoveInPlace(state: TicTacToeState, move: TicTacToeMove): void {
  if (state.board.get(move.row, move.col) !== null) {
    throw new Error(`Cell (${move.row},${move.col}) is occupied`);
  }
  state.board.setCell(move.row, move.col, move.player);
  const writable = state as RolloutScratch;
  writable.currentPlayer = nextPlayer(state.currentPlayer);
  if (findWinner(state.board) !== null || isBoardFull(state.board)) {
    writable._rolloutTerminal = true;
  }
}

function pickRolloutMove(state: TicTacToeState, rng: () => number): RolloutMovePick<TicTacToeMove> | null {
  let chosen: { row: number; col: number } | null = null;
  let emptyCount = 0;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (state.board.get(row, col) !== null) continue;
      emptyCount++;
      if (rng() < 1 / emptyCount) chosen = { row, col };
    }
  }

  if (chosen === null) return null;

  const move = createMove(state.currentPlayer, chosen.row, chosen.col);
  if (wouldWin(state.board, move.player, move.row, move.col)) {
    return { move, terminalAfterApply: true };
  }
  return move;
}

function createSearchFunctions(heuristic: 'uniform' | 'basic'): SearchFunctions<TicTacToeState, TicTacToeMove> {
  return {
    generateMoves(state, perspectivePlayer) {
      const legal = listLegalMoves(state);
      for (const move of legal) {
        move.heuristicValue =
          heuristic === 'uniform' ? 0.5 : scoreMove(state, move, perspectivePlayer);
      }
      return legal;
    },

    generateRolloutMove(state, _perspectivePlayer, rng) {
      return pickRolloutMove(state, rng);
    },

    isRolloutTerminal(state) {
      return (state as RolloutScratch)._rolloutTerminal === true;
    },

    evaluatePosition(state, perspectivePlayer) {
      if (isTerminalState(state)) {
        const winner = getWinner(state);
        if (winner === null) return 0.5;
        return winner === perspectivePlayer ? 1 : 0;
      }
      return heuristic === 'uniform' ? 0.5 : lineScore(state.board, perspectivePlayer);
    },

    makeMove(state, move) {
      const next = state.clone() as TicTacToeState;
      applyMoveInPlace(next, move);
      return next;
    },

    applyMove(state, move) {
      applyMoveInPlace(state, move);
    },
  };
}

export const ticTacToeUniformSearch = createSearchFunctions('uniform');
export const ticTacToeBasicSearch = createSearchFunctions('basic');
