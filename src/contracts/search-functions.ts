import type { GameState } from './game-state';
import type { Move } from './move';
import type { PlayerId } from './player';

export interface SearchFunctions<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  generateMoves(state: S, perspectivePlayer: PlayerId): M[];
  /**
   * Pick one legal move for rollout simulation. Returns null when no legal moves remain.
   * Use `rng` (search PRNG) for stochastic choice — not Math.random().
   */
  generateRolloutMove(
    state: S,
    perspectivePlayer: PlayerId,
    rng: () => number,
  ): M | null;
  evaluatePosition(state: S, perspectivePlayer: PlayerId): number;
  /** Returns a new state copy for tree expansion. */
  makeMove(state: S, move: M): S;
  /**
   * Applies a move to `state` in place. Used only on rollout scratch copies
   * (`startNode.state.clone()`); tree nodes always use `makeMove`.
   */
  applyMove(state: S, move: M): void;
}
