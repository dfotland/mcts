import { describe, expect, it } from 'vitest';

import { normalizeRolloutPick } from '../../contracts/search-functions';
import { createPrng } from '../../mcts/prng';
import { findWinner, TicTacToeBoard } from './board';
import { createMove } from './move';
import { ticTacToeBasicSearch } from './search-functions';
import { createTicTacToeState, getWinner, isTerminalState } from './state';

describe('tic-tac-toe rules', () => {
  it('detects a row win', () => {
    const board = new TicTacToeBoard([
      [0, 0, 0],
      [null, 1, null],
      [null, null, 1],
    ]);
    expect(findWinner(board)).toBe(0);
  });

  it('applies moves and alternates players', () => {
    let state = createTicTacToeState();
    const move = createMove(0, 1, 1);
    state = ticTacToeBasicSearch.makeMove(state, move);
    expect(state.board.get(1, 1)).toBe(0);
    expect(state.currentPlayer).toBe(1);
    expect(isTerminalState(state)).toBe(false);
  });

  it('recognizes terminal draw', () => {
    const board = new TicTacToeBoard([
      [0, 1, 0],
      [1, 0, 1],
      [1, 0, 1],
    ]);
    const state = createTicTacToeState(board, 0);
    expect(getWinner(state)).toBeNull();
    expect(isTerminalState(state)).toBe(true);
  });
});

describe('generateRolloutMove', () => {
  it('returns a legal empty cell', () => {
    const state = createTicTacToeState();
    const pick = ticTacToeBasicSearch.generateRolloutMove(state, 0, createPrng(3));
    const { move } = normalizeRolloutPick(pick!);

    expect(pick).not.toBeNull();
    expect(state.board.get(move.row, move.col)).toBeNull();
  });

  it('returns null on a full board', () => {
    const board = new TicTacToeBoard([
      [0, 1, 0],
      [1, 0, 1],
      [1, 0, 1],
    ]);
    const state = createTicTacToeState(board, 0);
    expect(ticTacToeBasicSearch.generateRolloutMove(state, 0, createPrng(1))).toBeNull();
  });

  it('is reproducible with the same rng seed', () => {
    const state = createTicTacToeState();
    const a = ticTacToeBasicSearch.generateRolloutMove(state, 0, createPrng(11));
    const b = ticTacToeBasicSearch.generateRolloutMove(state, 0, createPrng(11));
    expect(normalizeRolloutPick(a!).move.key).toBe(normalizeRolloutPick(b!).move.key);
  });
});
