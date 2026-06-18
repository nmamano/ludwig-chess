// Dummy eval source for slice 1b: white-relative material balance in centipawns,
// derived from a FEN via chess.js. Slice 1c replaces this SOURCE with Stockfish;
// the bar and the mapping (evalbar.ts) do not change.
//
// Kept free of @shared and DOM imports so the root test runner can import it
// directly. Fails closed (returns 0) on an invalid FEN rather than throwing into
// the render / evidence effect.

import { Chess } from "chess.js";
import type { PieceSymbol } from "chess.js";

// Standard piece values; the king is excluded (value 0).
const VALUE: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export function materialEvalCp(fen: string): number {
  try {
    let cp = 0;
    for (const row of new Chess(fen).board()) {
      for (const cell of row) {
        if (!cell) continue;
        const v = VALUE[cell.type];
        cp += cell.color === "w" ? v : -v;
      }
    }
    return cp;
  } catch {
    return 0;
  }
}
