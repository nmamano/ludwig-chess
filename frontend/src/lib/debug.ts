// The headless-browser gate's evidence surface. We mirror the AUTHORITATIVE
// snapshot onto window.__ludwig and the derived eval onto window.__ludwigEval so
// the gate asserts on data, never on rendered pixels. window.__ludwigError carries
// the last server error code, and window.__ludwigMove is a test-only seam to drive
// a move through the real client socket. All diagnostic; app logic never reads it.

import type { PlayerId, RoomSnapshot } from "@shared/protocol";
import type { PromotionPiece, Square } from "@shared/chess";

export interface LudwigDebug {
  code: string;
  fen: string;
  turn: RoomSnapshot["turn"];
  check: boolean;
  result: RoomSnapshot["result"];
  lastMove: RoomSnapshot["lastMove"];
  lobby: RoomSnapshot["lobby"];
  you: PlayerId | null;
  players: RoomSnapshot["players"];
}

// Stable eval contract. In slice 1b source is "material" and depth/mate stay null
// and updating stays false. In 1c source becomes "stockfish", depth/updating go
// live, and the rest of the shape (and the `fen` correlation) is unchanged. `fen`
// proves the eval belongs to the current authoritative position.
export interface LudwigEvalDebug {
  source: "material" | "stockfish";
  fen: string;
  whiteCp: number | null;
  mate: number | null;
  depth: number | null;
  updating: boolean;
  fillPct: number;
  label: string;
}

declare global {
  interface Window {
    __ludwig?: LudwigDebug | null;
    __ludwigEval?: LudwigEvalDebug | null;
    __ludwigError?: string | null;
    __ludwigMove?: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  }
}

export function publishDebug(snapshot: RoomSnapshot | null, you: PlayerId | null): void {
  if (typeof window === "undefined") return;
  window.__ludwig = snapshot
    ? {
        code: snapshot.code,
        fen: snapshot.fen,
        turn: snapshot.turn,
        check: snapshot.check,
        result: snapshot.result,
        lastMove: snapshot.lastMove,
        lobby: snapshot.lobby,
        you,
        players: snapshot.players,
      }
    : null;
}

export function publishEval(e: LudwigEvalDebug | null): void {
  if (typeof window === "undefined") return;
  window.__ludwigEval = e;
}

export function publishError(code: string | null): void {
  if (typeof window === "undefined") return;
  window.__ludwigError = code;
}
