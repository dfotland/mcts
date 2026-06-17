import type { Board } from './board';
import type { PhaseId, PlayerId, SerializedGameState } from './player';

/** Complete state needed to generate legal moves and detect terminal outcomes. */
export interface GameState<B extends Board = Board> {
  readonly board: B;
  readonly currentPlayer: PlayerId;
  readonly currentPhase: PhaseId;

  clone(): GameState<B>;
  serialize(): SerializedGameState;
}

export interface GameStateConstructor<B extends Board = Board, S extends GameState<B> = GameState<B>> {
  deserialize(payload: SerializedGameState): S;
}
