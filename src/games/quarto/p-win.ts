import { QUARTO_BOARD_SIZE } from './board';

/** Empty cells on an empty 4×4 board. */
export const QUARTO_MAX_EMPTY_CELLS = QUARTO_BOARD_SIZE * QUARTO_BOARD_SIZE;

/** Floor on remaining-moves weight so opening still ranks quiet moves. */
export const ENDGAME_WEIGHT_MIN = 0.25;

/**
 * How much to trust a non-forced tactical P(win).
 * Opening (16 empty) → `ENDGAME_WEIGHT_MIN`; full board → 1.
 */
export function endgameWeight(emptyCount: number): number {
  const remaining = Math.min(QUARTO_MAX_EMPTY_CELLS, Math.max(0, emptyCount));
  return (
    ENDGAME_WEIGHT_MIN +
    (1 - ENDGAME_WEIGHT_MIN) * (1 - remaining / QUARTO_MAX_EMPTY_CELLS)
  );
}

/**
 * Pull an uncertain tactical estimate toward 0.5 when many places remain.
 * Forced 0/1 outcomes must not use this.
 */
export function blendTowardDraw(pTactical: number, emptyCount: number): number {
  return 0.5 + (pTactical - 0.5) * endgameWeight(emptyCount);
}

/**
 * Map safe-piece fraction to P(win) for side-to-move before remaining-moves blend.
 * None safe → 0.2; all safe → 0.8.
 */
export function pWinFromSafeFraction(safeFraction: number): number {
  return 0.5 + 0.3 * (2 * safeFraction - 1);
}
