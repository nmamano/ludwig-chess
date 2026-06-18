// Pure eval-to-bar mapping. No imports, no DOM: trivially unit-testable and shared
// by the renderer (EvalBar) and the evidence-surface publisher. The bar shows
// White's share of a 0..100 fill plus a numeric label. The eval SOURCE (material
// in slice 1b, Stockfish in 1c) is decided elsewhere; this module only maps a
// white-relative score to a bar.

// Discriminated input so cp vs mate is never ambiguous.
export type EvalInput = { kind: "cp"; whiteCp: number } | { kind: "mate"; mate: number };

export interface EvalBarValue {
  fillPct: number; // White's share, clamped to [CLAMP_LO, CLAMP_HI]
  label: string; // e.g. "+1.3", "0.0", "-0.5", "M3"
}

const CLAMP_LO = 2;
const CLAMP_HI = 98;
// Mate pins slightly outside the cp clamp so a forced mate is visually distinct
// from a merely huge cp advantage.
const MATE_HI = 99;
const MATE_LO = 1;

// White win probability from white-relative centipawns (logistic, cp/400). This is
// the pre-clamp curve; it is symmetric: cpToFillPct(cp) + cpToFillPct(-cp) === 100.
export function cpToFillPct(cp: number): number {
  if (!Number.isFinite(cp)) return 50;
  const winProb = 1 / (1 + Math.pow(10, -cp / 400));
  return winProb * 100;
}

function clampPct(p: number): number {
  if (!Number.isFinite(p)) return 50;
  return Math.min(CLAMP_HI, Math.max(CLAMP_LO, p));
}

// Format a white-relative cp as a signed pawn value: "+1.3", "0.0", "-0.5".
export function formatCp(cp: number): string {
  if (!Number.isFinite(cp)) return "0.0";
  const rounded = Math.round((cp / 100) * 10) / 10;
  if (rounded === 0) return "0.0"; // also collapses -0 and tiny values
  return (rounded > 0 ? "+" : "") + rounded.toFixed(1);
}

export function evalToBar(input: EvalInput): EvalBarValue {
  if (input.kind === "mate") {
    const m = input.mate;
    if (!Number.isFinite(m) || m === 0) {
      return { fillPct: 50, label: "0.0" };
    }
    const white = m > 0;
    return { fillPct: white ? MATE_HI : MATE_LO, label: "M" + Math.abs(Math.trunc(m)) };
  }
  const cp = input.whiteCp;
  if (!Number.isFinite(cp)) {
    return { fillPct: 50, label: "0.0" };
  }
  return { fillPct: clampPct(cpToFillPct(cp)), label: formatCp(cp) };
}
