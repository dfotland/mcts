import { describe, expect, it } from 'vitest';

import { neverStop, MutableStopSignal } from '../../contracts/stop-signal';
import { MCTSEngine, SearchParameters } from '../../mcts';
import { formatBoard } from './board';
import { ticTacToeEngine } from './engine';
import { TTT_POSITIONS } from './fixtures';
import { ticTacToeBasicSearch } from './search-functions';

const engine = new MCTSEngine(ticTacToeEngine);

function search(
  state: ReturnType<typeof TTT_POSITIONS.empty>,
  overrides?: Partial<SearchParameters>,
) {
  const params = new SearchParameters({
    maxIterations: 300,
    seed: 7,
    heuristicId: 'basic',
    stopPollInterval: 16,
    logInterval: 0,
    ...overrides,
  });

  return engine.search(
    {
      state,
      params,
      functions: ticTacToeBasicSearch,
    },
    neverStop,
  );
}

describe('MCTSEngine + tic-tac-toe', () => {
  it('finds a one-ply winning move for X', () => {
    const outcome = search(TTT_POSITIONS.xWinInOne());
    expect(outcome.bestMove?.key).toBe('main:0:0,2');
    expect(outcome.bestMove?.row).toBe(0);
    expect(outcome.bestMove?.col).toBe(2);
  });

  it('blocks a one-ply loss for X', () => {
    const outcome = search(TTT_POSITIONS.xBlockInOne());
    expect(outcome.bestMove?.key).toBe('main:0:0,2');
  });

  it('is reproducible with the same seed and iteration count', () => {
    const state = TTT_POSITIONS.empty();
    const params = { maxIterations: 100, seed: 99 };

    const a = search(state, params);
    const b = search(state, params);

    expect(a.bestMove?.key).toBe(b.bestMove?.key);
    expect(a.iterations).toBe(b.iterations);
  });

  it('stops at the next poll boundary when stop signal is set', () => {
    const stop = new MutableStopSignal();
    stop.stop();

    const outcome = engine.search(
      {
        state: TTT_POSITIONS.empty(),
        params: new SearchParameters({
          maxIterations: 10_000,
          seed: 1,
          stopPollInterval: 32,
        }),
        functions: ticTacToeBasicSearch,
      },
      stop,
    );

    expect(outcome.stopped).toBe(true);
    expect(outcome.iterations).toBe(32);
  });

  it('reports child stats from root perspective', () => {
    const outcome = search(TTT_POSITIONS.xWinInOne(), { maxIterations: 200, seed: 3 });
    const winChild = outcome.children.find((c) => c.move.key === 'main:0:0,2');
    expect(winChild).toBeDefined();
    expect(winChild!.visits).toBeGreaterThan(0);
    expect(winChild!.winRate).toBeGreaterThan(0.5);
  });

  it('reports search tree statistics', () => {
    const outcome = search(TTT_POSITIONS.xWinInOne(), { maxIterations: 200, seed: 3, logPrincipalVariation: false });

    expect(outcome.statistics.nodesExpanded).toBeGreaterThan(0);
    expect(outcome.statistics.maxDepth).toBeGreaterThan(0);
    expect(outcome.statistics.bestMoveWinRate).not.toBeNull();
    expect(outcome.statistics.bestMoveWinRate).toBeGreaterThan(0.5);
    expect(outcome.principalVariation.length).toBeGreaterThan(0);
    expect(outcome.children[0]!.wins).toBeGreaterThanOrEqual(0);
  });
});

describe('board formatting', () => {
  it('renders X and O for logging', () => {
    const text = formatBoard(TTT_POSITIONS.xWinInOne().board);
    expect(text).toContain('X X .');
  });
});
