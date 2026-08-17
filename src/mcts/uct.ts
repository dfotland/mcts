/**
 * Chaslot progressive bias: `W * H / (n + 1)`.
 * `H` is P(win) for the mover; the bonus decays as visits grow.
 */
export function progressiveBiasTerm(
  heuristicValue: number,
  visits: number,
  weight: number,
): number {
  if (weight <= 0) return 0;
  return (weight * heuristicValue) / (visits + 1);
}

/** Weights used to score a child with the UCT formula. */
export interface UctParams {
  parentVisits: number;
  explorationConstant: number;
  movePriorWeight: number;
  progressiveBiasWeight: number;
}

export interface UctTerms {
  heuristicValue: number;
  /** Exploitation Q (parent-perspective win rate). */
  q: number;
  /** `C * sqrt(ln(N) / n)` */
  exploration: number;
  /** `W * H / (n + 1)` */
  progressiveBias: number;
  /** `w * H` */
  movePrior: number;
  /** Q + U + bias + prior */
  score: number;
}

/**
 * UCT terms for a visited child. `q` is already the parent-perspective
 * exploitation value (`wins/visits`, or `1 - wins/visits` when side-to-move flips).
 */
export function uctTerms(
  q: number,
  childVisits: number,
  heuristicValue: number,
  params: UctParams,
): UctTerms {
  const exploration =
    params.explorationConstant * Math.sqrt(Math.log(params.parentVisits) / childVisits);
  const movePrior = params.movePriorWeight > 0 ? params.movePriorWeight * heuristicValue : 0;
  const progressiveBias = progressiveBiasTerm(
    heuristicValue,
    childVisits,
    params.progressiveBiasWeight,
  );
  return {
    heuristicValue,
    q,
    exploration,
    progressiveBias,
    movePrior,
    score: q + exploration + progressiveBias + movePrior,
  };
}
