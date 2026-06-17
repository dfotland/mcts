import { TicTacToeBoard } from './board';
import { createTicTacToeState, type TicTacToeState } from './state';

/** Player 0 = X, player 1 = O. */
export const TTT_POSITIONS = {
  /** X can win at (0,2) completing the top row. */
  xWinInOne(): TicTacToeState {
    return createTicTacToeState(
      new TicTacToeBoard([
        [0, 0, null],
        [null, 1, null],
        [null, null, 1],
      ]),
      0,
    );
  },

  /** O threatens (0,2); X must block at (0,2). */
  xBlockInOne(): TicTacToeState {
    return createTicTacToeState(
      new TicTacToeBoard([
        [1, 1, null],
        [null, 0, null],
        [null, null, 0],
      ]),
      0,
    );
  },

  empty(): TicTacToeState {
    return createTicTacToeState();
  },

  /** Empty board; O (player 1) opens. */
  emptyOFirst(): TicTacToeState {
    return createTicTacToeState(undefined, 1);
  },

  /** O can win at (0,2) completing the top row. */
  oWinInOne(): TicTacToeState {
    return createTicTacToeState(
      new TicTacToeBoard([
        [1, 1, null],
        [0, null, null],
        [null, null, 0],
      ]),
      1,
    );
  },

  /** X threatens (0,2); O must block at (0,2). */
  oBlockInOne(): TicTacToeState {
    return createTicTacToeState(
      new TicTacToeBoard([
        [0, 0, null],
        [null, 1, null],
        [null, null, null],
      ]),
      1,
    );
  },
};
