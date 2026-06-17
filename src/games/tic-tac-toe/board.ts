import type { Board } from '../../contracts/board';
import type { PlayerId } from '../../contracts/player';

export type Cell = PlayerId | null;

/** 3×3 board; index [row][col]. */
export class TicTacToeBoard implements Board {
  readonly cells: Cell[][];

  constructor(cells?: Cell[][]) {
    this.cells = cells ?? [
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ];
  }

  clone(): TicTacToeBoard {
    return new TicTacToeBoard(this.cells.map((row) => [...row]));
  }

  hash(): string {
    return this.cells.map((row) => row.map((c) => (c === null ? '.' : c)).join('')).join('/');
  }

  get(row: number, col: number): Cell {
    return this.cells[row]![col]!;
  }

  withCell(row: number, col: number, player: PlayerId): TicTacToeBoard {
    const next = this.clone();
    next.cells[row]![col] = player;
    return next;
  }
}

export function findWinner(board: TicTacToeBoard): PlayerId | null {
  const lines: [number, number][][] = [
    [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 2],
    ],
    [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    [
      [0, 2],
      [1, 1],
      [2, 0],
    ],
  ];

  for (const line of lines) {
    const [a, b, c] = line;
    const p0 = board.get(a![0]!, a![1]!);
    if (p0 === null) continue;
    if (p0 === board.get(b![0]!, b![1]!) && p0 === board.get(c![0]!, c![1]!)) {
      return p0;
    }
  }

  return null;
}

export function isBoardFull(board: TicTacToeBoard): boolean {
  return board.cells.every((row) => row.every((cell) => cell !== null));
}

export function formatBoard(board: TicTacToeBoard): string {
  const symbol = (c: Cell) => (c === null ? '.' : c === 0 ? 'X' : 'O');
  return board.cells.map((row) => row.map(symbol).join(' ')).join('\n');
}
