import type { GameState } from './game-state';
import type { Move } from './move';
import type { PhaseId, PlayerId, SerializedGameState } from './player';

/** Terminal detection and exact outcomes — not move generation. */
export interface GameEngine<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  createState(payload: SerializedGameState): S;
  isTerminal(state: S): boolean;
  /** Throws if state is not terminal. */
  getOutcome(state: S, perspectivePlayer: PlayerId): import('./player').Outcome;
  getCurrentPlayer(state: S): PlayerId;
  getCurrentPhase(state: S): PhaseId;
  getMoveByKey?(state: S, key: string): M | undefined;
}
