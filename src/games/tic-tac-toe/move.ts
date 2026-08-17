import type { Move } from '../../contracts/move';
import type { PhaseId, PlayerId } from '../../contracts/player';

export type TicTacToePhase = 'main';

export interface TicTacToeMove extends Move {
  readonly phase: TicTacToePhase;
  readonly row: number;
  readonly col: number;
}

export function moveKey(player: PlayerId, row: number, col: number): string {
  return `main:${player}:${row},${col}`;
}

/** Forced win/loss. */
export const HEURISTIC_STDDEV_FORCED = 0.1;
/** Uniform / uncertain tactics. */
export const HEURISTIC_STDDEV_UNCERTAIN = 0.35;

export function createMove(
  player: PlayerId,
  row: number,
  col: number,
  heuristicValue = 0.5,
  heuristicStdDev = HEURISTIC_STDDEV_UNCERTAIN,
): TicTacToeMove {
  return {
    player,
    phase: 'main',
    row,
    col,
    key: moveKey(player, row, col),
    heuristicValue,
    heuristicStdDev,
  };
}

export function parseMoveKey(key: string): { player: PlayerId; row: number; col: number } | null {
  const match = /^main:(0|1):(\d),(\d)$/.exec(key);
  if (!match) return null;
  return {
    player: Number(match[1]) as PlayerId,
    row: Number(match[2]),
    col: Number(match[3]),
  };
}

export const TTT_MAIN_PHASE: PhaseId = 'main';
