import { describe, expect, it } from 'vitest';

import { hasWinningLine, QuartoBoard } from './board';
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
