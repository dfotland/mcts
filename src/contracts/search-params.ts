import type { PlayerId } from './player';

/** Algorithm settings shape — implemented by `SearchParameters` class. */
export interface SearchParams {
  explorationConstant: number;
  maxIterations: number;
  maxRolloutPlies: number;
  selectionPolicy: 'robust' | 'maxValue';
  movePriorWeight: number;
  stopPollInterval: number;
  seed: number;
  rootPlayer?: PlayerId;
  heuristicId: string;
  /** Log every N iterations when a logger is attached. 0 = end only. */
  logInterval?: number;
  /** Log principal variation (and emit in search outcome). Default: true. */
  logPrincipalVariation?: boolean;
}
