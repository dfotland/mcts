import { describe, expect, it } from 'vitest';

import { SearchParameters } from './search-parameters';
import { betaBinomialPrior, uctTerms } from './uct';

describe('betaBinomialPrior', () => {
  it('maps p=0.5, σ=0.1 to about 24 pseudo-trials', () => {
    const prior = betaBinomialPrior(0.5, 0.1);
    expect(prior.pseudoTrials).toBeCloseTo(24);
    expect(prior.pseudoWins).toBeCloseTo(12);
  });

  it('maps p=0.5, σ=0.35 to about 1 pseudo-trial', () => {
    const prior = betaBinomialPrior(0.5, 0.35);
    expect(prior.pseudoTrials).toBeCloseTo(0.25 / (0.35 * 0.35) - 1);
    expect(prior.pseudoWins).toBeCloseTo(0.5 * prior.pseudoTrials);
  });

  it('keeps a forced win (p=1, σ=0.1) as a strong prior', () => {
    const prior = betaBinomialPrior(1, 0.1);
    expect(prior.pseudoTrials).toBeCloseTo(24);
    expect(prior.pseudoWins).toBeCloseTo(24);
  });
});

describe('SearchParameters', () => {
  it('round-trips through serialize without UCT prior weights', () => {
    const params = new SearchParameters({ seed: 3, explorationConstant: 1.4 });
    const again = SearchParameters.deserialize(params.serialize());
    expect(again.seed).toBe(3);
    expect(again.explorationConstant).toBe(1.4);
    expect(params.serialize()).not.toHaveProperty('movePriorWeight');
    expect(params.serialize()).not.toHaveProperty('progressiveBiasWeight');
  });
});

describe('uctTerms', () => {
  it('mixes the Beta prior into Bayesian Q and adds exploration on real visits', () => {
    const p = 0.5;
    const sigma = 0.1;
    const { pseudoWins, pseudoTrials } = betaBinomialPrior(p, sigma);
    const empiricalWins = 6;
    const visits = 10;
    const terms = uctTerms(empiricalWins, visits, p, sigma, {
      parentVisits: 20,
      explorationConstant: Math.SQRT2,
    });
    expect(terms.q).toBeCloseTo((empiricalWins + pseudoWins) / (visits + pseudoTrials));
    expect(terms.heuristicValue).toBe(p);
    expect(terms.heuristicStdDev).toBe(sigma);
    expect(terms.pseudoTrials).toBeCloseTo(24);
    expect(terms.exploration).toBeCloseTo(Math.SQRT2 * Math.sqrt(Math.log(20) / visits));
    expect(terms.score).toBeCloseTo(terms.q + terms.exploration);
  });
});
