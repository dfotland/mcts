import type { GameCoordinatorAdapter } from '../../contracts/coordinator';
import type { SerializedMove } from '../../contracts/player';
import { TIC_TAC_TOE_GAME_ID } from './engine';
import { createMove, parseMoveKey } from './move';
import { deserializeTicTacToeState, isTerminalState } from './state';
import { ticTacToeBasicSearch } from './search-functions';

function moveFromSerialized(move: SerializedMove) {
  const parsed = parseMoveKey(String(move.key));
  if (parsed !== null) {
    return createMove(parsed.player, parsed.row, parsed.col);
  }

  const row = move.row as number | undefined;
  const col = move.col as number | undefined;
  const player = move.player as 0 | 1 | undefined;
  if (row !== undefined && col !== undefined && (player === 0 || player === 1)) {
    return createMove(player, row, col);
  }

  throw new Error(`Invalid tic-tac-toe move payload: ${JSON.stringify(move)}`);
}

export const ticTacToeCoordinatorAdapter: GameCoordinatorAdapter = {
  gameId: TIC_TAC_TOE_GAME_ID,
  maxPliesPerTurn: 1,

  getCurrentPhase() {
    return 'main';
  },

  getCurrentPlayer(state) {
    return deserializeTicTacToeState(state).currentPlayer;
  },

  applyMove(state, move) {
    const gameState = deserializeTicTacToeState(state);
    const gameMove = moveFromSerialized(move);
    return ticTacToeBasicSearch.makeMove(gameState, gameMove).serialize();
  },

  isTerminal(state) {
    return isTerminalState(deserializeTicTacToeState(state));
  },

  isTurnComplete() {
    return true;
  },
};
