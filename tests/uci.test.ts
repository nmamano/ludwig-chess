import { test, expect, describe } from "bun:test";
import { parseInfoLine, sideToMoveFromFen, toWhiteRelative } from "../frontend/src/lib/uci";

describe("parseInfoLine", () => {
  test("parses depth + score cp", () => {
    expect(parseInfoLine("info depth 20 seldepth 28 score cp 34 nodes 100 pv e2e4")).toEqual({
      depth: 20,
      cp: 34,
      mate: null,
    });
  });

  test("parses score mate (both signs)", () => {
    expect(parseInfoLine("info depth 12 score mate 3 pv h5f7")).toEqual({
      depth: 12,
      cp: null,
      mate: 3,
    });
    expect(parseInfoLine("info depth 9 score mate -2")).toEqual({ depth: 9, cp: null, mate: -2 });
  });

  test("tolerates lowerbound / upperbound tokens", () => {
    expect(parseInfoLine("info depth 5 score cp 20 lowerbound nodes 10")).toEqual({
      depth: 5,
      cp: 20,
      mate: null,
    });
    expect(parseInfoLine("info depth 5 score cp -8 upperbound")).toEqual({
      depth: 5,
      cp: -8,
      mate: null,
    });
  });

  test("returns null for non-info / no-score / malformed lines", () => {
    expect(parseInfoLine("bestmove e2e4 ponder e7e5")).toBeNull();
    expect(parseInfoLine("readyok")).toBeNull();
    expect(parseInfoLine("info depth 7 nodes 100")).toBeNull(); // no score
    expect(parseInfoLine("info string hello world")).toBeNull();
    expect(parseInfoLine("info score cp 5")).toBeNull(); // no depth
    expect(parseInfoLine("info depth nan score cp 5")).toBeNull(); // non-finite depth
    expect(parseInfoLine("")).toBeNull();
  });
});

describe("sideToMoveFromFen", () => {
  test("reads the side-to-move token", () => {
    expect(sideToMoveFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe("w");
    expect(sideToMoveFromFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1")).toBe(
      "b",
    );
  });

  test("malformed FEN / bad side token returns null", () => {
    expect(sideToMoveFromFen("only-one-field")).toBeNull();
    expect(sideToMoveFromFen("board x KQkq - 0 1")).toBeNull();
    expect(sideToMoveFromFen("")).toBeNull();
  });
});

describe("toWhiteRelative", () => {
  test("white to move keeps sign; black to move negates (cp)", () => {
    expect(toWhiteRelative({ cp: 30, mate: null }, "w")).toEqual({ whiteCp: 30, mate: null });
    expect(toWhiteRelative({ cp: 30, mate: null }, "b")).toEqual({ whiteCp: -30, mate: null });
    expect(toWhiteRelative({ cp: -120, mate: null }, "b")).toEqual({ whiteCp: 120, mate: null });
  });

  test("mate sign converts for both side-to-move colors", () => {
    expect(toWhiteRelative({ cp: null, mate: 3 }, "w")).toEqual({ whiteCp: null, mate: 3 });
    expect(toWhiteRelative({ cp: null, mate: 3 }, "b")).toEqual({ whiteCp: null, mate: -3 });
    expect(toWhiteRelative({ cp: null, mate: -1 }, "b")).toEqual({ whiteCp: null, mate: 1 });
  });

  test("null scores pass through as null", () => {
    expect(toWhiteRelative({ cp: null, mate: null }, "w")).toEqual({ whiteCp: null, mate: null });
  });
});
