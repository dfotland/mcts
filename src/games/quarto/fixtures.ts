import { QuartoBoard } from './board';
import { createPlaceMove } from './move';
import { type QuartoPiece, generateAllPieces } from './piece';
import { createQuartoState, type QuartoState } from './state';

function piece(overrides: Partial<QuartoPiece> = {}): QuartoPiece {
  return {
    height: 'tall',
    color: 'light',
    shape: 'square',
    top: 'smooth',
    ...overrides,
  };
}

function setCell(board: QuartoBoard, row: number, col: number, cell: QuartoPiece | null): QuartoBoard {
  if (cell === null) {
    const cells = board.cells.map((r) => [...r]);
    cells[row]![col] = null;
    return new QuartoBoard(cells);
  }
  return board.withCell(row, col, cell);
}

function rowWinBoard(): QuartoBoard {
  let board = new QuartoBoard();
  board = setCell(board, 0, 0, piece({ height: 'tall', color: 'light', shape: 'square', top: 'smooth' }));
  board = setCell(board, 0, 1, piece({ height: 'tall', color: 'dark', shape: 'round', top: 'split' }));
  board = setCell(board, 0, 2, piece({ height: 'tall', color: 'light', shape: 'round', top: 'smooth' }));
  return board;
}

export const QUARTO_POSITIONS = {
  empty(): QuartoState {
    return createQuartoState();
  },

  /** AI to move in give phase at game start. */
  openingGive(player: 0 | 1 = 0): QuartoState {
    return createQuartoState({
      currentPlayer: player,
      currentPhase: 'give',
      stagedPiece: null,
      availablePieces: generateAllPieces(),
    });
  },

  /** Three tall pieces in row 0; placing tall at (0,3) wins. */
  winInOnePlace(player: 0 | 1 = 0): QuartoState {
    const staged = piece({ height: 'tall', color: 'dark', shape: 'square', top: 'split' });
    const available = generateAllPieces().filter(
      (p) =>
        !(
          p.height === staged.height &&
          p.color === staged.color &&
          p.shape === staged.shape &&
          p.top === staged.top
        ),
    );

    return createQuartoState({
      board: rowWinBoard(),
      currentPlayer: player,
      currentPhase: 'place',
      stagedPiece: staged,
      availablePieces: available,
    });
  },

  /** Player 0 must give; giving the lethal tall piece lets player 1 win in one placement. */
  lethalGiveForOpponent(giver: 0 | 1 = 0): QuartoState {
    return createQuartoState({
      board: rowWinBoard(),
      currentPlayer: giver,
      currentPhase: 'give',
      stagedPiece: null,
      availablePieces: generateAllPieces(),
    });
  },

  lethalGivePiece() {
    return piece({ height: 'tall', color: 'dark', shape: 'square', top: 'split' });
  },

  /** After winning placement, only one move needed. */
  expectedWinPlaceMove(player: 0 | 1 = 0) {
    return createPlaceMove(player, 0, 3);
  },
};

export { piece, setCell };
