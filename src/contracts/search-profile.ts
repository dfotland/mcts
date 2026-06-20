export type ProfilePhase = 'selection' | 'expansion' | 'rollout' | 'backprop' | 'buildOutcome';

export interface PhaseProfile {
  ms: number;
  count: number;
  /** Fraction of total profiled phase time (0–1). */
  share: number;
}

export interface RolloutPhaseProfile extends PhaseProfile {
  plies: number;
  generateRolloutMoveCalls: number;
  generateRolloutMoveMs: number;
  /** Fraction of rollout phase time spent in `generateRolloutMove`. */
  generateRolloutMoveShare: number;
  applyMoveCalls: number;
  applyMoveMs: number;
  /** Fraction of rollout phase time spent in `applyMove`. */
  applyMoveShare: number;
}

export interface BackpropPhaseProfile extends PhaseProfile {
  steps: number;
}

export interface FunctionTimingProfile {
  ms: number;
  calls: number;
  /** Fraction of total profiled search time (0–1). */
  totalShare: number;
}

export interface SearchProfile {
  totalMs: number;
  iterationsPerSecond: number;
  msPerIteration: number;
  selection: PhaseProfile;
  expansion: PhaseProfile;
  rollout: RolloutPhaseProfile;
  backprop: BackpropPhaseProfile;
  buildOutcome: PhaseProfile;
  /** Game-specific hot-path timing when the adapter provides it (e.g. Quarto). */
  wouldCompleteLine?: FunctionTimingProfile;
}
