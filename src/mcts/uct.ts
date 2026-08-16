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
