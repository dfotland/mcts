import { describe, expect, it } from 'vitest';

import { neverStop } from '../contracts/stop-signal';
import { MCTSEngine, SearchParameters } from './index';
import { extractPrincipalVariation, formatPrincipalVariation } from './principal-variation';
import { createRootNode } from './mcts-node';
import { ticTacToeEngine } from '../games/tic-tac-toe/engine';
import { TTT_POSITIONS } from '../games/tic-tac-toe/fixtures';
import { ticTacToeBasicSearch } from '../games/tic-tac-toe/search-functions';

describe('principal variation', () => {
  it('extracts a visit-ranked line from the search tree', () => {
    const engine = new MCTSEngine(ticTacToeEngine);
    const state = TTT_POSITIONS.xWinInOne();
    const params = new SearchParameters({
      maxIterations: 200,
      seed: 3,
      heuristicId: 'basic',
      logPrincipalVariation: false,
    });

    const outcome = engine.search(
      { state, params, functions: ticTacToeBasicSearch },
      neverStop,
    );

    expect(outcome.principalVariation.length).toBeGreaterThan(0);
    expect(outcome.principalVariation[0]!.moveKey).toBe('main:0:0,2');
    expect(outcome.principalVariation[0]!.visits).toBeGreaterThan(0);
    expect(outcome.principalVariation[0]!.wins).toBeGreaterThanOrEqual(0);
    expect(outcome.principalVariation[0]!.winRate).toBeGreaterThan(0.5);
  });

  it('formats PV lines with visits, wins, and win rate', () => {
    const formatted = formatPrincipalVariation([
      {
        moveKey: 'give:0:short-dark-round-split',
        player: 0,
        phase: 'give',
        sideToMoveAfter: 1,
        visits: 12,
        wins: 8,
        winRate: 0.667,
      },
      {
        moveKey: 'place:1:0,0',
        player: 1,
        phase: 'place',
        sideToMoveAfter: 1,
        visits: 5,
        wins: 2,
        winRate: 0.4,
      },
    ]);

    expect(formatted).toContain('giver=p0');
    expect(formatted).toContain('toMove=p1');
    expect(formatted).toContain('rootWinRate=66.7%');
  });

  it('returns empty PV for an unexpanded root', () => {
    const root = createRootNode(TTT_POSITIONS.empty());
    const pv = extractPrincipalVariation(root, 0, (state) => ticTacToeEngine.getCurrentPlayer(state));
    expect(pv).toEqual([]);
  });
});
