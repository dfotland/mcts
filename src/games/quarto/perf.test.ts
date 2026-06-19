import { describe, expect, it } from 'vitest';

import { neverStop } from '../../contracts/stop-signal';
import { MCTSEngine, SearchParameters } from '../../mcts';
import { quartoEngine } from './engine';
import { QUARTO_POSITIONS } from './fixtures';
import { quartoBasicSearch } from './search-functions';

const engine = new MCTSEngine(quartoEngine);

describe('Quarto search performance', () => {
  it(
    'profiles phase breakdown for an opening give search',
    () => {
      const outcome = engine.search(
        {
          state: QUARTO_POSITIONS.openingGive(0),
          params: new SearchParameters({
            maxIterations: 150,
            seed: 7,
            heuristicId: 'quarto-basic',
            maxRolloutPlies: 24,
            profileSearch: true,
            logPrincipalVariation: false,
          }),
          functions: quartoBasicSearch,
        },
        neverStop,
      );

      const profile = outcome.statistics.profile;
      expect(profile).toBeDefined();
      expect(profile!.iterationsPerSecond).toBeGreaterThan(0);
      expect(profile!.rollout.plies).toBeGreaterThan(0);
      expect(profile!.rollout.generateRolloutMoveCalls).toBe(profile!.rollout.plies);
      expect(profile!.rollout.applyMoveCalls).toBe(profile!.rollout.plies);
      expect(profile!.rollout.share).toBeGreaterThan(profile!.selection.share);
    },
    20_000,
  );
});
