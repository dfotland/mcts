/** Zero-based player index. v1: 0 = first player, 1 = second player. */
export type PlayerId = 0 | 1;

/**
 * Opaque phase id within a turn. Game-defined.
 * Examples: 'place' | 'give' (Quarto), 0 | 1 | 2 | 3 (Arimaa step index), 'main' (chess/go).
 */
export type PhaseId = string | number;

/** Win / draw / loss from the perspective of the player being optimized for. */
export type Outcome = -1 | 0 | 1;

export type SerializedGameState = Record<string, unknown>;
export type SerializedSearchParameters = Record<string, unknown>;
export type SerializedMove = Record<string, unknown>;
