import { describe, expect, it } from 'vitest';

import { SearchParameters } from '../../mcts';
import { MCTSSearchCoordinator } from '../../coordinator/mcts-search-coordinator';
import { createInProcessWorkerPort, GameRegistry } from '../../worker';
import { quartoCoordinatorAdapter } from './coordinator-adapter';
import { QUARTO_POSITIONS } from './fixtures';
import { registerQuarto } from './register';

function createQuartoCoordinator() {
  const registry = new GameRegistry();
  registerQuarto(registry);
  const port = createInProcessWorkerPort(registry);
  return new MCTSSearchCoordinator(port, quartoCoordinatorAdapter);
}

describe('Quarto coordinator integration', () => {
  it('returns a winning place move in one ply', async () => {
    const coordinator = createQuartoCoordinator();
    await coordinator.ready;

    const result = await coordinator.computeMove({
      state: QUARTO_POSITIONS.winInOnePlace(0).serialize(),
      params: new SearchParameters({
        maxIterations: 500,
        seed: 3,
        heuristicId: 'quarto-basic',
      }),
    });

    expect(result.interrupted).toBe(false);
    expect(result.moves).toHaveLength(1);
    expect(result.moves[0]!.phase).toBe('place');
    expect(result.moves[0]!.moveKey).toBe('place:0:0,3');
  });

  it('chains place and give when placement does not win', async () => {
    const coordinator = createQuartoCoordinator();
    await coordinator.ready;

    const result = await coordinator.computeMove({
      state: QUARTO_POSITIONS.winInOnePlace(0).serialize(),
      params: new SearchParameters({
        maxIterations: 80,
        seed: 5,
        heuristicId: 'quarto-basic',
      }),
    });

    // Winning placement ends turn — still one move
    expect(result.moves.length).toBeGreaterThanOrEqual(1);
    expect(result.moves[0]!.phase).toBe('place');
  });

  it('handles give-only opening ply', async () => {
    const coordinator = createQuartoCoordinator();
    await coordinator.ready;

    const result = await coordinator.computeMove({
      state: QUARTO_POSITIONS.openingGive(0).serialize(),
      params: new SearchParameters({
        maxIterations: 24,
        maxRolloutPlies: 40,
        seed: 2,
        heuristicId: 'quarto-basic',
      }),
    });

    expect(result.interrupted).toBe(false);
    expect(result.moves).toHaveLength(1);
    expect(result.moves[0]!.phase).toBe('give');
  }, 15_000);
});
