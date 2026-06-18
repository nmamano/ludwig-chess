// Public chess types shared by the server and the frontend. chess.js is the
// single rules authority; this module centralizes the ONE public color
// representation (white/black) and the conversion to and from chess.js w/b, so
// conversions never scatter across server and frontend. Browser-safe: types and
// pure helpers only.

import type { Square } from "chess.js";

export type { Square };

export type Color = "white" | "black";
export type PromotionPiece = "q" | "r" | "b" | "n";

export interface LastMove {
  from: Square;
  to: Square;
}

export type DrawReason = "stalemate" | "threefold" | "fifty-move" | "insufficient-material";

// Discriminated result with stable reasons. Checkmate is the only win reason in
// this slice (resignation/timeout are out of scope).
export type GameResult =
  | { kind: "win"; winner: Color; reason: "checkmate" }
  | { kind: "draw"; reason: DrawReason };

// chess.js uses w/b internally. white/black is the only public representation.
export function toColor(c: "w" | "b"): Color {
  return c === "w" ? "white" : "black";
}
export function toChessColor(c: Color): "w" | "b" {
  return c === "white" ? "w" : "b";
}

const PROMOTIONS: readonly PromotionPiece[] = ["q", "r", "b", "n"];

// Wire validators. A move payload must carry real a1-h8 squares and, if present, a
// q/r/b/n promotion. Anything else is structurally malformed (bad_message); a
// well-formed but chess-illegal move is rejected later as illegal_move.
export function isSquare(v: unknown): v is Square {
  return typeof v === "string" && /^[a-h][1-8]$/.test(v);
}
export function isPromotion(v: unknown): v is PromotionPiece {
  return typeof v === "string" && (PROMOTIONS as readonly string[]).includes(v);
}

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}
