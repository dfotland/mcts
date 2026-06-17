import type { GameEngine } from '../../contracts/game-engine';
import type { Outcome, PhaseId, PlayerId, SerializedGameState } from '../../contracts/player';
import { createMove, parseMoveKey, type TicTacToeMove } from './move';
import {
  deserializeTicTacToeState,
  isTerminalState,
  outcomeForPlayer,
  type TicTacToeState,
} from './state';

export const TIC_TAC_TOE_GAME_ID = 'tic-tac-toe';

export class TicTacToeEngine implements GameEngine<TicTacToeState, TicTacToeMove> {
  readonly gameId = TIC_TAC_TOE_GAME_ID;

  createState(payload: SerializedGameState): TicTacToeState {
    return deserializeTicTacToeState(payload);
  }

  isTerminal(state: TicTacToeState): boolean {
    return isTerminalState(state);
  }

  getOutcome(state: TicTacToeState, perspectivePlayer: PlayerId): Outcome {
    return outcomeForPlayer(state, perspectivePlayer);
  }

  getCurrentPlayer(state: TicTacToeState): PlayerId {
    return state.currentPlayer;
  }

  getCurrentPhase(state: TicTacToeState): PhaseId {
    void state;
    return 'main';
  }

  getMoveByKey(state: TicTacToeState, key: string): TicTacToeMove | undefined {
    const parsed = parseMoveKey(key);
    if (parsed === null) return undefined;
    if (parsed.player !== state.currentPlayer) return undefined;
    if (state.board.get(parsed.row, parsed.col) !== null) return undefined;
    return createMove(parsed.player, parsed.row, parsed.col);
  }
}

export const ticTacToeEngine = new TicTacToeEngine();
