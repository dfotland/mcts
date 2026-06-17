import { describe, it } from 'vitest';

import { neverStop } from '../../contracts/stop-signal';
import { ConsoleSearchLogger, MCTSEngine, SearchParameters } from '../../mcts';
import { formatBoard } from './board';
import { ticTacToeEngine } from './engine';
import { TTT_POSITIONS } from './fixtures';
import { ticTacToeBasicSearch } from './search-functions';

/**
 * Demo / manual verification — run with:
 *   npm run demo:ttt
 *
 * Prints board positions and MCTS trace to stdout.
 */
describe('tic-tac-toe demo (logging)', () => {
  it('logs win-in-one search', () => {
    const state = TTT_POSITIONS.xWinInOne();
    console.log('\n--- Position: X to win in one ---\n' + formatBoard(state.board) + '\n');

    const engine = new MCTSEngine(ticTacToeEngine);
    const logger = new ConsoleSearchLogger('TTT');

    engine.search(
      {
        state,
        params: new SearchParameters({
          maxIterations: 200,
          seed: 42,
          logInterval: 50,
          stopPollInterval: 16,
          heuristicId: 'basic',
        }),
        functions: ticTacToeBasicSearch,
        logger,
      },
      neverStop,
    );
  });

  it('logs block-in-one search', () => {
    const state = TTT_POSITIONS.xBlockInOne();
    console.log('\n--- Position: X must block ---\n' + formatBoard(state.board) + '\n');

    const engine = new MCTSEngine(ticTacToeEngine);
    const logger = new ConsoleSearchLogger('TTT');

    engine.search(
      {
        state,
        params: new SearchParameters({
          maxIterations: 200,
          seed: 42,
          logInterval: 50,
          heuristicId: 'basic',
        }),
        functions: ticTacToeBasicSearch,
        logger,
      },
      neverStop,
    );
  });

  it('logs empty-board search', () => {
    const state = TTT_POSITIONS.empty();
    console.log('\n--- Position: empty board ---\n' + formatBoard(state.board) + '\n');

    const engine = new MCTSEngine(ticTacToeEngine);
    const logger = new ConsoleSearchLogger('TTT');

    engine.search(
      {
        state,
        params: new SearchParameters({
          maxIterations: 500,
          seed: 123,
          logInterval: 100,
          heuristicId: 'basic',
        }),
        functions: ticTacToeBasicSearch,
        logger,
      },
      neverStop,
    );
  });

  it('logs empty-board search with O to move first', () => {
    const state = TTT_POSITIONS.emptyOFirst();
    console.log('\n--- Position: empty board, O to move ---\n' + formatBoard(state.board) + '\n');

    const engine = new MCTSEngine(ticTacToeEngine);
    const logger = new ConsoleSearchLogger('TTT-O');

    engine.search(
      {
        state,
        params: new SearchParameters({
          maxIterations: 500,
          seed: 123,
          logInterval: 100,
          rootPlayer: 1,
          heuristicId: 'basic',
        }),
        functions: ticTacToeBasicSearch,
        logger,
      },
      neverStop,
    );
  });

  it('logs O win-in-one search', () => {
    const state = TTT_POSITIONS.oWinInOne();
    console.log('\n--- Position: O to win in one ---\n' + formatBoard(state.board) + '\n');

    const engine = new MCTSEngine(ticTacToeEngine);
    const logger = new ConsoleSearchLogger('TTT-O');

    engine.search(
      {
        state,
        params: new SearchParameters({
          maxIterations: 200,
          seed: 42,
          logInterval: 50,
          stopPollInterval: 16,
          rootPlayer: 1,
          heuristicId: 'basic',
        }),
        functions: ticTacToeBasicSearch,
        logger,
      },
      neverStop,
    );
  });

  it('logs O block-in-one search', () => {
    const state = TTT_POSITIONS.oBlockInOne();
    console.log('\n--- Position: O must block ---\n' + formatBoard(state.board) + '\n');

    const engine = new MCTSEngine(ticTacToeEngine);
    const logger = new ConsoleSearchLogger('TTT-O');

    engine.search(
      {
        state,
        params: new SearchParameters({
          maxIterations: 200,
          seed: 42,
          logInterval: 50,
          rootPlayer: 1,
          heuristicId: 'basic',
        }),
        functions: ticTacToeBasicSearch,
        logger,
      },
      neverStop,
    );
  });
});
