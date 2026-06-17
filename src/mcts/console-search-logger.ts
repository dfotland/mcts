import type { SearchChildSummary, SearchLogger } from '../contracts/search-logger';
import { formatPrincipalVariation, formatRootChildrenSummary } from './principal-variation';

export class ConsoleSearchLogger implements SearchLogger {
  private readonly label: string;

  constructor(label = 'MCTS') {
    this.label = label;
  }

  onSearchStart(context: {
    rootPlayer: import('../contracts/player').PlayerId;
    seed: number;
    maxIterations: number;
  }): void {
    console.log(
      `[${this.label}] search start — rootPlayer=${context.rootPlayer} seed=${context.seed} maxIterations=${context.maxIterations}`,
    );
  }

  onIteration(context: {
    iteration: number;
    rootVisits: number;
    topChildren: SearchChildSummary[];
  }): void {
    const lines = context.topChildren
      .map((c) => `${c.moveKey} visits=${c.visits} winRate=${c.winRate.toFixed(3)}`)
      .join(', ');
    console.log(
      `[${this.label}] iter ${context.iteration} rootVisits=${context.rootVisits} top: ${lines || '(none)'}`,
    );
  }

  onSearchEnd(context: {
    iterations: number;
    stopped: boolean;
    bestMoveKey: string | null;
    children: SearchChildSummary[];
    principalVariation: import('../contracts/search-outcome').PrincipalVariationStep[];
  }): void {
    const lines = context.children
      .map((c) => `  ${c.moveKey} visits=${c.visits} wins=${c.wins.toFixed(2)} winRate=${c.winRate.toFixed(3)}`)
      .join('\n');
    console.log(
      `[${this.label}] search end — iterations=${context.iterations} stopped=${context.stopped} best=${context.bestMoveKey ?? 'null'}\n${lines}`,
    );
    console.log(formatPrincipalVariation(context.principalVariation, `${this.label} PV`));
    console.log(
      formatRootChildrenSummary(
        context.children.map((c) => ({
          moveKey: c.moveKey,
          visits: c.visits,
          wins: c.wins,
          winRate: c.winRate,
        })),
        `${this.label} root`,
      ),
    );
  }
}
