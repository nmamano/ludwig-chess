// Authoritative match state machine backed by a SINGLE chess.js instance that
// stays alive for the whole game. chess.js owns all rules (legal moves, check,
// checkmate, stalemate, every draw). Match enforces TURN OWNERSHIP (which player
// holds which color this game), maps errors to protocol codes, and projects a
// client-facing snapshot.
//
// The live Chess instance (not just its FEN) is the authority, because FEN alone
// does not carry threefold-repetition history. Reconnects reuse the same Match,
// so position and history survive a refresh.
//
// Socket-free and timer-free: the Room owns sockets, presence, and the single
// reconnect-grace timer.

import { Chess } from "chess.js";
import { toColor } from "../shared/chess";
import type { Color, GameResult, LastMove, MoveInput } from "../shared/chess";
import type { PlayerId, PlayerView, RoomSnapshot, ErrorCode } from "../shared/protocol";

export interface MatchPlayer {
  id: PlayerId;
  name: string;
  connected: boolean;
}

// First-game color mapping: the creator (p1) is White and moves first. Colors
// alternate every New Game (see Match.newGame), so the live mapping comes from
// Match.colorOf / Room.colorOf. This default only seeds game 1 and the pre-match
// waiting snapshot.
export function colorOf(pid: PlayerId): Color {
  return pid === "p1" ? "white" : "black";
}

export interface ActionError {
  code: ErrorCode;
  message: string;
}
export type ActionResult = { ok: true } | { ok: false; error: ActionError };

const OK: ActionResult = { ok: true };
function fail(code: ErrorCode, message: string): ActionResult {
  return { ok: false, error: { code, message } };
}

export class Match {
  // The authoritative position. Kept alive for the whole game so repetition
  // history survives reconnects (FEN alone would lose it).
  private chess: Chess;
  // Which player holds White THIS game. Starts as p1 (the creator) and flips on
  // every New Game. Player identities (p1/p2) and reconnect tokens never change.
  private whitePid: PlayerId = "p1";
  private lastMove: LastMove | null = null;

  // `fen` is a test/seed seam (drive checkmate/draw positions directly). Server
  // authority is unaffected: chess.js validates every subsequent move.
  constructor(
    readonly players: { p1: MatchPlayer; p2: MatchPlayer },
    fen?: string,
  ) {
    this.chess = new Chess(fen);
  }

  colorOf(pid: PlayerId): Color {
    return pid === this.whitePid ? "white" : "black";
  }

  private turn(): Color {
    return toColor(this.chess.turn());
  }

  isOver(): boolean {
    return this.chess.isGameOver();
  }

  /** Apply a move for `pid`. Turn ownership is checked before chess.js runs. */
  move(pid: PlayerId, move: MoveInput): ActionResult {
    if (this.chess.isGameOver()) {
      return fail("bad_phase", "The game is over.");
    }
    if (this.colorOf(pid) !== this.turn()) {
      return fail("not_your_turn", "It is not your turn.");
    }
    try {
      const made = this.chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      this.lastMove = { from: made.from, to: made.to };
      return OK;
    } catch {
      // chess.js throws on an illegal move. Never let that escape the server path.
      return fail("illegal_move", "Illegal move.");
    }
  }

  /**
   * Start a fresh game. Allowed only once the current game is over (MVP: no
   * mid-game abort). Returns false (a no-op) otherwise.
   */
  newGame(): boolean {
    if (!this.chess.isGameOver()) return false;
    // Alternate colors each game: whoever was Black now plays White (and moves
    // first). Player identities (p1/p2) and tokens are unchanged.
    this.whitePid = this.whitePid === "p1" ? "p2" : "p1";
    this.chess = new Chess();
    this.lastMove = null;
    return true;
  }

  // Outcome precedence after game over: checkmate, then stalemate, threefold,
  // fifty-move, insufficient material. The winner of a checkmate is the side
  // opposite chess.turn() (the side to move is the one checkmated).
  private result(): GameResult | null {
    const c = this.chess;
    if (!c.isGameOver()) return null;
    if (c.isCheckmate()) {
      const winner: Color = this.turn() === "white" ? "black" : "white";
      return { kind: "win", winner, reason: "checkmate" };
    }
    if (c.isStalemate()) return { kind: "draw", reason: "stalemate" };
    if (c.isThreefoldRepetition()) return { kind: "draw", reason: "threefold" };
    if (c.isDrawByFiftyMoves()) return { kind: "draw", reason: "fifty-move" };
    if (c.isInsufficientMaterial()) return { kind: "draw", reason: "insufficient-material" };
    // Unreachable for standard chess, but never crash: report a generic draw.
    return { kind: "draw", reason: "fifty-move" };
  }

  /** Player-agnostic snapshot. turn/check/result are derived from the live Chess. */
  snapshot(code: string): RoomSnapshot {
    return {
      code,
      lobby: "active",
      players: this.playerViews(),
      fen: this.chess.fen(),
      turn: this.turn(),
      lastMove: this.lastMove,
      check: this.chess.inCheck(),
      result: this.result(),
    };
  }

  private playerViews(): PlayerView[] {
    return (["p1", "p2"] as const).map((id) => ({
      id,
      color: this.colorOf(id),
      name: this.players[id].name,
      connected: this.players[id].connected,
    }));
  }
}

/**
 * The snapshot shown in the waiting room, before a second player joins and the
 * Match is created. Renders the standard opening (initial FEN) so the board is not
 * blank while the creator waits. Only ever sent to the creator.
 */
export function waitingSnapshot(code: string, creator: MatchPlayer): RoomSnapshot {
  const fen = new Chess().fen();
  return {
    code,
    lobby: "waiting",
    players: [
      {
        id: creator.id,
        color: colorOf(creator.id),
        name: creator.name,
        connected: creator.connected,
      },
    ],
    fen,
    turn: "white",
    lastMove: null,
    check: false,
    result: null,
  };
}
