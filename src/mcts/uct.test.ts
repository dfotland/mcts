import { describe, expect, it } from 'vitest';

import { SearchParameters } from './search-parameters';
import { progressiveBiasTerm } from './uct';

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
