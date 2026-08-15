import { describe, expect, it } from 'vitest';

import { quartoBasicSearch } from './search-functions';
import { QUARTO_POSITIONS } from './fixtures';
import { createGiveMove } from './move';
import {
  blendTowardDraw,
  ENDGAME_WEIGHT_MIN,
  endgameWeight,
  pWinFromSafeFraction,
  QUARTO_MAX_EMPTY_CELLS,
} from './p-win';

describe('endgameWeight / blendTowardDraw', () => {
  it('is ENDGAME_WEIGHT_MIN on an empty board and 1 when no cells remain', () => {
    expect(endgameWeight(QUARTO_MAX_EMPTY_CELLS)).toBe(ENDGAME_WEIGHT_MIN);
    expect(endgameWeight(0)).toBe(1);
  });

  it('pulls the same tactical signal closer to 0.5 with 16 empty cells than with 2', () => {
    const pTactical = 0.8;
    const early = blendTowardDraw(pTactical, 16);
    const late = blendTowardDraw(pTactical, 2);
    expect(Math.abs(early - 0.5)).toBeLessThan(Math.abs(late - 0.5));
    expect(early).toBeCloseTo(0.5 + 0.3 * ENDGAME_WEIGHT_MIN);
  });

  it('maps all-safe / none-safe fractions to 0.8 / 0.2 before blend', () => {
    expect(pWinFromSafeFraction(1)).toBeCloseTo(0.8);
    expect(pWinFromSafeFraction(0)).toBeCloseTo(0.2);
    expect(pWinFromSafeFraction(0.5)).toBeCloseTo(0.5);
  });
});

describe('quarto-basic P(win) tree scores', () => {
  it('scores opening gives near 0.5, not 0.85', () => {
    const state = QUARTO_POSITIONS.openingGive(0);
    const moves = quartoBasicSearch.generateMoves(state, 0);
    expect(moves).toHaveLength(16);
    for (const move of moves) {
      expect(move.heuristicValue).toBeCloseTo(0.5);
    }
  });

  it('scores a lethal give as 0 and safe gives strictly higher', () => {
    const state = QUARTO_POSITIONS.lethalGiveForOpponent(0);
    const lethalKey = createGiveMove(0, QUARTO_POSITIONS.lethalGivePiece()).key;
    const moves = quartoBasicSearch.generateMoves(state, 0);
    const lethal = moves.find((m) => m.key === lethalKey);
    expect(lethal?.heuristicValue).toBe(0);
    const safe = moves.filter((m) => m.heuristicValue > 0);
    expect(safe.length).toBeGreaterThan(0);
    expect(moves.some((m) => m.heuristicValue === 0)).toBe(true);
  });

  it('scores a winning place as 1 and other cells in (0, 1)', () => {
    const state = QUARTO_POSITIONS.winInOnePlace(0);
    const moves = quartoBasicSearch.generateMoves(state, 0);
    const winning = moves.find((m) => m.phase === 'place' && m.row === 0 && m.col === 3);
    expect(winning?.heuristicValue).toBe(1);
    const others = moves.filter((m) => m !== winning);
    expect(others.length).toBeGreaterThan(0);
    for (const move of others) {
      expect(move.heuristicValue).toBeGreaterThan(0);
      expect(move.heuristicValue).toBeLessThan(1);
    }
  });
});

describe('quarto-basic P(win) leaf eval', () => {
  it('is near 0.5 for both players at the opening', () => {
    const state = QUARTO_POSITIONS.openingGive(0);
    const p0 = quartoBasicSearch.evaluatePosition(state, 0);
    const p1 = quartoBasicSearch.evaluatePosition(state, 1);
    expect(p0).toBeGreaterThan(0.4);
    expect(p0).toBeLessThan(0.7);
    expect(p1).toBeGreaterThan(0.3);
    expect(p1).toBeLessThan(0.6);
    expect(p0 + p1).toBeCloseTo(1);
  });

  it('flips non-terminal eval so the two perspectives sum to 1', () => {
    const state = QUARTO_POSITIONS.lethalGiveForOpponent(0);
    const p0 = quartoBasicSearch.evaluatePosition(state, 0);
    const p1 = quartoBasicSearch.evaluatePosition(state, 1);
    expect(p0 + p1).toBeCloseTo(1);
  });
});
