import type { PhaseId, PlayerId } from './player';

/** One legal action in one phase — one tree edge, one ply. */
export interface Move {
  /** Player who makes this action. Must match state.currentPlayer at generation time. */
  readonly player: PlayerId;

  /** Phase this action belongs to. Must match state.currentPhase at generation time. */
  readonly phase: PhaseId;

  /**
   * Stable string key for maps / node children.
   * Recommended: `${phase}:${player}:${actionDescriptor}`
   */
  readonly key: string;

  /**
   * P(win) in [0, 1] for the player who makes this move (side-to-move at generation).
   * `1` = win, `0.5` = draw or unknown, `0` = loss.
   * Set by generateMoves. Used for expansion ordering and optional UCT priors
   * (`movePriorWeight * heuristicValue`); must share the same scale as backup win rates.
   */
  heuristicValue: number;
}
