import type { GameState } from '../contracts/game-state';
import type { Move } from '../contracts/move';
import type { PlayerId } from '../contracts/player';
import type { SearchChildSummary } from '../contracts/search-logger';

export interface MCTSNode<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  /** Edge label from parent; null at root. */
  move: M | null;
  parent: MCTSNode<S, M> | null;
  children: Map<string, MCTSNode<S, M>>;
  visits: number;
  wins: number;
  /** Player to move at this node (cached; nodes do not store state). */
  playerToMove: PlayerId;
  isTerminal: boolean;
  /** Undefined = not generated; empty = all expanded. */
  untriedMoves?: M[];
}

export function createRootNode<S extends GameState, M extends Move>(options: {
  playerToMove: PlayerId;
  isTerminal: boolean;
}): MCTSNode<S, M> {
  return {
    move: null,
    parent: null,
    children: new Map(),
    visits: 0,
    wins: 0,
    playerToMove: options.playerToMove,
    isTerminal: options.isTerminal,
  };
}

export function summarizeChildren<S extends GameState, M extends Move>(
  children: Map<string, MCTSNode<S, M>>,
  rootPlayer: PlayerId,
  topN = 5,
): SearchChildSummary[] {
  const summaries: SearchChildSummary[] = [];

  for (const child of children.values()) {
    if (child.visits === 0 || child.move === null) continue;
    const rate = child.wins / child.visits;
    const winRate = child.playerToMove === rootPlayer ? rate : 1 - rate;
    summaries.push({
      moveKey: child.move.key,
      visits: child.visits,
      wins: child.wins,
      winRate,
      heuristicValue: child.move.heuristicValue,
    });
  }

  summaries.sort((a, b) => b.visits - a.visits);
  return summaries.slice(0, topN);
}

export function countTreeNodes<S extends GameState, M extends Move>(
  node: MCTSNode<S, M>,
): number {
  let count = 1;
  for (const child of node.children.values()) {
    count += countTreeNodes(child);
  }
  return count;
}

export function measureMaxDepth<S extends GameState, M extends Move>(
  node: MCTSNode<S, M>,
  depth = 0,
): number {
  let max = depth;
  for (const child of node.children.values()) {
    max = Math.max(max, measureMaxDepth(child, depth + 1));
  }
  return max;
}
