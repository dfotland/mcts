import type { PhaseId, PlayerId, SerializedGameState, SerializedMove, SerializedSearchParameters } from './player';
import type { SearchStatistics } from './search-outcome';
import type { PrincipalVariationStep } from './search-outcome';

/** Main thread → worker */
export interface SearchRequest {
  type: 'search';
  requestId: string;
  gameId: string;
  state: SerializedGameState;
  params: SerializedSearchParameters;
  /** Wall-clock budget for this search; worker enforces via shouldStop polling. */
  timeLimitMs?: number;
}

export interface StopRequest {
  type: 'stop';
  requestId?: string;
}

export interface PingRequest {
  type: 'ping';
}

export type MainToWorkerMessage = SearchRequest | StopRequest | PingRequest;

/** Worker → main thread */
export interface ReadyMessage {
  type: 'ready';
  gameIds: string[];
}

export interface ProgressMessage {
  type: 'progress';
  requestId: string;
  iterations: number;
}

export interface SearchResultMessage {
  type: 'result';
  requestId: string;
  bestMove: SerializedMove | null;
  bestMoveKey: string | null;
  bestMovePlayer: PlayerId | null;
  bestMovePhase: PhaseId | null;
  iterations: number;
  stopped: boolean;
  elapsedMs: number;
  statistics: SearchStatistics;
  principalVariation: PrincipalVariationStep[];
  children: Array<{
    moveKey: string;
    move: SerializedMove;
    player: PlayerId;
    phase: PhaseId;
    visits: number;
    wins: number;
    winRate: number;
  }>;
}

export type WorkerErrorCode = 'UNKNOWN_GAME' | 'INVALID_STATE' | 'SEARCH_FAILED' | 'INTERNAL';

export interface ErrorMessage {
  type: 'error';
  requestId?: string;
  message: string;
  code: WorkerErrorCode;
}

export interface PongMessage {
  type: 'pong';
}

export type WorkerToMainMessage =
  | ReadyMessage
  | ProgressMessage
  | SearchResultMessage
  | ErrorMessage
  | PongMessage;
