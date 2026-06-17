import type { Move } from '../../contracts/move';
import type { PhaseId, PlayerId } from '../../contracts/player';
import { type QuartoPiece, parsePieceKey, pieceKey } from './piece';

export type QuartoPhase = 'place' | 'give';

export interface QuartoPlaceMove extends Move {
  readonly phase: 'place';
  readonly row: number;
  readonly col: number;
}

export interface QuartoGiveMove extends Move {
  readonly phase: 'give';
  readonly piece: QuartoPiece;
}

export type QuartoMove = QuartoPlaceMove | QuartoGiveMove;

export function placeMoveKey(player: PlayerId, row: number, col: number): string {
  return `place:${player}:${row},${col}`;
}

export function giveMoveKey(player: PlayerId, piece: QuartoPiece): string {
  return `give:${player}:${pieceKey(piece)}`;
}

export function createPlaceMove(
  player: PlayerId,
  row: number,
  col: number,
  heuristicValue = 0.5,
): QuartoPlaceMove {
  return {
    player,
    phase: 'place',
    row,
    col,
    key: placeMoveKey(player, row, col),
    heuristicValue,
  };
}

export function createGiveMove(
  player: PlayerId,
  piece: QuartoPiece,
  heuristicValue = 0.5,
): QuartoGiveMove {
  return {
    player,
    phase: 'give',
    piece,
    key: giveMoveKey(player, piece),
    heuristicValue,
  };
}

export function parsePlaceMoveKey(key: string): { player: PlayerId; row: number; col: number } | null {
  const match = /^place:(0|1):(\d),(\d)$/.exec(key);
  if (!match) return null;
  return {
    player: Number(match[1]) as PlayerId,
    row: Number(match[2]),
    col: Number(match[3]),
  };
}

export function parseGiveMoveKey(key: string): { player: PlayerId; piece: QuartoPiece } | null {
  const match = /^give:(0|1):((?:tall|short)-(?:light|dark)-(?:square|round)-(?:smooth|split))$/.exec(key);
  if (!match) return null;
  const piece = parsePieceKey(match[2]!);
  if (piece === null) return null;
  return {
    player: Number(match[1]) as PlayerId,
    piece,
  };
}

export const QUARTO_PLACE_PHASE: PhaseId = 'place';
export const QUARTO_GIVE_PHASE: PhaseId = 'give';
