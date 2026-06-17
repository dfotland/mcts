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

export function generateAllPieces(): QuartoPiece[] {
  const pieces: QuartoPiece[] = [];
  const heights: QuartoPiece['height'][] = ['tall', 'short'];
  const colors: QuartoPiece['color'][] = ['light', 'dark'];
  const shapes: QuartoPiece['shape'][] = ['square', 'round'];
  const tops: QuartoPiece['top'][] = ['smooth', 'split'];

  for (const height of heights) {
    for (const color of colors) {
      for (const shape of shapes) {
        for (const top of tops) {
          pieces.push({ height, color, shape, top });
        }
      }
    }
  }

  return pieces;
}
