// The headless-browser gate's evidence surface. We mirror the AUTHORITATIVE
// snapshot onto window.__ludwig so the gate asserts on the server's own FEN/turn/
// result, never on rendered pixels. window.__ludwigError carries the last server
// error code, and window.__ludwigMove is a test-only seam to drive a move through
// the real client socket. All of this is diagnostic; app logic never reads it.

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

declare global {
  interface Window {
    __ludwig?: LudwigDebug | null;
    __ludwigError?: string | null;
    __ludwigMove?: (from: Square, to: Square, promotion?: PromotionPiece) => void;
    // Populated in slice 1c (engine eval). Declared now so both slices share one
    // global shape without re-declaring it.
    __ludwigEval?: unknown;
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

export function publishError(code: string | null): void {
  if (typeof window === "undefined") return;
  window.__ludwigError = code;
}
