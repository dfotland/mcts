import type { Move } from './move';
import type { PhaseId, PlayerId } from './player';
import type { SearchProfile } from './search-profile';

export interface PrincipalVariationStep {
  moveKey: string;
  /** Player encoded on the move (actor who gave or placed). */
  player: PlayerId;
  phase: PhaseId;
  /** Side to move in the position after this move is applied. */
  sideToMoveAfter: PlayerId;
  visits: number;
  wins: number;
  /** Win rate for `sideToMoveAfter` at this node (`wins / visits`). */
  sideToMoveWinRate: number;
  /** Win rate from the searching (root) player's perspective. */
  winRate: number;
}

export interface SearchStatistics {
  /** Tree nodes created excluding the root. */
  nodesExpanded: number;
  /** Deepest edge count from root in the search tree. */
  maxDepth: number;
  /** Root-perspective win rate of the selected best move, if known. */
  bestMoveWinRate: number | null;
  /** Phase timings and counters when `profileSearch` was enabled. */
  profile?: SearchProfile;
}

export interface SearchOutcome<M extends Move = Move> {
  bestMove: M | null;
  iterations: number;
  stopped: boolean;
  statistics: SearchStatistics;
  /** Robust line: highest-visit child at each ply from the root. */
  principalVariation: PrincipalVariationStep[];
  children: Array<{
    move: M;
    visits: number;
    wins: number;
    winRate: number;
  }>;
}
