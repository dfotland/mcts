import type { RolloutMovePick } from '../../contracts/search-functions';
import { wouldCompleteLine } from './board';
import { createGiveMove, createPlaceMove, type QuartoGiveMove, type QuartoMove, type QuartoPlaceMove } from './move';
import { pieceIndex } from './piece';
import { rolloutEmptyCells, rolloutLethalGiveMask } from './rules';
import type { QuartoState } from './state';

function pickPlayoutPlaceMove(
  state: QuartoState,
  rng: () => number,
): RolloutMovePick<QuartoPlaceMove> | null {
  if (state.stagedPiece === null) return null;

  const emptyCells = rolloutEmptyCells(state);
  if (emptyCells.length === 0) return null;

  for (const { row, col } of emptyCells) {
    if (wouldCompleteLine(state.board, state.stagedPiece, row, col)) {
      return {
        move: createPlaceMove(state.currentPlayer, row, col),
        terminalAfterApply: true,
      };
    }
  }

  const cell = emptyCells[Math.floor(rng() * emptyCells.length)]!;
  return createPlaceMove(state.currentPlayer, cell.row, cell.col);
}

function pickPlayoutGiveMove(state: QuartoState, rng: () => number): QuartoGiveMove | null {
  const pieces = state.availablePieces;
  if (pieces.length === 0) return null;

  const lethalMask = rolloutLethalGiveMask(state);

  let safeCount = 0;
  for (const piece of pieces) {
    if ((lethalMask & (1 << pieceIndex(piece))) === 0) safeCount++;
  }

  const poolSize = safeCount > 0 ? safeCount : pieces.length;
  let pick = Math.floor(rng() * poolSize);

  for (const piece of pieces) {
    const lethal = (lethalMask & (1 << pieceIndex(piece))) !== 0;
    if (safeCount > 0 && lethal) continue;
    if (pick === 0) return createGiveMove(state.currentPlayer, piece);
    pick--;
  }

  return null;
}

export function pickPlayoutMove(state: QuartoState, rng: () => number): RolloutMovePick<QuartoMove> | null {
  if (state.currentPhase === 'place' && state.stagedPiece !== null) {
    return pickPlayoutPlaceMove(state, rng);
  }

  if (state.currentPhase === 'give') {
    return pickPlayoutGiveMove(state, rng);
  }

  return null;
}
