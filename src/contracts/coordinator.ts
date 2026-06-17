import type { PhaseId, PlayerId, SerializedGameState, SerializedMove } from './player';
import type { SearchStatistics, PrincipalVariationStep } from './search-outcome';
import type { SearchParams } from './search-params';

/** Per-game main-thread plugin for multi-phase turn chaining. */
export interface GameCoordinatorAdapter {
  readonly gameId: string;
  readonly maxPliesPerTurn: number;

  getCurrentPhase(state: SerializedGameState): PhaseId;
  getCurrentPlayer(state: SerializedGameState): PlayerId;
  applyMove(state: SerializedGameState, move: SerializedMove): SerializedGameState;
  isTerminal(state: SerializedGameState): boolean;

  /** After applying an atomic move, is the AI's visible turn complete? */
  isTurnComplete(stateBefore: SerializedGameState, stateAfter: SerializedGameState): boolean;

  timeLimitForPly?(
    plyIndex: number,
    totalTimeLimitMs: number,
    state: SerializedGameState,
  ): number;
}

export interface ComputeMoveRequest {
  state: SerializedGameState;
  params: SearchParams;
  timeLimitMs?: number;
  thinkingDelayMs?: number;
  rootPlayer?: PlayerId;
}

export interface AtomicMoveResult {
  move: SerializedMove;
  moveKey: string;
  player: PlayerId;
  phase: PhaseId;
  iterations: number;
  stopped: boolean;
  elapsedMs: number;
  statistics: SearchStatistics;
  principalVariation: PrincipalVariationStep[];
}

export interface CoordinatorMoveResult {
  moves: AtomicMoveResult[];
  resultingState: SerializedGameState;
  totalIterations: number;
  totalElapsedMs: number;
  totalNodesExpanded: number;
  maxSearchDepth: number;
  interrupted: boolean;
}

export interface CoordinatorProgress {
  phaseIndex: number;
  phase: PhaseId;
  iterations: number;
}

export type ProgressHandler = (progress: CoordinatorProgress) => void;
