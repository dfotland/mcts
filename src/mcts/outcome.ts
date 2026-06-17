import type { Outcome } from '../contracts/player';

export function outcomeToValue(outcome: Outcome): number {
  if (outcome === 1) return 1;
  if (outcome === 0) return 0.5;
  return 0;
}
