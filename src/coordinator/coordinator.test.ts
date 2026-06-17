import { describe, expect, it } from 'vitest';

import { SearchParameters } from '../mcts';
import { MCTSSearchCoordinator } from './mcts-search-coordinator';
import {
  createInProcessWorkerPort,
  GameRegistry,
} from '../worker';
import { registerTicTacToe } from '../games/tic-tac-toe/register';
import { ticTacToeCoordinatorAdapter } from '../games/tic-tac-toe/coordinator-adapter';
import { TTT_POSITIONS } from '../games/tic-tac-toe/fixtures';

function createTestCoordinator() {
  const registry = new GameRegistry();
  registerTicTacToe(registry);
  const port = createInProcessWorkerPort(registry);
  const coordinator = new MCTSSearchCoordinator(port, ticTacToeCoordinatorAdapter);
  return { coordinator, port };
}

describe('MCTSSearchCoordinator', () => {
  it('finds a winning move through the worker path', async () => {
    const { coordinator } = createTestCoordinator();
    await coordinator.ready;

    const result = await coordinator.computeMove({
      state: TTT_POSITIONS.xWinInOne().serialize(),
      params: new SearchParameters({ maxIterations: 300, seed: 7, heuristicId: 'basic' }),
    });

    expect(result.interrupted).toBe(false);
    expect(result.moves).toHaveLength(1);
    expect(result.moves[0]!.moveKey).toBe('main:0:0,2');
    expect(result.totalIterations).toBeGreaterThan(0);
  });

  it('blocks a one-ply loss through the worker path', async () => {
    const { coordinator } = createTestCoordinator();
    await coordinator.ready;

    const result = await coordinator.computeMove({
      state: TTT_POSITIONS.xBlockInOne().serialize(),
      params: new SearchParameters({ maxIterations: 300, seed: 7, heuristicId: 'basic' }),
    });

    expect(result.moves[0]!.moveKey).toBe('main:0:0,2');
  });

  it('ends search early when timeLimitMs is reached', async () => {
    const { coordinator } = createTestCoordinator();
    await coordinator.ready;

    const started = performance.now();
    const result = await coordinator.computeMove({
      state: TTT_POSITIONS.empty().serialize(),
      params: new SearchParameters({
        maxIterations: 1_000_000,
        seed: 1,
        stopPollInterval: 32,
        heuristicId: 'basic',
      }),
      timeLimitMs: 50,
    });
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(500);
    expect(result.moves[0]!.stopped).toBe(true);
    expect(result.moves[0]!.iterations).toBeGreaterThan(0);
  });

  it('applies resulting state after the move', async () => {
    const { coordinator } = createTestCoordinator();
    await coordinator.ready;

    const start = TTT_POSITIONS.xWinInOne().serialize();
    const result = await coordinator.computeMove({
      state: start,
      params: new SearchParameters({ maxIterations: 200, seed: 3, heuristicId: 'basic' }),
    });

    expect(result.resultingState).not.toEqual(start);
    expect(ticTacToeCoordinatorAdapter.isTerminal(result.resultingState)).toBe(true);
  });
});
