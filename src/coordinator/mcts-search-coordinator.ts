import type {
  AtomicMoveResult,
  ComputeMoveRequest,
  CoordinatorMoveResult,
  GameCoordinatorAdapter,
  ProgressHandler,
} from '../contracts/coordinator';
import type { PlayerId, SerializedGameState } from '../contracts/player';
import type { SearchResultMessage } from '../contracts/worker-messages';
import { SearchParameters } from '../mcts/search-parameters';
import type { WorkerPort } from '../worker-port/worker-port';
import { createRequestId, delay, nowMs } from './utils';

function paramsWithRootPlayer(params: SearchParameters, rootPlayer?: PlayerId): SearchParameters {
  if (rootPlayer === undefined) return params;
  return SearchParameters.deserialize({ ...params.serialize(), rootPlayer });
}

function toAtomicMoveResult(message: SearchResultMessage): AtomicMoveResult {
  if (message.bestMove === null || message.bestMoveKey === null) {
    throw new Error('Worker returned null bestMove for non-terminal search');
  }
  if (message.bestMovePlayer === null || message.bestMovePhase === null) {
    throw new Error('Worker result missing move player or phase');
  }

  return {
    move: message.bestMove,
    moveKey: message.bestMoveKey,
    player: message.bestMovePlayer,
    phase: message.bestMovePhase,
    iterations: message.iterations,
    stopped: message.stopped,
    elapsedMs: message.elapsedMs,
    statistics: message.statistics,
    principalVariation: message.principalVariation,
  };
}

export class MCTSSearchCoordinator {
  readonly ready: Promise<void>;
  private aborted = false;
  private progressHandler?: ProgressHandler;
  private currentSearchContext: { plyIndex: number; state: SerializedGameState } | null = null;
  private pendingResult?: {
    requestId: string;
    resolve: (message: SearchResultMessage) => void;
    reject: (err: Error) => void;
  };
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly workerPort: WorkerPort;
  private readonly adapter: GameCoordinatorAdapter;

  constructor(workerPort: WorkerPort, adapter: GameCoordinatorAdapter) {
    this.workerPort = workerPort;
    this.adapter = adapter;
    this.ready = workerPort.ready;

    workerPort.onResult((message) => {
      if (this.pendingResult?.requestId === message.requestId) {
        this.clearStopTimer();
        this.pendingResult.resolve(message);
        this.pendingResult = undefined;
        this.currentSearchContext = null;
      }
    });

    workerPort.onError((message) => {
      if (message.requestId === undefined || this.pendingResult?.requestId === message.requestId) {
        this.clearStopTimer();
        this.pendingResult?.reject(new Error(`${message.code}: ${message.message}`));
        this.pendingResult = undefined;
        this.currentSearchContext = null;
      }
    });

    workerPort.onProgress((message) => {
      if (this.progressHandler === undefined || this.currentSearchContext === null) return;
      this.progressHandler({
        phaseIndex: this.currentSearchContext.plyIndex,
        phase: this.adapter.getCurrentPhase(this.currentSearchContext.state),
        iterations: message.iterations,
      });
    });
  }

  onProgress(handler: ProgressHandler): void {
    this.progressHandler = handler;
  }

  stop(): void {
    this.aborted = true;
    this.workerPort.postStop(this.pendingResult?.requestId);
  }

  dispose(): void {
    this.stop();
    this.clearStopTimer();
    this.workerPort.dispose();
  }

  async computeMove(request: ComputeMoveRequest): Promise<CoordinatorMoveResult> {
    await this.ready;
    this.aborted = false;

    if ((request.thinkingDelayMs ?? 0) > 0) {
      await delay(request.thinkingDelayMs!);
    }

    const moves: AtomicMoveResult[] = [];
    let state = request.state;
    let totalIterations = 0;
    let totalElapsedMs = 0;
    let totalNodesExpanded = 0;
    let maxSearchDepth = 0;
    const startMs = nowMs();
    const params =
      request.params instanceof SearchParameters
        ? request.params
        : new SearchParameters(request.params);

    for (let plyIndex = 0; plyIndex < this.adapter.maxPliesPerTurn; plyIndex++) {
      if (this.adapter.isTerminal(state)) break;

      const remainingMs =
        request.timeLimitMs !== undefined ? request.timeLimitMs - (nowMs() - startMs) : undefined;
      if (remainingMs !== undefined && remainingMs <= 0) break;

      const plyTimeLimit =
        request.timeLimitMs !== undefined
          ? (this.adapter.timeLimitForPly?.(plyIndex, request.timeLimitMs, state) ?? remainingMs)
          : undefined;

      const atomic = await this.runSingleSearch({
        state,
        params: paramsWithRootPlayer(
          params,
          request.rootPlayer ?? this.adapter.getCurrentPlayer(state),
        ),
        timeLimitMs: plyTimeLimit,
        plyIndex,
      });

      moves.push(atomic);

      if (this.aborted) {
        totalIterations += atomic.iterations;
        totalElapsedMs += atomic.elapsedMs;
        totalNodesExpanded += atomic.statistics.nodesExpanded;
        maxSearchDepth = Math.max(maxSearchDepth, atomic.statistics.maxDepth);
        return {
          moves,
          resultingState: state,
          totalIterations,
          totalElapsedMs,
          totalNodesExpanded,
          maxSearchDepth,
          interrupted: true,
        };
      }

      totalIterations += atomic.iterations;
      totalElapsedMs += atomic.elapsedMs;
      totalNodesExpanded += atomic.statistics.nodesExpanded;
      maxSearchDepth = Math.max(maxSearchDepth, atomic.statistics.maxDepth);

      const stateBefore = state;
      state = this.adapter.applyMove(state, atomic.move);

      if (this.adapter.isTurnComplete(stateBefore, state) || this.adapter.isTerminal(state)) {
        break;
      }
    }

    return {
      moves,
      resultingState: state,
      totalIterations,
      totalElapsedMs,
      totalNodesExpanded,
      maxSearchDepth,
      interrupted: false,
    };
  }

  private async runSingleSearch(options: {
    state: ComputeMoveRequest['state'];
    params: SearchParameters;
    timeLimitMs?: number;
    plyIndex: number;
  }): Promise<AtomicMoveResult> {
    const requestId = createRequestId();
    this.currentSearchContext = { plyIndex: options.plyIndex, state: options.state };

    const resultPromise = new Promise<SearchResultMessage>((resolve, reject) => {
      this.pendingResult = { requestId, resolve, reject };
    });

    this.workerPort.postSearch({
      type: 'search',
      requestId,
      gameId: this.adapter.gameId,
      state: options.state,
      params: options.params.serialize(),
      timeLimitMs: options.timeLimitMs,
    });

    if (options.timeLimitMs !== undefined && options.timeLimitMs > 0) {
      this.stopTimer = setTimeout(() => {
        this.workerPort.postStop(requestId);
      }, options.timeLimitMs);
    }

    try {
      const message = await resultPromise;
      if (message.bestMove === null) {
        throw new Error('No legal moves at search root');
      }
      return toAtomicMoveResult(message);
    } finally {
      this.clearStopTimer();
      this.currentSearchContext = null;
    }
  }

  private clearStopTimer(): void {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
  }
}
