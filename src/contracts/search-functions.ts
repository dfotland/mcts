import type { GameState } from './game-state';
import type { Move } from './move';
import type { PlayerId } from './player';

/** Result of `generateRolloutMove` — bare move or move plus terminal hint after apply. */
export type RolloutMovePick<M extends Move = Move> =
  | M
  | { move: M; terminalAfterApply: boolean };

export function normalizeRolloutPick<M extends Move>(pick: RolloutMovePick<M>): {
  move: M;
  terminalAfterApply: boolean;
} {
  if (
    typeof pick === 'object' &&
    pick !== null &&
    'terminalAfterApply' in pick &&
    'move' in pick
  ) {
    return pick as { move: M; terminalAfterApply: boolean };
  }
  return { move: pick as M, terminalAfterApply: false };
}

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
  ): RolloutMovePick<M> | null;
  /** Lightweight terminal check for rollout simulation only. */
  isRolloutTerminal(state: S): boolean;
  evaluatePosition(state: S, perspectivePlayer: PlayerId): number;
  /** Returns a new state copy for tree expansion. */
  makeMove(state: S, move: M): S;
  /**
   * Applies a move to `state` in place. Used only on rollout scratch copies
   * (`startNode.state.clone()`); tree nodes always use `makeMove`.
   */
  applyMove(state: S, move: M): void;
}
