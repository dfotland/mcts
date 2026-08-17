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
   * Set by generateMoves. Used for expansion ordering and as the Beta prior mean in UCT Q.
   * Must share the same scale as backup win rates.
   */
  heuristicValue: number;

  /**
   * Stddev of `heuristicValue`, in [0.1, 0.35]. Maps to Beta pseudo-trials in UCT:
   * small σ (forced 0/1) ≈ 24 virtual rollouts at p = 0.5; large σ (uncertain) ≈ 1.
   * Default 0.35 (weak prior) when a constructor does not set it.
   */
  heuristicStdDev: number;
}
