import type { GameEngine } from '../contracts/game-engine';
import type { GameState } from '../contracts/game-state';
import type { Move } from '../contracts/move';
import type { SearchFunctions } from '../contracts/search-functions';

export interface GameAdapter<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  gameId: string;
  engine: GameEngine<S, M>;
  heuristics: Record<string, SearchFunctions<S, M>>;
}

export class GameRegistry {
  private readonly adapters = new Map<string, GameAdapter>();

  register(adapter: GameAdapter): void {
    this.adapters.set(adapter.gameId, adapter);
  }

  get(gameId: string): GameAdapter | undefined {
    return this.adapters.get(gameId);
  }

  gameIds(): string[] {
    return [...this.adapters.keys()];
  }
}

export function resolveSearchFunctions(
  registry: GameRegistry,
  gameId: string,
  heuristicId: string,
): SearchFunctions {
  const adapter = registry.get(gameId);
  if (adapter === undefined) {
    throw new Error(`Unknown game: ${gameId}`);
  }

  const bundle =
    adapter.heuristics[heuristicId] ??
    adapter.heuristics.uniform ??
    Object.values(adapter.heuristics)[0];
  if (bundle === undefined) {
    throw new Error(`Unknown heuristic "${heuristicId}" for game ${gameId}`);
  }

  return bundle;
}
