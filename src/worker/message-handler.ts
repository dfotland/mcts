import type { Move } from '../contracts/move';
import type { SerializedMove } from '../contracts/player';
import type { SearchOutcome } from '../contracts/search-outcome';
import type {
  ErrorMessage,
  MainToWorkerMessage,
  ProgressMessage,
  SearchResultMessage,
  WorkerToMainMessage,
} from '../contracts/worker-messages';
import { MCTSEngine } from '../mcts/mcts-engine';
import { logPrincipalVariation } from '../mcts/principal-variation';
import { SearchParameters } from '../mcts/search-parameters';
import { type GameRegistry, resolveSearchFunctions } from './registry';

export interface WorkerContext {
  stopRequested: boolean;
  activeRequestId: string | null;
}

export function createWorkerContext(): WorkerContext {
  return { stopRequested: false, activeRequestId: null };
}

function serializeMove<M extends Move>(move: M): SerializedMove {
  return { ...move } as SerializedMove;
}

function toSearchResultMessage<M extends Move>(
  requestId: string,
  outcome: SearchOutcome<M>,
  elapsedMs: number,
): SearchResultMessage {
  const best = outcome.bestMove;
  return {
    type: 'result',
    requestId,
    bestMove: best !== null ? serializeMove(best) : null,
    bestMoveKey: best?.key ?? null,
    bestMovePlayer: best?.player ?? null,
    bestMovePhase: best?.phase ?? null,
    iterations: outcome.iterations,
    stopped: outcome.stopped,
    elapsedMs,
    statistics: outcome.statistics,
    principalVariation: outcome.principalVariation,
    children: outcome.children.map((child) => ({
      moveKey: child.move.key,
      move: serializeMove(child.move),
      player: child.move.player,
      phase: child.move.phase,
      visits: child.visits,
      wins: child.wins,
      winRate: child.winRate,
    })),
  };
}

function toErrorMessage(requestId: string | undefined, code: ErrorMessage['code'], message: string): ErrorMessage {
  return { type: 'error', requestId, code, message };
}

export function handleWorkerMessage(
  registry: GameRegistry,
  context: WorkerContext,
  message: MainToWorkerMessage,
  post: (msg: WorkerToMainMessage) => void,
  onProgress?: (msg: ProgressMessage) => void,
): void {
  if (message.type === 'ping') {
    post({ type: 'pong' });
    return;
  }

  if (message.type === 'stop') {
    if (message.requestId === undefined || message.requestId === context.activeRequestId) {
      context.stopRequested = true;
    }
    return;
  }

  if (message.type !== 'search') return;

  context.activeRequestId = message.requestId;
  context.stopRequested = false;

  const adapter = registry.get(message.gameId);
  if (adapter === undefined) {
    post(toErrorMessage(message.requestId, 'UNKNOWN_GAME', `Unknown gameId: ${message.gameId}`));
    return;
  }

  let functions;
  try {
    functions = resolveSearchFunctions(registry, message.gameId, String(message.params.heuristicId ?? 'uniform'));
  } catch (err) {
    post(
      toErrorMessage(
        message.requestId,
        'INTERNAL',
        err instanceof Error ? err.message : 'Failed to resolve heuristics',
      ),
    );
    return;
  }

  let state;
  try {
    state = adapter.engine.createState(message.state);
  } catch (err) {
    post(
      toErrorMessage(
        message.requestId,
        'INVALID_STATE',
        err instanceof Error ? err.message : 'Invalid state',
      ),
    );
    return;
  }

  const params = SearchParameters.deserialize(message.params);
  const engine = new MCTSEngine(adapter.engine);

  const logInterval = params.logInterval ?? 0;
  const logger =
    logInterval > 0 && onProgress
      ? {
          onIteration(ctx: { iteration: number }) {
            onProgress({ type: 'progress', requestId: message.requestId, iterations: ctx.iteration });
          },
        }
      : undefined;

  const startMs = performance.now();
  const deadlineMs =
    message.timeLimitMs !== undefined && message.timeLimitMs > 0
      ? startMs + message.timeLimitMs
      : null;

  try {
    const outcome = engine.search(
      {
        state,
        params,
        functions,
        logger,
      },
      {
        shouldStop: () => {
          if (context.stopRequested) return true;
          return deadlineMs !== null && performance.now() >= deadlineMs;
        },
      },
    );

    if (params.logPrincipalVariation) {
      const rootChildren = outcome.children.map((child) => ({
        moveKey: child.move.key,
        visits: child.visits,
        wins: child.wins,
        winRate: child.winRate,
      }));
      logPrincipalVariation(outcome.principalVariation, 'MCTS PV', message.gameId, rootChildren);
    }

    post(toSearchResultMessage(message.requestId, outcome, performance.now() - startMs));
  } catch (err) {
    post(
      toErrorMessage(
        message.requestId,
        'SEARCH_FAILED',
        err instanceof Error ? err.message : 'Search failed',
      ),
    );
  } finally {
    if (context.activeRequestId === message.requestId) {
      context.activeRequestId = null;
    }
    context.stopRequested = false;
  }
}

export function postReady(registry: GameRegistry, post: (msg: WorkerToMainMessage) => void): void {
  post({ type: 'ready', gameIds: registry.gameIds() });
}
