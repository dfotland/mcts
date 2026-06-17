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
   * Rough win-rate estimate [0, 1] for playing this move from the position where it was generated.
   * Set by generateMoves when the move is created.
   */
  heuristicValue: number;
}
