/** Allowed heuristic stddev. Smaller = more confident prior (more pseudo-trials). */
export const HEURISTIC_STDDEV_MIN = 0.1;
export const HEURISTIC_STDDEV_MAX = 0.35;
/** Weak-prior default when a game does not set stddev (uniform / unknown). */
export const HEURISTIC_STDDEV_DEFAULT = HEURISTIC_STDDEV_MAX;
const PSEUDO_TRIALS_FLOOR = 1e-6;

export interface BetaBinomialPrior {
  /** α = p * n0. Fractional; same units as backed-up wins. */
  pseudoWins: number;
  /** n0 = α + β. Fractional virtual visit count. */
  pseudoTrials: number;
}

/**
 * Map a game heuristic (P(win) `p` and stddev `σ`) to a Beta prior, expressed as
 * fractional pseudo-wins and pseudo-trials.
 *
 * A Beta(α, β) prior on a Bernoulli win rate has
 *   mean     μ = α / (α + β) = p
 *   variance σ² = μ(1-μ) / (α + β + 1)
 * so
 *   n0 = p * (1 - p) / σ² - 1    // pseudo-trials
 *   α  = p * n0                  // pseudo-wins
 *
 * `n0` is how many virtual rollouts the heuristic is worth. At p = 0.5,
 * σ = 0.1 → n0 ≈ 24; σ = 0.35 → n0 ≈ 1. UCT then uses
 *   Q = (W + α) / (n + n0)
 * so rollouts and the heuristic share the same units. Small σ (forced win/loss)
 * holds Q near p until many real visits accumulate; large σ yields quickly.
 *
 * This replaces additive / decaying H bonuses (`w*H`, `W*H/(n+1)`). Those are
 * not win rates: `w*H` never decays, and progressive bias decays but is not a
 * conjugate prior. H is a value estimate, not a policy P(a).
 *
 * σ is clamped to [0.1, 0.35]. If p is near 0 or 1, p(1-p)/σ² - 1 can be
 * negative (that σ is wider than a Bernoulli at that mean). In that case n0
 * falls back to the p = 0.5 strength at the same σ, so a forced win with
 * σ = 0.1 still counts as ~24 virtual trials, not a weak prior.
 */
export function betaBinomialPrior(p: number, sigma: number): BetaBinomialPrior {
  const mean = Math.min(1, Math.max(0, p));
  const stddev = Math.min(HEURISTIC_STDDEV_MAX, Math.max(HEURISTIC_STDDEV_MIN, sigma));
  const variance = mean * (1 - mean);
  const sigmaSq = stddev * stddev;
  let pseudoTrials = variance / sigmaSq - 1;
  if (pseudoTrials < PSEUDO_TRIALS_FLOOR) {
    pseudoTrials = Math.max(PSEUDO_TRIALS_FLOOR, 0.25 / sigmaSq - 1);
  }
  return {
    pseudoWins: mean * pseudoTrials,
    pseudoTrials,
  };
}

/** Parent-visit count and exploration constant for UCT. */
export interface UctParams {
  parentVisits: number;
  explorationConstant: number;
}

export interface UctTerms {
  heuristicValue: number;
  heuristicStdDev: number;
  pseudoWins: number;
  pseudoTrials: number;
  /** Bayesian Q: (W + α) / (n + n0), parent-perspective. */
  q: number;
  /** `C * sqrt(ln(N) / n)` on real visits only. */
  exploration: number;
  /** Q + U */
  score: number;
}

/**
 * UCT terms for a visited child.
 * `empiricalParentWins` is already parent-perspective (`wins`, or `visits - wins`
 * when side-to-move flips). Heuristic `p` is P(win) for the mover — also
 * parent-perspective — so the Beta prior is not flipped.
 */
export function uctTerms(
  empiricalParentWins: number,
  childVisits: number,
  heuristicValue: number,
  heuristicStdDev: number,
  params: UctParams,
): UctTerms {
  const { pseudoWins, pseudoTrials } = betaBinomialPrior(heuristicValue, heuristicStdDev);
  const q = (empiricalParentWins + pseudoWins) / (childVisits + pseudoTrials);
  const exploration =
    params.explorationConstant * Math.sqrt(Math.log(params.parentVisits) / childVisits);
  return {
    heuristicValue,
    heuristicStdDev,
    pseudoWins,
    pseudoTrials,
    q,
    exploration,
    score: q + exploration,
  };
}
