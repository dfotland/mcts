import type { GameEngine } from '../contracts/game-engine';
import type { GameState } from '../contracts/game-state';
import type { Move } from '../contracts/move';
import type { PlayerId } from '../contracts/player';
import type { SearchInput } from '../contracts/search-input';
import type { SearchOutcome } from '../contracts/search-outcome';
import type { SearchParams } from '../contracts/search-params';
import type { StopSignal } from '../contracts/stop-signal';
import { createRootNode, countTreeNodes, measureMaxDepth, summarizeChildren, type MCTSNode } from './mcts-node';
import { extractPrincipalVariation } from './principal-variation';
import { outcomeToValue } from './outcome';
import { createPrng, pickRandomIndex, type RandomFn } from './prng';
import { SearchProfiler } from './search-profile';

export class MCTSEngine<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  private readonly gameEngine: GameEngine<S, M>;

  constructor(gameEngine: GameEngine<S, M>) {
    this.gameEngine = gameEngine;
  }

  search(input: SearchInput<S, M>, stopSignal: StopSignal): SearchOutcome<M> {
    const { state, params, functions, logger } = input;
    const rootPlayer = params.rootPlayer ?? this.gameEngine.getCurrentPlayer(state);
    const next = createPrng(params.seed);
    const root = createRootNode<S, M>(state.clone() as S);
    const profiler = new SearchProfiler(params.profileSearch ?? false);

    logger?.onSearchStart?.({
      rootPlayer,
      seed: params.seed,
      maxIterations: params.maxIterations,
    });

    let iterations = 0;
    let stopped = false;

    while (iterations < params.maxIterations) {
      this.runIteration(root, rootPlayer, params, functions, next, profiler);

      iterations++;

      if ((params.logInterval ?? 0) > 0 && logger?.onIteration && iterations % (params.logInterval ?? 0) === 0) {
        logger.onIteration({
          iteration: iterations,
          rootVisits: root.visits,
          topChildren: summarizeChildren(
            root.children as Map<string, MCTSNode<S, M>>,
            rootPlayer,
            (s) => this.gameEngine.getCurrentPlayer(s),
          ),
        });
      }

      if (iterations % params.stopPollInterval === 0 && stopSignal.shouldStop()) {
        stopped = true;
        break;
      }
    }

    const outcome = profiler.time('buildOutcome', () =>
      this.buildOutcome(root, rootPlayer, params, iterations, stopped, next, profiler),
    );

    logger?.onSearchEnd?.({
      iterations,
      stopped,
      bestMoveKey: outcome.bestMove?.key ?? null,
      children: outcome.children.map((c) => ({
        moveKey: c.move.key,
        visits: c.visits,
        wins: c.wins,
        winRate: c.winRate,
      })),
      principalVariation: outcome.principalVariation,
      profile: outcome.statistics.profile,
    });

    return outcome;
  }

  private runIteration(
    root: MCTSNode<S, M>,
    rootPlayer: PlayerId,
    params: SearchParams,
    functions: SearchInput<S, M>['functions'],
    next: RandomFn,
    profiler: SearchProfiler,
  ): void {
    let node = root;

    profiler.start('selection');
    while (!this.gameEngine.isTerminal(node.state)) {
      const hasUntried = node.untriedMoves === undefined || node.untriedMoves.length > 0;
      if (hasUntried || node.children.size === 0) break;
      node = this.selectUctChild(node, params.explorationConstant, params.movePriorWeight, next);
    }
    profiler.stop('selection');

    let rolloutStart = node;

    profiler.start('expansion');
    if (!this.gameEngine.isTerminal(node.state)) {
      if (node.untriedMoves === undefined) {
        node.untriedMoves = functions.generateMoves(node.state, rootPlayer);
        node.untriedMoves.sort((a, b) => b.heuristicValue - a.heuristicValue);
      }

      const move = node.untriedMoves.shift();
      if (move !== undefined) {
        const childState = functions.makeMove(node.state, move);
        const child: MCTSNode<S, M> = {
          state: childState,
          move,
          parent: node,
          children: new Map(),
          visits: 0,
          wins: 0,
        };
        node.children.set(move.key, child);
        rolloutStart = child;
      }
    }
    profiler.stop('expansion');

    const rolloutValue = this.rollout(
      rolloutStart,
      rootPlayer,
      params.maxRolloutPlies,
      functions,
      next,
      profiler,
    );

    profiler.start('backprop');
    this.backpropagate(rolloutStart, rolloutValue, profiler);
    profiler.stop('backprop');
  }

  private selectUctChild(
    node: MCTSNode<S, M>,
    explorationConstant: number,
    movePriorWeight: number,
    next: RandomFn,
  ): MCTSNode<S, M> {
    const parentPlayer = this.gameEngine.getCurrentPlayer(node.state);
    let bestScore = -Infinity;
    const tied: MCTSNode<S, M>[] = [];

    for (const child of node.children.values()) {
      const childPlayer = this.gameEngine.getCurrentPlayer(child.state);
      let exploitation = child.wins / child.visits;
      if (childPlayer !== parentPlayer) {
        exploitation = 1 - exploitation;
      }

      const exploration =
        explorationConstant * Math.sqrt(Math.log(node.visits) / child.visits);
      const prior =
        movePriorWeight > 0 && child.move !== null ? movePriorWeight * child.move.heuristicValue : 0;
      const score = exploitation + exploration + prior;

      if (score > bestScore) {
        bestScore = score;
        tied.length = 0;
        tied.push(child);
      } else if (score === bestScore) {
        tied.push(child);
      }
    }

    if (tied.length === 1) return tied[0]!;

    const indices = tied.map((_, i) => i);
    return tied[pickRandomIndex(next, indices)]!;
  }

  private rollout(
    startNode: MCTSNode<S, M>,
    rootPlayer: PlayerId,
    maxPlies: number,
    functions: SearchInput<S, M>['functions'],
    next: RandomFn,
    profiler: SearchProfiler,
  ): number {
    return profiler.time('rollout', () => {
      const playerToMove = this.gameEngine.getCurrentPlayer(startNode.state);
      const rolloutState = startNode.state.clone() as S;
      let plies = 0;

      while (!this.gameEngine.isTerminal(rolloutState) && plies < maxPlies) {
        if (profiler.enabled) profiler.rolloutGenerateRolloutMoveCalls++;
        const move = profiler.timeRolloutStep('generateRolloutMove', () =>
          functions.generateRolloutMove(rolloutState, rootPlayer, next),
        );
        if (move === null) break;
        if (profiler.enabled) profiler.rolloutApplyMoveCalls++;
        profiler.timeRolloutStep('applyMove', () => functions.applyMove(rolloutState, move));
        plies++;
        if (profiler.enabled) profiler.rolloutPlies++;
      }

      if (this.gameEngine.isTerminal(rolloutState)) {
        return outcomeToValue(this.gameEngine.getOutcome(rolloutState, playerToMove));
      }

      return functions.evaluatePosition(rolloutState, playerToMove);
    });
  }

  private backpropagate(
    startNode: MCTSNode<S, M>,
    initialValue: number,
    profiler: SearchProfiler,
  ): void {
    let v = initialValue;
    let node: MCTSNode<S, M> | null = startNode;

    while (node !== null) {
      node.visits++;
      node.wins += v;
      if (profiler.enabled) profiler.backpropSteps++;

      if (node.parent !== null) {
        const playerAtNode = this.gameEngine.getCurrentPlayer(node.state);
        const playerAtParent = this.gameEngine.getCurrentPlayer(node.parent.state);
        // Flip only when side-to-move changes. Multi-phase games (e.g. Quarto place→give
        // for the same placer) keep currentPlayer across consecutive tree edges.
        if (playerAtNode !== playerAtParent) {
          v = 1 - v;
        }
      }

      node = node.parent;
    }
  }

  private buildOutcome(
    root: MCTSNode<S, M>,
    rootPlayer: PlayerId,
    params: SearchParams,
    iterations: number,
    stopped: boolean,
    next: RandomFn,
    profiler: SearchProfiler,
  ): SearchOutcome<M> {
    const children: SearchOutcome<M>['children'] = [];

    for (const child of root.children.values()) {
      if (child.move === null || child.visits === 0) continue;
      children.push({
        move: child.move,
        visits: child.visits,
        wins: child.wins,
        winRate: this.childWinRateForRoot(child, rootPlayer),
      });
    }

    const bestMove = this.pickBestMove(children, params.selectionPolicy, next);
    const bestMoveWinRate =
      bestMove === null
        ? null
        : (children.find((child) => child.move.key === bestMove.key)?.winRate ?? null);

    return {
      bestMove,
      iterations,
      stopped,
      statistics: {
        nodesExpanded: countTreeNodes(root) - 1,
        maxDepth: measureMaxDepth(root),
        bestMoveWinRate,
        profile: profiler.finalize(iterations),
      },
      principalVariation: extractPrincipalVariation(root, rootPlayer, (state) =>
        this.gameEngine.getCurrentPlayer(state),
      ),
      children,
    };
  }

  private childWinRateForRoot(child: MCTSNode<S, M>, rootPlayer: PlayerId): number {
    const rate = child.wins / child.visits;
    const playerAtChild = this.gameEngine.getCurrentPlayer(child.state);
    return playerAtChild === rootPlayer ? rate : 1 - rate;
  }

  private pickBestMove(
    children: SearchOutcome<M>['children'],
    selectionPolicy: 'robust' | 'maxValue',
    next: RandomFn,
  ): M | null {
    if (children.length === 0) return null;

    let bestMetric = -Infinity;
    const tied: M[] = [];

    for (const child of children) {
      const metric = selectionPolicy === 'robust' ? child.visits : child.winRate;

      if (metric > bestMetric) {
        bestMetric = metric;
        tied.length = 0;
        tied.push(child.move);
      } else if (metric === bestMetric) {
        tied.push(child.move);
      }
    }

    if (tied.length === 1) return tied[0]!;

    const indices = tied.map((_, i) => i);
    return tied[pickRandomIndex(next, indices)]!;
  }
}
