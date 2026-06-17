import type { GameState } from './game-state';
import type { Move } from './move';
import type { SearchFunctions } from './search-functions';
import type { SearchLogger } from './search-logger';
import type { SearchParams } from './search-params';

export interface SearchInput<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  state: S;
  params: SearchParams;
  functions: SearchFunctions<S, M>;
  logger?: SearchLogger;
}
