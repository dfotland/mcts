import type { GameState } from '../contracts/game-state';
import type { Move } from '../contracts/move';
import type { SearchChildSummary } from '../contracts/search-logger';

export interface MCTSNode<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  state: S;
  move: M | null;
  parent: MCTSNode<S, M> | null;
  children: Map<string, MCTSNode<S, M>>;
  visits: number;
  wins: number;
  /** Undefined = not generated; empty = all expanded. */
  untriedMoves?: M[];
}

export function createRootNode<S extends GameState, M extends Move>(state: S): MCTSNode<S, M> {
  return {
    state,
    move: null,
    parent: null,
    children: new Map(),
    visits: 0,
    wins: 0,
  };
}

export function summarizeChildren<S extends GameState, M extends Move>(
  children: Map<string, MCTSNode<S, M>>,
  rootPlayer: import('../contracts/player').PlayerId,
  getCurrentPlayer: (state: S) => import('../contracts/player').PlayerId,
  topN = 5,
): SearchChildSummary[] {
  const summaries: SearchChildSummary[] = [];

  for (const child of children.values()) {
    if (child.visits === 0 || child.move === null) continue;
    const rate = child.wins / child.visits;
    const atChild = getCurrentPlayer(child.state);
    const winRate = atChild === rootPlayer ? rate : 1 - rate;
    summaries.push({
      moveKey: child.move.key,
      visits: child.visits,
      wins: child.wins,
      winRate,
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
