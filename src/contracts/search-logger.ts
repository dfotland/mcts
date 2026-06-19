import type { SearchProfile } from './search-profile';

export interface SearchChildSummary {
  moveKey: string;
  visits: number;
  wins: number;
  winRate: number;
}

export interface SearchLogger {
  onSearchStart?(context: {
    rootPlayer: import('./player').PlayerId;
    seed: number;
    maxIterations: number;
  }): void;

  onIteration?(context: {
    iteration: number;
    rootVisits: number;
    topChildren: SearchChildSummary[];
  }): void;

  onSearchEnd?(context: {
    iterations: number;
    stopped: boolean;
    bestMoveKey: string | null;
    children: SearchChildSummary[];
    principalVariation: import('./search-outcome').PrincipalVariationStep[];
    profile?: SearchProfile;
  }): void;
}
