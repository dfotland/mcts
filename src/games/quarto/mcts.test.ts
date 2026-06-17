import { describe, expect, it } from 'vitest';

import { neverStop } from '../../contracts/stop-signal';
import { MCTSEngine, SearchParameters } from '../../mcts';
import { giveMoveKey } from './move';
import { quartoEngine } from './engine';
import { QUARTO_POSITIONS } from './fixtures';
import { quartoBasicSearch } from './search-functions';

const engine = new MCTSEngine(quartoEngine);

describe('Quarto MCTSEngine', () => {
  it('finds a one-ply winning placement', () => {
    const state = QUARTO_POSITIONS.winInOnePlace(0);
    const params = new SearchParameters({
      maxIterations: 400,
      seed: 11,
      heuristicId: 'quarto-basic',
      stopPollInterval: 16,
    });

    const outcome = engine.search(
      {
        state,
        params,
        functions: quartoBasicSearch,
      },
      neverStop,
    );
    const expected = QUARTO_POSITIONS.expectedWinPlaceMove(0);

    expect(outcome.bestMove?.key).toBe(expected.key);
  });

  it(
    'avoids giving a piece that lets the opponent win immediately',
    () => {
      const state = QUARTO_POSITIONS.lethalGiveForOpponent(0);
      const lethalPiece = QUARTO_POSITIONS.lethalGivePiece();
      const lethalKey = giveMoveKey(0, lethalPiece);

      const params = new SearchParameters({
        maxIterations: 200,
        seed: 21,
        heuristicId: 'quarto-basic',
        stopPollInterval: 16,
        logPrincipalVariation: false,
      });

      const outcome = engine.search({ state, params, functions: quartoBasicSearch }, neverStop);

      expect(outcome.bestMove?.key).not.toBe(lethalKey);

      const lethalChild = outcome.children.find((c) => c.move.key === lethalKey);
      expect(lethalChild).toBeDefined();
      expect(lethalChild!.winRate).toBeLessThan(0.5);

      const safest = outcome.children
        .filter((c) => c.move.key !== lethalKey)
        .sort((a, b) => b.winRate - a.winRate)[0];
      expect(safest).toBeDefined();
      expect(safest!.winRate).toBeGreaterThan(lethalChild!.winRate);
    },
    15_000,
  );

  it(
    'stores node wins for side to move, not the move actor',
    () => {
      const state = QUARTO_POSITIONS.lethalGiveForOpponent(0);
      const lethalPiece = QUARTO_POSITIONS.lethalGivePiece();
      const lethalKey = giveMoveKey(0, lethalPiece);

      const outcome = engine.search(
        {
          state,
          params: new SearchParameters({
            maxIterations: 120,
            seed: 42,
            heuristicId: 'quarto-basic',
            stopPollInterval: 16,
            logPrincipalVariation: false,
          }),
          functions: quartoBasicSearch,
        },
        neverStop,
      );

      const lethalChild = outcome.children.find((c) => c.move.key === lethalKey);
      expect(lethalChild).toBeDefined();

      const nodeWinRate = lethalChild!.wins / lethalChild!.visits;
      // After a lethal give by p0, the child position has p1 to place and win.
      expect(nodeWinRate).toBeGreaterThan(0.5);
      expect(lethalChild!.winRate).toBeLessThan(0.5);

      for (const step of outcome.principalVariation) {
        expect(step.sideToMoveWinRate).toBeCloseTo(step.wins / step.visits, 5);
        if (step.sideToMoveAfter === 0) {
          expect(step.winRate).toBeCloseTo(step.sideToMoveWinRate, 5);
        } else {
          expect(step.winRate).toBeCloseTo(1 - step.sideToMoveWinRate, 5);
        }
      }
    },
    15_000,
  );
});
