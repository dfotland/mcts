import type { GameEngine } from '../../contracts/game-engine';
import type { Outcome, PhaseId, PlayerId, SerializedGameState } from '../../contracts/player';
import { makeMoveFromKey } from './search-functions';
import { type QuartoMove } from './move';
import {
  deserializeQuartoState,
  isTerminalState,
  outcomeForPlayer,
  type QuartoState,
} from './state';

export const QUARTO_GAME_ID = 'quarto';

export class QuartoEngine implements GameEngine<QuartoState, QuartoMove> {
  readonly gameId = QUARTO_GAME_ID;

  createState(payload: SerializedGameState): QuartoState {
    return deserializeQuartoState(payload);
  }

  isTerminal(state: QuartoState): boolean {
    return isTerminalState(state);
  }

  getOutcome(state: QuartoState, perspectivePlayer: PlayerId): Outcome {
    return outcomeForPlayer(state, perspectivePlayer);
  }

  getCurrentPlayer(state: QuartoState): PlayerId {
    return state.currentPlayer;
  }

  getCurrentPhase(state: QuartoState): PhaseId {
    return state.currentPhase;
  }

  getMoveByKey(state: QuartoState, key: string): QuartoMove | undefined {
    return makeMoveFromKey(state, key) ?? undefined;
  }
}

export const quartoEngine = new QuartoEngine();
