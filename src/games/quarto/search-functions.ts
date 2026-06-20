import type { SearchFunctions } from '../../contracts/search-functions';
import type { SearchProfile } from '../../contracts/search-profile';
import {
  getWouldCompleteLineProfile,
  hasWinningLine,
  isBoardFull,
  QuartoBoard,
  resetWouldCompleteLineProfile,
  setWouldCompleteLineProfiling,
} from './board';
import {
  createGiveMove,
  createPlaceMove,
  parseGiveMoveKey,
  parsePlaceMoveKey,
  type QuartoGiveMove,
  type QuartoMove,
  type QuartoPlaceMove,
} from './move';
import { pickPlayoutMove } from './playout-policy';
import {
  applyGiveMove,
  applyGiveMoveInPlace,
  applyPlaceMove,
  applyPlaceMoveInPlace,
  initRolloutScratch,
  isRolloutScratchTerminal,
} from './rules';
import { getWinner, isTerminalState, type QuartoState } from './state';
import {
  countSafeAvailablePiecesForTree,
  generateTreeMoves,
  stagedPieceCanWinForTree,
  type TreeHeuristic,
} from './tree-policy';

function createSearchFunctions(heuristic: TreeHeuristic): SearchFunctions<QuartoState, QuartoMove> {
  return {
    generateMoves(state, perspectivePlayer) {
      return generateTreeMoves(state, perspectivePlayer, heuristic);
    },

    generateRolloutMove(state, _perspectivePlayer, rng) {
      return pickPlayoutMove(state, rng);
    },

    beginRollout(state) {
      initRolloutScratch(state);
    },

    isRolloutTerminal(state) {
      return isRolloutScratchTerminal(state);
    },

    evaluatePosition(state, perspectivePlayer) {
      if (isTerminalState(state)) {
        const winner = getWinner(state);
        if (winner === null) return 0.5;
        return winner === perspectivePlayer ? 1 : 0;
      }

      if (state.currentPhase === 'place' && state.stagedPiece !== null) {
        if (stagedPieceCanWinForTree(state)) {
          return perspectivePlayer === state.currentPlayer ? 1 : 0;
        }
      }

      if (heuristic === 'uniform') return 0.5;

      const safeCount = countSafeAvailablePiecesForTree(state);
      const normalized =
        state.availablePieces.length === 0 ? 0.5 : safeCount / state.availablePieces.length;
      return 0.35 + normalized * 0.3;
    },

    makeMove(state, move) {
      if (move.phase === 'place') {
        return applyPlaceMove(state, move as QuartoPlaceMove);
      }
      return applyGiveMove(state, move as QuartoGiveMove);
    },

    applyMove(state, move) {
      if (move.phase === 'place') {
        applyPlaceMoveInPlace(state, move as QuartoPlaceMove);
        return;
      }
      applyGiveMoveInPlace(state, move as QuartoGiveMove);
    },

    beginProfileSampling() {
      resetWouldCompleteLineProfile();
      setWouldCompleteLineProfiling(true);
    },

    augmentSearchProfile(profile: SearchProfile): SearchProfile {
      setWouldCompleteLineProfiling(false);
      const { ms, calls } = getWouldCompleteLineProfile();
      return {
        ...profile,
        wouldCompleteLine: {
          ms,
          calls,
          totalShare: profile.totalMs > 0 ? ms / profile.totalMs : 0,
        },
      };
    },
  };
}

export const quartoUniformSearch = createSearchFunctions('uniform');
export const quartoBasicSearch = createSearchFunctions('basic');

export function makeMoveFromKey(state: QuartoState, key: string): QuartoMove | null {
  const place = parsePlaceMoveKey(key);
  if (place !== null && state.currentPhase === 'place' && place.player === state.currentPlayer) {
    if (state.stagedPiece === null || state.board.get(place.row, place.col) !== null) {
      return null;
    }
    return createPlaceMove(place.player, place.row, place.col);
  }

  const give = parseGiveMoveKey(key);
  if (give !== null && state.currentPhase === 'give' && give.player === state.currentPlayer) {
    const piece = state.availablePieces.find(
      (p) =>
        p.height === give.piece.height &&
        p.color === give.piece.color &&
        p.shape === give.piece.shape &&
        p.top === give.piece.top,
    );
    if (piece === undefined) return null;
    return createGiveMove(give.player, piece);
  }

  return null;
}

export function isBoardTerminal(board: QuartoBoard): boolean {
  return hasWinningLine(board) || isBoardFull(board);
}
