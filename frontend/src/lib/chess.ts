// Client-side chess helpers. chess.js is reused ONLY for rendering and advisory
// move hints; the SERVER is the sole authority on legality. Nothing here is ever
// trusted, it just decorates the board.

import { Chess } from "chess.js";
import type { Square, PieceSymbol } from "chess.js";
import { toColor } from "@shared/chess";
import type { Color } from "@shared/chess";

export type { Square, PieceSymbol };

export interface UiPiece {
  type: PieceSymbol;
  color: Color;
}

const FILES = "abcdefgh";

export function fileIndex(square: Square): number {
  return square.charCodeAt(0) - 97;
}
export function rankIndex(square: Square): number {
  return Number(square[1]) - 1;
}
export function isDarkSquare(square: Square): boolean {
  return (fileIndex(square) + rankIndex(square)) % 2 === 0;
}

// 64 squares in display order: white orientation = rank 8 at top, file a at left;
// black orientation = rotated 180 degrees.
export function squaresInDisplayOrder(orientation: Color): Square[] {
  const ranks = orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const out: Square[] = [];
  for (const r of ranks) {
    for (const f of files) out.push(`${FILES[f]}${r}` as Square);
  }
  return out;
}

// Occupied squares -> piece, derived from a FEN. Presentation only. Color
// conversion goes through the shared helper (one public representation).
export function piecesFromFen(fen: string): Map<Square, UiPiece> {
  const map = new Map<Square, UiPiece>();
  for (const row of new Chess(fen).board()) {
    for (const cell of row) {
      if (cell) map.set(cell.square, { type: cell.type, color: toColor(cell.color) });
    }
  }
  return map;
}

// Advisory legal destinations for the piece on `from` (side to move only).
export function legalTargets(fen: string, from: Square): Square[] {
  try {
    const moves = new Chess(fen).moves({ square: from, verbose: true });
    return [...new Set(moves.map((m) => m.to))];
  } catch {
    return [];
  }
}

// Does from->to require choosing a promotion piece?
export function needsPromotion(fen: string, from: Square, to: Square): boolean {
  try {
    return new Chess(fen)
      .moves({ square: from, verbose: true })
      .some((m) => m.to === to && Boolean(m.promotion));
  } catch {
    return false;
  }
}

// Square of the side-to-move king when it is in check (for a highlight), else null.
export function checkedKingSquare(fen: string): Square | null {
  const chess = new Chess(fen);
  if (!chess.inCheck()) return null;
  const turn = chess.turn();
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type === "k" && cell.color === turn) return cell.square;
    }
  }
  return null;
}
