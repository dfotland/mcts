import { describe, expect, it } from 'vitest';

import { SearchParameters } from './search-parameters';
import { progressiveBiasTerm, uctTerms } from './uct';

describe('progressiveBiasTerm', () => {
  it('is zero when weight is 0', () => {
    expect(progressiveBiasTerm(1, 0, 0)).toBe(0);
  });

  it('equals W*H at zero visits and halves after the first visit', () => {
    expect(progressiveBiasTerm(1, 0, 2)).toBe(2);
    expect(progressiveBiasTerm(1, 1, 2)).toBe(1);
  });

  it('decays toward 0 as visits grow', () => {
    const early = progressiveBiasTerm(0.8, 1, 1);
    const late = progressiveBiasTerm(0.8, 99, 1);
    expect(late).toBeLessThan(early);
    expect(late).toBeCloseTo(0.8 / 100);
  });
});

describe('SearchParameters progressiveBiasWeight', () => {
  it('defaults to 0 and round-trips through serialize', () => {
    expect(new SearchParameters().progressiveBiasWeight).toBe(0);
    const params = new SearchParameters({ progressiveBiasWeight: 1.5, seed: 3 });
    const again = SearchParameters.deserialize(params.serialize());
    expect(again.progressiveBiasWeight).toBe(1.5);
  });
});

describe('uctTerms', () => {
  it('sums Q, exploration, progressive bias, and move prior', () => {
    const terms = uctTerms(0.6, 4, 0.8, {
      parentVisits: 20,
      explorationConstant: Math.SQRT2,
      movePriorWeight: 0.5,
      progressiveBiasWeight: 1,
    });
    expect(terms.q).toBe(0.6);
    expect(terms.heuristicValue).toBe(0.8);
    expect(terms.exploration).toBeCloseTo(Math.SQRT2 * Math.sqrt(Math.log(20) / 4));
    expect(terms.progressiveBias).toBeCloseTo(0.8 / 5);
    expect(terms.movePrior).toBeCloseTo(0.4);
    expect(terms.score).toBeCloseTo(
      terms.q + terms.exploration + terms.progressiveBias + terms.movePrior,
    );
  });
});
