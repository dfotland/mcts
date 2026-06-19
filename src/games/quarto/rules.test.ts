import { describe, expect, it } from 'vitest';

import { createPrng } from '../../mcts/prng';
import { hasWinningLine, opponentCanWinWithPiece, QuartoBoard, wouldCompleteLine } from './board';
import { createGiveMove, createPlaceMove } from './move';
import { piece, QUARTO_POSITIONS } from './fixtures';
import { quartoBasicSearch } from './search-functions';
import { isTerminalState } from './state';

describe('quarto rules', () => {
  it('detects a height win on row 0', () => {
    const state = QUARTO_POSITIONS.winInOnePlace(0);
    expect(hasWinningLine(state.board)).toBe(false);

    const winningMove = createPlaceMove(0, 0, 3);
    const after = quartoBasicSearch.makeMove(state, winningMove);
    expect(hasWinningLine(after.board)).toBe(true);
    expect(isTerminalState(after)).toBe(true);
  });

  it('transitions place → give when placement does not win', () => {
    const state = QUARTO_POSITIONS.winInOnePlace(0);
    const move = createPlaceMove(0, 1, 1);
    const after = quartoBasicSearch.makeMove(state, move);

    expect(after.currentPhase).toBe('give');
    expect(after.currentPlayer).toBe(0);
    expect(after.stagedPiece).toBeNull();
    expect(isTerminalState(after)).toBe(false);
  });

  it('evaluates a lethal staged piece as a forced win for the placer', () => {
    const state = QUARTO_POSITIONS.winInOnePlace(1);
    const placerWin = quartoBasicSearch.evaluatePosition(state, 1);
    const giverLoss = quartoBasicSearch.evaluatePosition(state, 0);

    expect(placerWin).toBe(1);
    expect(giverLoss).toBe(0);
  });

  it('transitions give → opponent place', () => {
    const state = QUARTO_POSITIONS.openingGive(0);
    const givePiece = state.availablePieces[0]!;
    const move = createGiveMove(0, givePiece);
    const after = quartoBasicSearch.makeMove(state, move);

    expect(after.currentPhase).toBe('place');
    expect(after.currentPlayer).toBe(1);
    expect(after.stagedPiece).toEqual(givePiece);
    expect(after.availablePieces).not.toContainEqual(givePiece);
  });

  it('applyMove mutates a scratch copy without affecting the source state', () => {
    const state = QUARTO_POSITIONS.openingGive(0);
    const givePiece = state.availablePieces[0]!;
    const move = createGiveMove(0, givePiece);
    const scratch = state.clone() as typeof state;

    quartoBasicSearch.applyMove(scratch, move);

    expect(scratch.currentPhase).toBe('place');
    expect(scratch.currentPlayer).toBe(1);
    expect(state.currentPhase).toBe('give');
    expect(state.currentPlayer).toBe(0);
    expect(state.availablePieces).toHaveLength(16);
  });

  it('generates give moves at game start', () => {
    const state = QUARTO_POSITIONS.openingGive(0);
    const moves = quartoBasicSearch.generateMoves(state, 0);
    expect(moves).toHaveLength(16);
    expect(moves.every((m) => m.phase === 'give')).toBe(true);
  });

  it('generates place moves when a piece is staged', () => {
    const state = QUARTO_POSITIONS.winInOnePlace(0);
    const moves = quartoBasicSearch.generateMoves(state, 0);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.phase === 'place')).toBe(true);
  });
});

describe('generateRolloutMove', () => {
  it('returns the first winning placement during place phase', () => {
    const state = QUARTO_POSITIONS.winInOnePlace(0);
    const move = quartoBasicSearch.generateRolloutMove(state, 0, () => 0.99);

    expect(move?.phase).toBe('place');
    expect(move?.key).toBe(QUARTO_POSITIONS.expectedWinPlaceMove(0).key);
  });

  it('returns a random legal placement when no immediate win exists', () => {
    const state = QUARTO_POSITIONS.winInOnePlace(0);
    const move = quartoBasicSearch.generateRolloutMove(state, 0, createPrng(42));

    expect(move?.phase).toBe('place');
    if (move?.phase !== 'place') return;
    expect(state.board.get(move.row, move.col)).toBeNull();
  });

  it('prefers safe pieces during give phase', () => {
    const state = QUARTO_POSITIONS.lethalGiveForOpponent(0);
    const lethalPiece = QUARTO_POSITIONS.lethalGivePiece();
    const lethalKey = createGiveMove(0, lethalPiece).key;

    for (let seed = 0; seed < 50; seed++) {
      const move = quartoBasicSearch.generateRolloutMove(state, 0, createPrng(seed));
      expect(move?.phase).toBe('give');
      expect(move?.key).not.toBe(lethalKey);
    }
  });

  it('falls back to a random piece when every give loses immediately', () => {
    const state = QUARTO_POSITIONS.lethalGiveForOpponent(0);
    const onlyPiece = piece({ height: 'tall', color: 'dark', shape: 'square', top: 'split' });
    const narrowed = state.clone() as typeof state;
    (narrowed as { availablePieces: typeof onlyPiece[] }).availablePieces = [onlyPiece];

    const move = quartoBasicSearch.generateRolloutMove(narrowed, 0, createPrng(1));
    expect(move?.phase).toBe('give');
    expect(move?.key).toBe(createGiveMove(0, onlyPiece).key);
  });

  it('is reproducible with the same rng seed', () => {
    const state = QUARTO_POSITIONS.openingGive(0);
    const a = quartoBasicSearch.generateRolloutMove(state, 0, createPrng(7));
    const b = quartoBasicSearch.generateRolloutMove(state, 0, createPrng(7));
    expect(a?.key).toBe(b?.key);
  });
});

describe('read-only board helpers', () => {
  it('detects a hypothetical winning placement without copying the board', () => {
    const state = QUARTO_POSITIONS.winInOnePlace(0);
    expect(wouldCompleteLine(state.board, state.stagedPiece!, 0, 3)).toBe(true);
    expect(hasWinningLine(state.board)).toBe(false);
  });

  it('detects pieces that let the opponent win immediately', () => {
    const state = QUARTO_POSITIONS.lethalGiveForOpponent(0);
    const lethal = QUARTO_POSITIONS.lethalGivePiece();
    expect(opponentCanWinWithPiece(state.board, lethal)).toBe(true);
  });
});

describe('quarto board', () => {
  it('returns null when no line is complete', () => {
    expect(hasWinningLine(new QuartoBoard())).toBe(false);
    expect(hasWinningLine(QUARTO_POSITIONS.winInOnePlace(0).board)).toBe(false);
  });

  it('detects partial lines as non-winning', () => {
    let board = new QuartoBoard();
    board = board.withCell(0, 0, piece({ height: 'tall' }));
    board = board.withCell(0, 1, piece({ height: 'tall' }));
    expect(hasWinningLine(board)).toBe(false);
  });
});
