import { describe, expect, it } from 'vitest';

import { createWorkerContext, handleWorkerMessage } from './message-handler';
import { GameRegistry } from './registry';
import { registerQuarto } from '../games/quarto/register';
import { QUARTO_POSITIONS } from '../games/quarto/fixtures';
import { registerTicTacToe } from '../games/tic-tac-toe/register';
import { TTT_POSITIONS } from '../games/tic-tac-toe/fixtures';
import { SearchParameters } from '../mcts/search-parameters';

describe('handleWorkerMessage', () => {
  it('returns ready with registered game ids', () => {
    const registry = new GameRegistry();
    registerTicTacToe(registry);
    const messages: unknown[] = [];

    handleWorkerMessage(
      registry,
      createWorkerContext(),
      { type: 'ping' },
      (msg) => messages.push(msg),
    );

    expect(messages).toEqual([{ type: 'pong' }]);
    expect(registry.gameIds()).toContain('tic-tac-toe');
  });

  it('runs search and returns a result message', () => {
    const registry = new GameRegistry();
    registerTicTacToe(registry);
    const context = createWorkerContext();
    const messages: unknown[] = [];

    handleWorkerMessage(
      registry,
      context,
      {
        type: 'search',
        requestId: 'r1',
        gameId: 'tic-tac-toe',
        state: TTT_POSITIONS.xWinInOne().serialize(),
        params: new SearchParameters({ maxIterations: 200, seed: 4, heuristicId: 'basic' }).serialize(),
      },
      (msg) => messages.push(msg),
    );

    const result = messages.find((m) => (m as { type: string }).type === 'result') as {
      type: 'result';
      bestMoveKey: string;
      stopped: boolean;
    };

    expect(result).toBeDefined();
    expect(result.bestMoveKey).toBe('main:0:0,2');
  });

  it('returns UNKNOWN_GAME for unregistered gameId', () => {
    const registry = new GameRegistry();
    const messages: unknown[] = [];

    handleWorkerMessage(
      registry,
      createWorkerContext(),
      {
        type: 'search',
        requestId: 'r2',
        gameId: 'missing',
        state: {},
        params: new SearchParameters().serialize(),
      },
      (msg) => messages.push(msg),
    );

    expect(messages[0]).toMatchObject({ type: 'error', code: 'UNKNOWN_GAME' });
  });

  it('honors timeLimitMs while search runs synchronously in the worker handler', () => {
    const registry = new GameRegistry();
    registerQuarto(registry);
    const context = createWorkerContext();
    const messages: unknown[] = [];

    const started = performance.now();
    handleWorkerMessage(
      registry,
      context,
      {
        type: 'search',
        requestId: 'r3',
        gameId: 'quarto',
        state: QUARTO_POSITIONS.openingGive(0).serialize(),
        params: new SearchParameters({
          maxIterations: 1_000_000,
          seed: 9,
          heuristicId: 'quarto-basic',
          stopPollInterval: 8,
          logPrincipalVariation: false,
        }).serialize(),
        timeLimitMs: 80,
      },
      (msg) => messages.push(msg),
    );
    const elapsed = performance.now() - started;

    const result = messages.find((m) => (m as { type: string }).type === 'result') as {
      type: 'result';
      stopped: boolean;
      bestMoveKey: string | null;
    };

    expect(result).toBeDefined();
    expect(result.stopped).toBe(true);
    expect(result.bestMoveKey).not.toBeNull();
    expect(elapsed).toBeLessThan(700);
  });
});
