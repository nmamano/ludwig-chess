// The client to server wire protocol. Imported by both the server and the
// frontend, so it must stay browser-safe: types only, plus the public chess types.

import type { Color, GameResult, LastMove, MoveInput } from "./chess";

export type PlayerId = "p1" | "p2";

// Room lifecycle, distinct from the chess game state. "waiting" = no opponent yet
// (the Match does not exist); "active" = a game is running. A finished game is
// still "active": the final result lives in RoomSnapshot.result so the board and
// outcome keep rendering.
export type LobbyPhase = "waiting" | "active";

export interface PlayerView {
  id: PlayerId;
  color: Color; // side this player holds THIS game; alternates each New Game (p1 is White for game 1).
  name: string;
  connected: boolean;
}

/**
 * The full, player-AGNOSTIC view of a room the server broadcasts to every client.
 *
 * Chess is perfect information, so one identical snapshot is sent to both players.
 * Per-client identity (your PlayerId/Color and your reconnect token) is delivered
 * once, in `joined`, never in a broadcast. The position is the authoritative FEN;
 * turn/check/result are derived from the server's live Chess instance.
 */
export interface RoomSnapshot {
  code: string;
  lobby: LobbyPhase;
  players: PlayerView[];
  fen: string;
  turn: Color;
  lastMove: LastMove | null; // the move that produced this position, for highlighting
  check: boolean; // side to move is in check
  result: GameResult | null; // null while the game is in progress
}

// ---- client -> server -------------------------------------------------------

export type ClientMsg =
  | { t: "create"; name: string }
  | { t: "join"; code: string; name: string }
  | { t: "reconnect"; code: string; token: string }
  | ({ t: "move" } & MoveInput) // { t:"move"; from; to; promotion? }
  | { t: "newGame" }
  | { t: "leave" };

// ---- server -> client -------------------------------------------------------

export type ErrorCode =
  | "room_not_found"
  | "room_full"
  | "bad_token"
  | "not_your_turn"
  | "illegal_move"
  | "bad_phase"
  | "bad_message";

export type ServerMsg =
  // `you`, `color`, and `token` are returned ONLY here, never in a broadcast.
  | { t: "joined"; code: string; you: PlayerId; color: Color; token: string; state: RoomSnapshot }
  | { t: "state"; state: RoomSnapshot } // pushed on every transition
  | { t: "opponentLeft" }
  | { t: "error"; code: ErrorCode; message: string };
