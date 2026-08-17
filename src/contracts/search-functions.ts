import type { GameState } from './game-state';
import type { Move } from './move';
import type { PlayerId } from './player';
import type { SearchProfile } from './search-profile';

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
  /** Prepare rollout scratch after tree descent; called once per rollout. */
  beginRollout(state: S): void;
  /**
   * P(win) in [0, 1] for `perspectivePlayer` (`1` / `0.5` / `0` = win / draw-or-unknown / loss).
   * The engine passes the player to move at rollout start, not the leaf side-to-move.
   * Used at rollout depth limit on non-terminal positions.
   */
  evaluatePosition(state: S, perspectivePlayer: PlayerId): number;
  /** Returns a new state copy (clone + apply). Used by adapters/coordinator, not the engine tree walk. */
  makeMove(state: S, move: M): S;
  /**
   * Applies a move to `state` in place. The engine uses this for tree descent and rollout
   * on a per-iteration scratch copy (`rootState.clone()`). Must apply the same transition
   * as `makeMove` would on an equivalent copy.
   */
  applyMove(state: S, move: M): void;
  /** Reset game-specific profile counters when `profileSearch` is enabled. */
  beginProfileSampling?(): void;
  /** Merge game-specific profile counters into the search profile. */
  augmentSearchProfile?(profile: SearchProfile): SearchProfile;
}
