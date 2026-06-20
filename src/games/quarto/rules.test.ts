import { describe, expect, it } from 'vitest';

import { normalizeRolloutPick } from '../../contracts/search-functions';
import { createPrng } from '../../mcts/prng';
import { hasWinningLine, opponentCanWinWithPiece, QuartoBoard, wouldCompleteLine } from './board';
import { piece, QUARTO_POSITIONS } from './fixtures';
import { createGiveMove, createPlaceMove } from './move';
import { generateAllPieces, pieceAtIndex, pieceIndex, QUARTO_PIECE_COUNT } from './piece';
import { initRolloutScratch, rolloutLethalGiveMask } from './rules';
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

describe('quarto piece indices', () => {
  it('maps each catalog piece to a stable 0–15 index', () => {
    const pieces = generateAllPieces();
    expect(pieces).toHaveLength(QUARTO_PIECE_COUNT);

    for (let index = 0; index < QUARTO_PIECE_COUNT; index++) {
      const piece = pieceAtIndex(index);
      expect(pieceIndex(piece)).toBe(index);
      expect(pieces[index]).toEqual(piece);
    }
  });
});

describe('rollout lethal-give mask', () => {
  it('marks lethal tall pieces at rollout start on a height threat row', () => {
    const state = QUARTO_POSITIONS.lethalGiveForOpponent(0);
    initRolloutScratch(state);

    const lethalIndex = pieceIndex(QUARTO_POSITIONS.lethalGivePiece());
    const mask = rolloutLethalGiveMask(state);

    expect(mask & (1 << lethalIndex)).not.toBe(0);
    for (let index = 0; index < 8; index++) {
      expect(mask & (1 << index)).not.toBe(0);
    }
    for (let index = 8; index < QUARTO_PIECE_COUNT; index++) {
      expect(mask & (1 << index)).toBe(0);
    }
  });

  it('clears lethal bits when the only winning cell is filled', () => {
    const state = QUARTO_POSITIONS.lethalGiveForOpponent(0);
    initRolloutScratch(state);

    const safePiece = state.availablePieces.find(
      (p) => pieceIndex(p) !== pieceIndex(QUARTO_POSITIONS.lethalGivePiece()),
    )!;
    quartoBasicSearch.applyMove(state, createGiveMove(0, safePiece));
    quartoBasicSearch.applyMove(state, createPlaceMove(1, 0, 3));

    expect(rolloutLethalGiveMask(state)).toBe(0);
  });
});

describe('generateRolloutMove', () => {
  it('returns the first winning placement during place phase', () => {
    const state = QUARTO_POSITIONS.winInOnePlace(0);
    quartoBasicSearch.beginRollout(state);
    const pick = quartoBasicSearch.generateRolloutMove(state, 0, () => 0.99);
    const { move, terminalAfterApply } = normalizeRolloutPick(pick!);

    expect(move.phase).toBe('place');
    expect(move.key).toBe(QUARTO_POSITIONS.expectedWinPlaceMove(0).key);
    expect(terminalAfterApply).toBe(true);
  });

  it('returns a random legal placement when no immediate win exists', () => {
    const state = QUARTO_POSITIONS.winInOnePlace(0);
    quartoBasicSearch.beginRollout(state);
    const pick = quartoBasicSearch.generateRolloutMove(state, 0, createPrng(42));
    const { move } = normalizeRolloutPick(pick!);

    expect(move.phase).toBe('place');
    expect(state.board.get(move.row, move.col)).toBeNull();
  });

  it('prefers safe pieces during give phase', () => {
    const state = QUARTO_POSITIONS.lethalGiveForOpponent(0);
    quartoBasicSearch.beginRollout(state);
    const lethalPiece = QUARTO_POSITIONS.lethalGivePiece();
    const lethalKey = createGiveMove(0, lethalPiece).key;

    for (let seed = 0; seed < 50; seed++) {
      const pick = quartoBasicSearch.generateRolloutMove(state, 0, createPrng(seed));
      const { move } = normalizeRolloutPick(pick!);
      expect(move.phase).toBe('give');
      expect(move.key).not.toBe(lethalKey);
    }
  });

  it('falls back to a random piece when every give loses immediately', () => {
    const state = QUARTO_POSITIONS.lethalGiveForOpponent(0);
    const onlyPiece = piece({ height: 'tall', color: 'dark', shape: 'square', top: 'split' });
    const narrowed = state.clone() as typeof state;
    (narrowed as { availablePieces: typeof onlyPiece[] }).availablePieces = [onlyPiece];

    quartoBasicSearch.beginRollout(narrowed);
    const pick = quartoBasicSearch.generateRolloutMove(narrowed, 0, createPrng(1));
    const { move } = normalizeRolloutPick(pick!);
    expect(move.phase).toBe('give');
    expect(move.key).toBe(createGiveMove(0, onlyPiece).key);
  });

  it('is reproducible with the same rng seed', () => {
    const state = QUARTO_POSITIONS.openingGive(0);
    quartoBasicSearch.beginRollout(state);
    const a = quartoBasicSearch.generateRolloutMove(state, 0, createPrng(7));
    quartoBasicSearch.beginRollout(state);
    const b = quartoBasicSearch.generateRolloutMove(state, 0, createPrng(7));
    expect(normalizeRolloutPick(a!).move.key).toBe(normalizeRolloutPick(b!).move.key);
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
