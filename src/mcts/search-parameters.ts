import type { SerializedSearchParameters } from '../contracts/player';
import type { SearchParams } from '../contracts/search-params';

const DEFAULT_MAX_ITERATIONS = Number.MAX_SAFE_INTEGER;

export class SearchParameters implements SearchParams {
  explorationConstant: number;
  maxIterations: number;
  maxRolloutPlies: number;
  selectionPolicy: 'robust' | 'maxValue';
  movePriorWeight: number;
  stopPollInterval: number;
  seed: number;
  rootPlayer?: import('../contracts/player').PlayerId;
  heuristicId: string;

  /** Log every N iterations when a logger is attached. Default: 0 (end only). */
  logInterval: number;

  /** Emit and console-log the robust principal variation after search. */
  logPrincipalVariation: boolean;

  constructor(options?: Partial<SearchParameters>) {
    this.explorationConstant = options?.explorationConstant ?? Math.SQRT2;
    this.maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxRolloutPlies = options?.maxRolloutPlies ?? 200;
    this.selectionPolicy = options?.selectionPolicy ?? 'robust';
    this.movePriorWeight = options?.movePriorWeight ?? 0;
    this.stopPollInterval = options?.stopPollInterval ?? 32;
    this.seed = options?.seed ?? 0;
    this.rootPlayer = options?.rootPlayer;
    this.heuristicId = options?.heuristicId ?? 'uniform';
    this.logInterval = options?.logInterval ?? 0;
    this.logPrincipalVariation = options?.logPrincipalVariation ?? true;
  }

  serialize(): SerializedSearchParameters {
    return {
      explorationConstant: this.explorationConstant,
      maxIterations: this.maxIterations,
      maxRolloutPlies: this.maxRolloutPlies,
      selectionPolicy: this.selectionPolicy,
      movePriorWeight: this.movePriorWeight,
      stopPollInterval: this.stopPollInterval,
      seed: this.seed,
      rootPlayer: this.rootPlayer,
      heuristicId: this.heuristicId,
      logInterval: this.logInterval,
      logPrincipalVariation: this.logPrincipalVariation,
    };
  }

  static deserialize(payload: SerializedSearchParameters): SearchParameters {
    return new SearchParameters({
      explorationConstant: payload.explorationConstant as number | undefined,
      maxIterations: payload.maxIterations as number | undefined,
      maxRolloutPlies: payload.maxRolloutPlies as number | undefined,
      selectionPolicy: payload.selectionPolicy as 'robust' | 'maxValue' | undefined,
      movePriorWeight: payload.movePriorWeight as number | undefined,
      stopPollInterval: payload.stopPollInterval as number | undefined,
      seed: payload.seed as number | undefined,
      rootPlayer: payload.rootPlayer as import('../contracts/player').PlayerId | undefined,
      heuristicId: payload.heuristicId as string | undefined,
      logInterval: payload.logInterval as number | undefined,
      logPrincipalVariation: payload.logPrincipalVariation as boolean | undefined,
    });
  }
}
