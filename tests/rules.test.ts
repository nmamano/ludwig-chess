import { test, expect, describe } from "bun:test";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { Match } from "../server/match";
import { players } from "./helpers";

function fromFen(fen: string): Match {
  return new Match(players(), fen);
}

interface PlayMove {
  p: "p1" | "p2";
  from: Square;
  to: Square;
}

// Drive an alternating sequence of moves through the Match, asserting each applies.
function play(m: Match, moves: PlayMove[]): void {
  for (const mv of moves) {
    expect(m.move(mv.p, { from: mv.from, to: mv.to }).ok).toBe(true);
  }
}

describe("outcome mapping (each exact reason)", () => {
  test("checkmate -> win with the correct winner (Scholar's mate)", () => {
    const m = new Match(players());
    play(m, [
      { p: "p1", from: "e2", to: "e4" },
      { p: "p2", from: "e7", to: "e5" },
      { p: "p1", from: "f1", to: "c4" },
      { p: "p2", from: "b8", to: "c6" },
      { p: "p1", from: "d1", to: "h5" },
      { p: "p2", from: "g8", to: "f6" },
      { p: "p1", from: "h5", to: "f7" },
    ]);
    expect(m.snapshot("X").result).toEqual({ kind: "win", winner: "white", reason: "checkmate" });
  });

  test("stalemate -> draw (played into stalemate)", () => {
    // Black king a8, White king c6, White queen b1. Qb1-b6 stalemates Black.
    const m = fromFen("k7/8/2K5/8/8/8/8/1Q6 w - - 0 1");
    expect(m.move("p1", { from: "b1", to: "b6" }).ok).toBe(true);
    expect(m.snapshot("X").result).toEqual({ kind: "draw", reason: "stalemate" });
  });

  test("threefold repetition -> draw", () => {
    const m = new Match(players());
    const cycle: PlayMove[] = [
      { p: "p1", from: "g1", to: "f3" },
      { p: "p2", from: "g8", to: "f6" },
      { p: "p1", from: "f3", to: "g1" },
      { p: "p2", from: "f6", to: "g8" },
    ];
    // Two full cycles return the start position for the third time.
    play(m, [...cycle, ...cycle]);
    expect(m.snapshot("X").result).toEqual({ kind: "draw", reason: "threefold" });
  });

  test("fifty-move rule -> draw", () => {
    // Halfmove clock at 99; a quiet move reaches 100.
    const m = fromFen("k7/8/8/8/8/8/8/KQ6 w - - 99 60");
    expect(m.move("p1", { from: "b1", to: "b2" }).ok).toBe(true);
    expect(m.snapshot("X").result).toEqual({ kind: "draw", reason: "fifty-move" });
  });

  test("insufficient material -> draw (king captures the last piece)", () => {
    // White king e1 captures the lone black rook on d1, leaving K vs K.
    const m = fromFen("4k3/8/8/8/8/8/8/3rK3 w - - 0 1");
    expect(m.move("p1", { from: "e1", to: "d1" }).ok).toBe(true);
    expect(m.snapshot("X").result).toEqual({ kind: "draw", reason: "insufficient-material" });
  });
});

describe("special moves", () => {
  test("kingside castling", () => {
    const m = fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(m.move("p1", { from: "e1", to: "g1" }).ok).toBe(true);
    const c = new Chess(m.snapshot("X").fen);
    expect(c.get("g1")).toMatchObject({ type: "k", color: "w" });
    expect(c.get("f1")).toMatchObject({ type: "r", color: "w" });
  });

  test("en passant capture", () => {
    const m = new Match(players());
    play(m, [
      { p: "p1", from: "e2", to: "e4" },
      { p: "p2", from: "a7", to: "a6" },
      { p: "p1", from: "e4", to: "e5" },
      { p: "p2", from: "d7", to: "d5" },
    ]);
    expect(m.move("p1", { from: "e5", to: "d6" }).ok).toBe(true); // en passant
    const c = new Chess(m.snapshot("X").fen);
    expect(c.get("d6")).toMatchObject({ type: "p", color: "w" });
    expect(c.get("d5")).toBeFalsy();
  });

  test("promotion to queen", () => {
    const m = fromFen("8/P6k/8/8/8/8/8/7K w - - 0 1");
    expect(m.move("p1", { from: "a7", to: "a8", promotion: "q" }).ok).toBe(true);
    expect(new Chess(m.snapshot("X").fen).get("a8")).toMatchObject({ type: "q", color: "w" });
  });

  test("a promotion move missing the promotion piece is rejected as illegal_move", () => {
    const m = fromFen("8/P6k/8/8/8/8/8/7K w - - 0 1");
    const res = m.move("p1", { from: "a7", to: "a8" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("illegal_move");
  });
});
