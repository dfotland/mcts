import type { GameRegistry } from '../../worker/registry';
import { quartoEngine, QUARTO_GAME_ID } from './engine';
import { quartoBasicSearch, quartoUniformSearch } from './search-functions';

export function registerQuarto(registry: GameRegistry): void {
  registry.register({
    gameId: QUARTO_GAME_ID,
    engine: quartoEngine,
    heuristics: {
      uniform: quartoUniformSearch,
      basic: quartoBasicSearch,
      'quarto-basic': quartoBasicSearch,
      'quarto-standard': quartoBasicSearch,
    },
  });
}
