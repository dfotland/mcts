export interface QuartoPiece {
  readonly height: 'tall' | 'short';
  readonly color: 'light' | 'dark';
  readonly shape: 'square' | 'round';
  readonly top: 'smooth' | 'split';
}

export function pieceKey(piece: QuartoPiece): string {
  return `${piece.height}-${piece.color}-${piece.shape}-${piece.top}`;
}

export function piecesEqual(a: QuartoPiece, b: QuartoPiece): boolean {
  return pieceKey(a) === pieceKey(b);
}

export function parsePieceKey(key: string): QuartoPiece | null {
  const match = /^(tall|short)-(light|dark)-(square|round)-(smooth|split)$/.exec(key);
  if (!match) return null;
  return {
    height: match[1] as QuartoPiece['height'],
    color: match[2] as QuartoPiece['color'],
    shape: match[3] as QuartoPiece['shape'],
    top: match[4] as QuartoPiece['top'],
  };
}

/** Fixed catalog size; indices 0–15 match `generateAllPieces` order. */
export const QUARTO_PIECE_COUNT = 16;

/** Stable 0–15 index: tall/light/square/smooth = 0 … short/dark/round/split = 15. */
export function pieceIndex(piece: QuartoPiece): number {
  return (
    (piece.height === 'short' ? 8 : 0) +
    (piece.color === 'dark' ? 4 : 0) +
    (piece.shape === 'round' ? 2 : 0) +
    (piece.top === 'split' ? 1 : 0)
  );
}

export function pieceAtIndex(index: number): QuartoPiece {
  return {
    height: (index & 8) !== 0 ? 'short' : 'tall',
    color: (index & 4) !== 0 ? 'dark' : 'light',
    shape: (index & 2) !== 0 ? 'round' : 'square',
    top: (index & 1) !== 0 ? 'split' : 'smooth',
  };
}

export function generateAllPieces(): QuartoPiece[] {
  const pieces: QuartoPiece[] = [];
  for (let index = 0; index < QUARTO_PIECE_COUNT; index++) {
    pieces.push(pieceAtIndex(index));
  }
  return pieces;
}
