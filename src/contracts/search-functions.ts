import type { GameState } from './game-state';
import type { Move } from './move';
import type { PlayerId } from './player';

export interface SearchFunctions<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  generateMoves(state: S, perspectivePlayer: PlayerId): M[];
  evaluatePosition(state: S, perspectivePlayer: PlayerId): number;
  makeMove(state: S, move: M): S;
}
