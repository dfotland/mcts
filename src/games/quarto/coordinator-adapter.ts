import type { GameCoordinatorAdapter } from '../../contracts/coordinator';
import type { SerializedMove } from '../../contracts/player';
import { QUARTO_GAME_ID } from './engine';
import { createGiveMove, createPlaceMove, parseGiveMoveKey, parsePlaceMoveKey } from './move';
import { type QuartoPiece } from './piece';
import { quartoBasicSearch } from './search-functions';
import { deserializeQuartoState, findPieceByKey, isTerminalState, opponent } from './state';

function pieceFromSerialized(raw: unknown): QuartoPiece {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid piece payload');
  }
  const obj = raw as Record<string, unknown>;
  const piece: QuartoPiece = {
    height: obj.height as QuartoPiece['height'],
    color: obj.color as QuartoPiece['color'],
    shape: obj.shape as QuartoPiece['shape'],
    top: obj.top as QuartoPiece['top'],
  };
  return piece;
}

function moveFromSerialized(statePayload: ReturnType<typeof deserializeQuartoState>, move: SerializedMove) {
  const parsedPlace = parsePlaceMoveKey(String(move.key));
  if (parsedPlace !== null) {
    return createPlaceMove(parsedPlace.player, parsedPlace.row, parsedPlace.col);
  }

  const parsedGive = parseGiveMoveKey(String(move.key));
  if (parsedGive !== null) {
    const piece =
      findPieceByKey(statePayload.availablePieces, `${parsedGive.piece.height}-${parsedGive.piece.color}-${parsedGive.piece.shape}-${parsedGive.piece.top}`) ??
      parsedGive.piece;
    return createGiveMove(parsedGive.player, piece);
  }

  const phase = move.phase;
  const player = move.player as 0 | 1 | undefined;

  if (phase === 'place' && player !== undefined) {
    const row = move.row as number;
    const col = move.col as number;
    return createPlaceMove(player, row, col);
  }

  if (phase === 'give' && player !== undefined) {
    const piece = pieceFromSerialized(move.piece);
    const available =
      findPieceByKey(statePayload.availablePieces, `${piece.height}-${piece.color}-${piece.shape}-${piece.top}`) ??
      piece;
    return createGiveMove(player, available);
  }

  throw new Error(`Invalid quarto move payload: ${JSON.stringify(move)}`);
}

export const quartoCoordinatorAdapter: GameCoordinatorAdapter = {
  gameId: QUARTO_GAME_ID,
  maxPliesPerTurn: 2,

  getCurrentPhase(state) {
    return deserializeQuartoState(state).currentPhase;
  },

  getCurrentPlayer(state) {
    return deserializeQuartoState(state).currentPlayer;
  },

  applyMove(state, move) {
    const gameState = deserializeQuartoState(state);
    const gameMove = moveFromSerialized(gameState, move);
    return quartoBasicSearch.makeMove(gameState, gameMove).serialize();
  },

  isTerminal(state) {
    return isTerminalState(deserializeQuartoState(state));
  },

  isTurnComplete(stateBefore, stateAfter) {
    const before = deserializeQuartoState(stateBefore);
    const after = deserializeQuartoState(stateAfter);

    if (isTerminalState(after)) return true;
    if (after.currentPlayer !== before.currentPlayer) return true;
    return false;
  },

  timeLimitForPly(plyIndex, totalTimeLimitMs) {
    if (plyIndex === 0) return Math.floor(totalTimeLimitMs * 0.65);
    return Math.max(1, totalTimeLimitMs - Math.floor(totalTimeLimitMs * 0.65));
  },
};

export function appPlayerToMcts(player: 1 | 2): 0 | 1 {
  return (player - 1) as 0 | 1;
}

export function mctsPlayerToApp(player: 0 | 1): 1 | 2 {
  return (player + 1) as 1 | 2;
}

export function opponentAppPlayer(player: 1 | 2): 1 | 2 {
  return mctsPlayerToApp(opponent(appPlayerToMcts(player)));
}
