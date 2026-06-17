import type { PlayerId } from '../contracts/player';
import type { PrincipalVariationStep } from '../contracts/search-outcome';
import type { MCTSNode } from './mcts-node';
import type { GameState } from '../contracts/game-state';
import type { Move } from '../contracts/move';

export function childWinRateForRoot<S extends GameState, M extends Move>(
  child: MCTSNode<S, M>,
  rootPlayer: PlayerId,
  getCurrentPlayer: (state: S) => PlayerId,
): number {
  const rate = child.wins / child.visits;
  const playerAtChild = getCurrentPlayer(child.state);
  return playerAtChild === rootPlayer ? rate : 1 - rate;
}

/** Follow highest-visit children from the root (robust principal variation). */
export function extractPrincipalVariation<S extends GameState, M extends Move>(
  root: MCTSNode<S, M>,
  rootPlayer: PlayerId,
  getCurrentPlayer: (state: S) => PlayerId,
  maxPlies = 24,
): PrincipalVariationStep[] {
  const variation: PrincipalVariationStep[] = [];
  let node = root;

  for (let ply = 0; ply < maxPlies; ply++) {
    let bestChild: MCTSNode<S, M> | null = null;
    let bestVisits = -1;

    for (const child of node.children.values()) {
      if (child.visits === 0 || child.move === null) continue;
      if (child.visits > bestVisits) {
        bestVisits = child.visits;
        bestChild = child;
      } else if (child.visits === bestVisits && bestChild !== null && child.move !== null) {
        if (child.move.key < bestChild.move!.key) {
          bestChild = child;
        }
      }
    }

    if (bestChild === null || bestChild.move === null) break;

    variation.push({
      moveKey: bestChild.move.key,
      player: bestChild.move.player,
      phase: bestChild.move.phase,
      sideToMoveAfter: getCurrentPlayer(bestChild.state),
      visits: bestChild.visits,
      wins: bestChild.wins,
      winRate: childWinRateForRoot(bestChild, rootPlayer, getCurrentPlayer),
    });

    node = bestChild;
  }

  return variation;
}

export function formatPrincipalVariationStep(step: PrincipalVariationStep, plyIndex: number): string {
  const winRatePct = (step.winRate * 100).toFixed(1);
  const moverLabel = step.phase === 'give' ? 'giver' : 'placer';
  return `  ${plyIndex + 1}. ${step.moveKey} (${step.phase}, ${moverLabel}=p${step.player}, toMove=p${step.sideToMoveAfter}) visits=${step.visits} wins=${step.wins.toFixed(2)} rootWinRate=${winRatePct}%`;
}

export function formatPrincipalVariation(
  variation: PrincipalVariationStep[],
  label = 'MCTS PV',
  gameId?: string,
): string {
  const header = gameId ? `[${label}] ${gameId}` : `[${label}]`;
  if (variation.length === 0) {
    return `${header}\n  (empty)`;
  }
  return [header, ...variation.map((step, index) => formatPrincipalVariationStep(step, index))].join('\n');
}

export function formatRootChildrenSummary(
  children: Array<{ moveKey: string; visits: number; wins: number; winRate: number }>,
  label = 'MCTS root',
  gameId?: string,
  topN = 8,
): string {
  const header = gameId ? `[${label}] ${gameId} (top ${topN} by visits)` : `[${label}] (top ${topN} by visits)`;
  const ranked = [...children].sort((a, b) => b.visits - a.visits).slice(0, topN);
  if (ranked.length === 0) {
    return `${header}\n  (none)`;
  }
  const lines = ranked.map(
    (child, index) =>
      `  ${index + 1}. ${child.moveKey} visits=${child.visits} wins=${child.wins.toFixed(2)} rootWinRate=${(child.winRate * 100).toFixed(1)}%`,
  );
  return [header, ...lines].join('\n');
}

export function logPrincipalVariation(
  variation: PrincipalVariationStep[],
  label = 'MCTS PV',
  gameId?: string,
  rootChildren?: Array<{ moveKey: string; visits: number; wins: number; winRate: number }>,
): void {
  console.log(formatPrincipalVariation(variation, label, gameId));
  if (rootChildren !== undefined && rootChildren.length > 0) {
    console.log(formatRootChildrenSummary(rootChildren, 'MCTS root', gameId));
  }
}
