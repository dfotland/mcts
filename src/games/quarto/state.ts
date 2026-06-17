import type { GameState } from '../../contracts/game-state';
import type { Outcome, PhaseId, PlayerId, SerializedGameState } from '../../contracts/player';
import { hasWinningLine, isBoardFull, QuartoBoard } from './board';
import type { QuartoPhase } from './move';
import { type QuartoPiece, generateAllPieces, parsePieceKey, piecesEqual } from './piece';

export interface QuartoState extends GameState<QuartoBoard> {
  readonly board: QuartoBoard;
  readonly currentPlayer: PlayerId;
  readonly currentPhase: QuartoPhase;
  readonly availablePieces: QuartoPiece[];
  readonly stagedPiece: QuartoPiece | null;
}

function serializePiece(piece: QuartoPiece): Record<string, string> {
  return { height: piece.height, color: piece.color, shape: piece.shape, top: piece.top };
}

function deserializePiece(raw: unknown): QuartoPiece | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const height = obj.height;
  const color = obj.color;
  const shape = obj.shape;
  const top = obj.top;
  if (
    (height !== 'tall' && height !== 'short') ||
    (color !== 'light' && color !== 'dark') ||
    (shape !== 'square' && shape !== 'round') ||
    (top !== 'smooth' && top !== 'split')
  ) {
    return null;
  }
  return { height, color, shape, top };
}

function deserializeBoardCells(cells: unknown): QuartoBoard {
  if (!Array.isArray(cells)) return new QuartoBoard();

  const rows = cells.map((row) => {
    if (!Array.isArray(row)) return Array.from({ length: 4 }, () => null);
    return row.map((cell) => {
      if (cell === null) return null;
      return deserializePiece(cell);
    });
  });

  return new QuartoBoard(rows as QuartoBoard['cells']);
}

export function createQuartoState(options?: {
  board?: QuartoBoard;
  currentPlayer?: PlayerId;
  currentPhase?: QuartoPhase;
  availablePieces?: QuartoPiece[];
  stagedPiece?: QuartoPiece | null;
}): QuartoState {
  const board = options?.board ?? new QuartoBoard();
  const currentPlayer = options?.currentPlayer ?? 0;
  const currentPhase = options?.currentPhase ?? 'give';
  const availablePieces = options?.availablePieces ?? generateAllPieces();
  const stagedPiece = options?.stagedPiece ?? null;

  return {
    board,
    currentPlayer,
    currentPhase,
    availablePieces,
    stagedPiece,
    clone() {
      return createQuartoState({
        board: this.board.clone(),
        currentPlayer: this.currentPlayer,
        currentPhase: this.currentPhase,
        availablePieces: this.availablePieces.map((p) => ({ ...p })),
        stagedPiece: this.stagedPiece ? { ...this.stagedPiece } : null,
      });
    },
    serialize() {
      return {
        cells: this.board.cells.map((row) =>
          row.map((cell) => (cell === null ? null : serializePiece(cell))),
        ),
        currentPlayer: this.currentPlayer,
        currentPhase: this.currentPhase,
        availablePieces: this.availablePieces.map(serializePiece),
        stagedPiece: this.stagedPiece ? serializePiece(this.stagedPiece) : null,
      };
    },
  };
}

export function deserializeQuartoState(payload: SerializedGameState): QuartoState {
  const board = deserializeBoardCells(payload.cells);
  const currentPlayer = (payload.currentPlayer as PlayerId | undefined) ?? 0;
  const currentPhase = (payload.currentPhase as QuartoPhase | undefined) ?? 'give';

  const availablePiecesRaw = payload.availablePieces;
  const availablePieces: QuartoPiece[] = Array.isArray(availablePiecesRaw)
    ? availablePiecesRaw
        .map((item) => deserializePiece(item))
        .filter((piece): piece is QuartoPiece => piece !== null)
    : generateAllPieces();

  const stagedRaw = payload.stagedPiece;
  const stagedPiece =
    stagedRaw === null || stagedRaw === undefined ? null : deserializePiece(stagedRaw);

  return createQuartoState({
    board,
    currentPlayer,
    currentPhase,
    availablePieces,
    stagedPiece,
  });
}

export function opponent(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

export function getWinner(state: QuartoState): PlayerId | null {
  if (!hasWinningLine(state.board)) return null;
  return state.currentPlayer;
}

export function isTerminalState(state: QuartoState): boolean {
  if (hasWinningLine(state.board)) return true;
  return isBoardFull(state.board);
}

export function outcomeForPlayer(state: QuartoState, perspectivePlayer: PlayerId): Outcome {
  if (!isTerminalState(state)) {
    throw new Error('outcomeForPlayer called on non-terminal quarto state');
  }

  const winner = getWinner(state);
  if (winner === null) return 0;
  return winner === perspectivePlayer ? 1 : -1;
}

export function currentPhaseId(state: QuartoState): PhaseId {
  return state.currentPhase;
}

export function removePiece(pieces: QuartoPiece[], piece: QuartoPiece): QuartoPiece[] {
  return pieces.filter((p) => !piecesEqual(p, piece));
}

export function findPieceByKey(pieces: QuartoPiece[], key: string): QuartoPiece | undefined {
  const parsed = parsePieceKey(key);
  if (parsed === null) return undefined;
  return pieces.find((p) => piecesEqual(p, parsed));
}
