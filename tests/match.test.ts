import { test, expect, describe } from "bun:test";
import { Chess } from "chess.js";
import { Match, waitingSnapshot, colorOf } from "../server/match";
import { players } from "./helpers";

const START_FEN = new Chess().fen();

// 1. f3 e5 2. g4 Qh4# (Fool's Mate). Black mates; leaves the match checkmated with
// White to move.
function playFoolsMate(m: Match): void {
  expect(m.move("p1", { from: "f2", to: "f3" }).ok).toBe(true);
  expect(m.move("p2", { from: "e7", to: "e5" }).ok).toBe(true);
  expect(m.move("p1", { from: "g2", to: "g4" }).ok).toBe(true);
  expect(m.move("p2", { from: "d8", to: "h4" }).ok).toBe(true);
}

describe("colorOf", () => {
  test("p1 is White (moves first), p2 is Black", () => {
    expect(colorOf("p1")).toBe("white");
    expect(colorOf("p2")).toBe("black");
  });
});

describe("Match — fresh game", () => {
  test("starts active, White to move, standard opening, no result", () => {
    const m = new Match(players());
    const s = m.snapshot("ABCD");
    expect(s.lobby).toBe("active");
    expect(s.turn).toBe("white");
    expect(s.fen).toBe(START_FEN);
    expect(s.result).toBeNull();
    expect(s.check).toBe(false);
    expect(s.lastMove).toBeNull();
    expect(s.players.map((p) => [p.id, p.color])).toEqual([
      ["p1", "white"],
      ["p2", "black"],
    ]);
  });
});

describe("Match — turn ownership", () => {
  test("moving out of turn is rejected as not_your_turn before chess.js runs", () => {
    const m = new Match(players());
    const res = m.move("p2", { from: "d7", to: "d5" });
    expect(res).toEqual({
      ok: false,
      error: { code: "not_your_turn", message: "It is not your turn." },
    });
    expect(m.snapshot("ABCD").turn).toBe("white");
  });

  test("a legal move applies, flips the turn, and records lastMove", () => {
    const m = new Match(players());
    expect(m.move("p1", { from: "e2", to: "e4" }).ok).toBe(true);
    const s = m.snapshot("ABCD");
    expect(s.turn).toBe("black");
    expect(s.lastMove).toEqual({ from: "e2", to: "e4" });
    const c = new Chess(s.fen);
    expect(c.get("e4")).toMatchObject({ type: "p", color: "w" });
    expect(c.get("e2")).toBeFalsy();
  });

  test("an illegal move maps to illegal_move and leaves the position untouched", () => {
    const m = new Match(players());
    const before = m.snapshot("ABCD").fen;
    const res = m.move("p1", { from: "e2", to: "e5" }); // pawn cannot jump three
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("illegal_move");
    expect(m.snapshot("ABCD").fen).toBe(before);
  });
});

describe("Match — game over + new game", () => {
  test("checkmate ends the game with the right winner and result", () => {
    const m = new Match(players());
    expect(m.newGame()).toBe(false); // not over yet
    playFoolsMate(m);
    expect(m.isOver()).toBe(true);
    const s = m.snapshot("ABCD");
    expect(s.result).toEqual({ kind: "win", winner: "black", reason: "checkmate" });
    expect(s.check).toBe(true);
    expect(s.turn).toBe("white"); // the checkmated side is to move
  });

  test("moving after the game is over is rejected as bad_phase", () => {
    const m = new Match(players());
    playFoolsMate(m);
    const res = m.move("p1", { from: "e1", to: "e2" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("bad_phase");
  });

  test("New Game alternates colors and resets to a fresh White-to-move opening", () => {
    const m = new Match(players());
    expect(m.colorOf("p1")).toBe("white");
    expect(m.colorOf("p2")).toBe("black");
    playFoolsMate(m);

    expect(m.newGame()).toBe(true);
    expect(m.colorOf("p1")).toBe("black");
    expect(m.colorOf("p2")).toBe("white");

    const s = m.snapshot("ABCD");
    expect(s.turn).toBe("white"); // White still moves first...
    expect(s.fen).toBe(START_FEN);
    expect(s.players).toEqual([
      { id: "p1", color: "black", name: "Alice", connected: true },
      { id: "p2", color: "white", name: "Bob", connected: true },
    ]);

    // ...so p2 now holds White and moves first; p1 acting first is rejected.
    expect(m.move("p1", { from: "d7", to: "d5" }).ok).toBe(false);
    expect(m.move("p2", { from: "e2", to: "e4" }).ok).toBe(true);
    expect(m.newGame()).toBe(false); // no longer over
  });
});

describe("Match — fen seed seam", () => {
  test("the constructor loads a seeded FEN, reflected in the snapshot", () => {
    const fen = "4k3/8/8/8/8/8/8/4K2R w K - 0 1";
    const m = new Match(players(), fen);
    expect(m.snapshot("ABCD").fen).toBe(new Chess(fen).fen());
  });
});

describe("waitingSnapshot", () => {
  test("renders the standard opening with just the creator, lobby waiting", () => {
    const s = waitingSnapshot("ABCD", { id: "p1", name: "Alice", connected: true });
    expect(s.lobby).toBe("waiting");
    expect(s.players).toEqual([{ id: "p1", color: "white", name: "Alice", connected: true }]);
    expect(s.turn).toBe("white");
    expect(s.fen).toBe(START_FEN);
    expect(s.result).toBeNull();
  });
});
