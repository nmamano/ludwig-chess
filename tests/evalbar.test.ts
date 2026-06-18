import { test, expect, describe } from "bun:test";
import { Chess } from "chess.js";
import { evalToBar, cpToFillPct, formatCp } from "../frontend/src/lib/evalbar";
import { materialEvalCp } from "../frontend/src/lib/material";

const START_FEN = new Chess().fen();

describe("evalToBar - cp", () => {
  test("zero is dead even: 50% and 0.0", () => {
    const b = evalToBar({ kind: "cp", whiteCp: 0 });
    expect(b.fillPct).toBe(50);
    expect(b.label).toBe("0.0");
  });

  test("labels are signed pawn values, tiny values collapse to 0.0", () => {
    expect(evalToBar({ kind: "cp", whiteCp: 130 }).label).toBe("+1.3");
    expect(evalToBar({ kind: "cp", whiteCp: -50 }).label).toBe("-0.5");
    expect(evalToBar({ kind: "cp", whiteCp: 900 }).label).toBe("+9.0");
    expect(evalToBar({ kind: "cp", whiteCp: 4 }).label).toBe("0.0");
    expect(evalToBar({ kind: "cp", whiteCp: -4 }).label).toBe("0.0");
  });

  test("logistic fill is correct within tolerance and monotonic", () => {
    expect(evalToBar({ kind: "cp", whiteCp: 400 }).fillPct).toBeCloseTo(90.909, 1);
    expect(evalToBar({ kind: "cp", whiteCp: -400 }).fillPct).toBeCloseTo(9.091, 1);
    const lo = evalToBar({ kind: "cp", whiteCp: -100 }).fillPct;
    const mid = evalToBar({ kind: "cp", whiteCp: 0 }).fillPct;
    const hi = evalToBar({ kind: "cp", whiteCp: 100 }).fillPct;
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
  });

  test("huge cp clamps to [2, 98] (never fully erases a side)", () => {
    expect(evalToBar({ kind: "cp", whiteCp: 50000 }).fillPct).toBe(98);
    expect(evalToBar({ kind: "cp", whiteCp: -50000 }).fillPct).toBe(2);
  });

  test("non-finite cp fails closed to even", () => {
    expect(evalToBar({ kind: "cp", whiteCp: NaN }).fillPct).toBe(50);
    expect(evalToBar({ kind: "cp", whiteCp: NaN }).label).toBe("0.0");
    expect(evalToBar({ kind: "cp", whiteCp: Infinity }).fillPct).toBe(50);
    expect(evalToBar({ kind: "cp", whiteCp: -Infinity }).fillPct).toBe(50);
  });
});

describe("evalToBar - mate", () => {
  test("mate pins near [1, 99] and labels M<n>", () => {
    expect(evalToBar({ kind: "mate", mate: 3 })).toEqual({ fillPct: 99, label: "M3" });
    expect(evalToBar({ kind: "mate", mate: -2 })).toEqual({ fillPct: 1, label: "M2" });
  });

  test("degenerate mate (0 / non-finite) falls back to even", () => {
    expect(evalToBar({ kind: "mate", mate: 0 }).fillPct).toBe(50);
    expect(evalToBar({ kind: "mate", mate: NaN }).fillPct).toBe(50);
    expect(evalToBar({ kind: "mate", mate: 0 }).label).toBe("0.0");
  });
});

describe("cpToFillPct - symmetry (pre-clamp)", () => {
  test("fill(cp) + fill(-cp) === 100", () => {
    for (const cp of [0, 50, 130, 300, 777, 2500]) {
      expect(cpToFillPct(cp) + cpToFillPct(-cp)).toBeCloseTo(100, 9);
    }
  });
  test("zero maps to exactly 50", () => {
    expect(cpToFillPct(0)).toBe(50);
  });
});

describe("formatCp", () => {
  test("non-finite is 0.0", () => {
    expect(formatCp(NaN)).toBe("0.0");
    expect(formatCp(Infinity)).toBe("0.0");
  });
});

describe("materialEvalCp", () => {
  test("the start position is balanced (0)", () => {
    expect(materialEvalCp(START_FEN)).toBe(0);
  });

  test("White up a queen is +900; Black up a rook is -500", () => {
    expect(materialEvalCp("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(900);
    expect(materialEvalCp("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 1")).toBe(-500);
  });

  test("kings are excluded (K vs K is 0)", () => {
    expect(materialEvalCp("8/8/8/4k3/8/8/4K3/8 w - - 0 1")).toBe(0);
  });

  test("an invalid FEN fails closed to 0 (no throw)", () => {
    expect(materialEvalCp("not a fen")).toBe(0);
    expect(materialEvalCp("")).toBe(0);
  });
});
