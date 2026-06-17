import type { GameState } from '../../contracts/game-state';
import type { Outcome, PhaseId, PlayerId, SerializedGameState } from '../../contracts/player';
import { TicTacToeBoard, findWinner, isBoardFull } from './board';
import type { TicTacToePhase } from './move';

export interface TicTacToeState extends GameState<TicTacToeBoard> {
  readonly board: TicTacToeBoard;
  readonly currentPlayer: PlayerId;
  readonly currentPhase: TicTacToePhase;
}

export function createTicTacToeState(
  board?: TicTacToeBoard,
  currentPlayer: PlayerId = 0,
): TicTacToeState {
  const b = board ?? new TicTacToeBoard();
  return {
    board: b,
    currentPlayer,
    currentPhase: 'main',
    clone() {
      return createTicTacToeState(this.board.clone(), this.currentPlayer);
    },
    serialize() {
      return {
        cells: this.board.cells,
        currentPlayer: this.currentPlayer,
        currentPhase: this.currentPhase,
      };
    },
  };
}

export function deserializeTicTacToeState(payload: SerializedGameState): TicTacToeState {
  const cells = payload.cells as TicTacToeBoard['cells'];
  const currentPlayer = (payload.currentPlayer as PlayerId | undefined) ?? 0;
  return createTicTacToeState(new TicTacToeBoard(cells), currentPlayer);
}

export function getWinner(state: TicTacToeState): PlayerId | null {
  return findWinner(state.board);
}

export function isTerminalState(state: TicTacToeState): boolean {
  return getWinner(state) !== null || isBoardFull(state.board);
}

export function outcomeForPlayer(state: TicTacToeState, perspectivePlayer: PlayerId): Outcome {
  if (!isTerminalState(state)) {
    throw new Error('outcomeForPlayer called on non-terminal tic-tac-toe state');
  }

  const winner = getWinner(state);
  if (winner === null) return 0;
  return winner === perspectivePlayer ? 1 : -1;
}

export function nextPlayer(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

export function currentPhase(): PhaseId {
  return 'main';
}
