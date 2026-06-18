// Pure UCI parsing and score conversion. No imports, no DOM: unit-testable from
// the root test runner.

export interface ParsedInfo {
  depth: number;
  cp: number | null; // raw, side-to-move-relative
  mate: number | null; // raw, side-to-move-relative
}

// Parse an `info ... depth N ... score cp X | mate Y ...` line. Returns null for a
// non-info line, an info line without both a depth and a score, or non-finite
// values. Tolerates trailing `lowerbound` / `upperbound` tokens.
export function parseInfoLine(line: string): ParsedInfo | null {
  if (typeof line !== "string") return null;
  const t = line.trim();
  if (!t.startsWith("info ") && t !== "info") return null;
  const tok = t.split(/\s+/);
  let depth: number | null = null;
  let cp: number | null = null;
  let mate: number | null = null;
  for (let i = 0; i < tok.length; i++) {
    if (tok[i] === "depth") {
      const d = Number(tok[i + 1]);
      if (Number.isFinite(d)) depth = d;
    } else if (tok[i] === "score") {
      const kind = tok[i + 1];
      const v = Number(tok[i + 2]);
      if (kind === "cp" && Number.isFinite(v)) cp = v;
      else if (kind === "mate" && Number.isFinite(v)) mate = v;
    }
  }
  if (depth === null || (cp === null && mate === null)) return null;
  return { depth, cp, mate };
}

// "w" | "b" from a FEN's side-to-move field, or null if malformed.
export function sideToMoveFromFen(fen: string): "w" | "b" | null {
  if (typeof fen !== "string") return null;
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const s = parts[1];
  return s === "w" || s === "b" ? s : null;
}

export interface WhiteScore {
  whiteCp: number | null;
  mate: number | null;
}

// Convert a side-to-move-relative cp/mate to White's perspective (negate for Black).
export function toWhiteRelative(
  raw: { cp: number | null; mate: number | null },
  sideToMove: "w" | "b",
): WhiteScore {
  const sign = sideToMove === "w" ? 1 : -1;
  return {
    whiteCp: raw.cp === null || !Number.isFinite(raw.cp) ? null : sign * raw.cp,
    mate: raw.mate === null || !Number.isFinite(raw.mate) ? null : sign * raw.mate,
  };
}
