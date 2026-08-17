import type { SerializedSearchParameters } from '../contracts/player';
import type { SearchParams } from '../contracts/search-params';

const DEFAULT_MAX_ITERATIONS = Number.MAX_SAFE_INTEGER;

export class SearchParameters implements SearchParams {
  explorationConstant: number;
  maxIterations: number;
  maxRolloutPlies: number;
  selectionPolicy: 'robust' | 'maxValue';
  stopPollInterval: number;
  seed: number;
  heuristicId: string;

  /** Log every N iterations when a logger is attached. Default: 0 (end only). */
  logInterval: number;

  /** Emit and console-log the robust principal variation after search. */
  logPrincipalVariation: boolean;

  /** Collect per-phase timings and counters in `SearchStatistics.profile`. */
  profileSearch: boolean;

  constructor(options?: Partial<SearchParameters>) {
    this.explorationConstant = options?.explorationConstant ?? Math.SQRT2;
    this.maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxRolloutPlies = options?.maxRolloutPlies ?? 200;
    this.selectionPolicy = options?.selectionPolicy ?? 'robust';
    this.stopPollInterval = options?.stopPollInterval ?? 32;
    this.seed = options?.seed ?? 0;
    this.heuristicId = options?.heuristicId ?? 'uniform';
    this.logInterval = options?.logInterval ?? 0;
    this.logPrincipalVariation = options?.logPrincipalVariation ?? true;
    this.profileSearch = options?.profileSearch ?? false;
  }

  serialize(): SerializedSearchParameters {
    return {
      explorationConstant: this.explorationConstant,
      maxIterations: this.maxIterations,
      maxRolloutPlies: this.maxRolloutPlies,
      selectionPolicy: this.selectionPolicy,
      stopPollInterval: this.stopPollInterval,
      seed: this.seed,
      heuristicId: this.heuristicId,
      logInterval: this.logInterval,
      logPrincipalVariation: this.logPrincipalVariation,
      profileSearch: this.profileSearch,
    };
  }

  static deserialize(payload: SerializedSearchParameters): SearchParameters {
    return new SearchParameters({
      explorationConstant: payload.explorationConstant as number | undefined,
      maxIterations: payload.maxIterations as number | undefined,
      maxRolloutPlies: payload.maxRolloutPlies as number | undefined,
      selectionPolicy: payload.selectionPolicy as 'robust' | 'maxValue' | undefined,
      stopPollInterval: payload.stopPollInterval as number | undefined,
      seed: payload.seed as number | undefined,
      heuristicId: payload.heuristicId as string | undefined,
      logInterval: payload.logInterval as number | undefined,
      logPrincipalVariation: payload.logPrincipalVariation as boolean | undefined,
      profileSearch: payload.profileSearch as boolean | undefined,
    });
  }
}
