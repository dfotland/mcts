import type { GameRegistry } from '../../worker/registry';
import { ticTacToeEngine, TIC_TAC_TOE_GAME_ID } from './engine';
import { ticTacToeBasicSearch, ticTacToeUniformSearch } from './search-functions';

export function registerTicTacToe(registry: GameRegistry): void {
  registry.register({
    gameId: TIC_TAC_TOE_GAME_ID,
    engine: ticTacToeEngine,
    heuristics: {
      uniform: ticTacToeUniformSearch,
      basic: ticTacToeBasicSearch,
    },
  });
}
