import { describe, expect, it } from 'vitest';

import { neverStop } from '../contracts/stop-signal';
import { MCTSEngine, SearchParameters } from './index';
import { extractPrincipalVariation, formatPrincipalVariation, formatRootChildrenSummary } from './principal-variation';
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
        sideToMoveWinRate: 8 / 12,
        winRate: 1 - 8 / 12,
      },
      {
        moveKey: 'place:1:0,0',
        player: 1,
        phase: 'place',
        sideToMoveAfter: 1,
        visits: 5,
        wins: 2,
        sideToMoveWinRate: 2 / 5,
        winRate: 1 - 2 / 5,
      },
    ]);

    expect(formatted).toContain('giver=p0');
    expect(formatted).toContain('toMove=p1');
    expect(formatted).toContain('winRate=p0:33.3%');
    expect(formatted).toContain('rootWinRate=33.3%');
    expect(formatted).toContain('winRate=p1:40.0%');
  });

  it('formats top root children with heuristic and UCT terms', () => {
    const formatted = formatRootChildrenSummary(
      [
        {
          moveKey: 'give:0:short-dark-round-split',
          visits: 12,
          wins: 8,
          winRate: 1 - 8 / 12,
          heuristicValue: 0.75,
        },
        {
          moveKey: 'give:0:tall-light-square-smooth',
          visits: 5,
          wins: 2,
          winRate: 0.4,
          heuristicValue: 0.5,
        },
      ],
      'MCTS root',
      undefined,
      8,
      {
        parentVisits: 17,
        explorationConstant: Math.SQRT2,
        movePriorWeight: 0,
        progressiveBiasWeight: 1,
      },
    );

    expect(formatted).toContain('top 8 by visits');
    expect(formatted).toContain('H=0.750');
    expect(formatted).toContain('Q=0.333');
    expect(formatted).toContain('U=');
    expect(formatted).toContain('bias=');
    expect(formatted).toContain('prior=0.000');
    expect(formatted).toContain('uct=');
  });

  it('returns empty PV for an unexpanded root', () => {
    const root = createRootNode({ playerToMove: 0, isTerminal: false });
    const pv = extractPrincipalVariation(root, 0);
    expect(pv).toEqual([]);
  });
});
