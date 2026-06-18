import type { PieceSymbol } from "chess.js";
import type { Color } from "@shared/chess";
import { cn } from "@/lib/cn";

// Solid Unicode glyphs for BOTH colors; the fill color + outline stroke are
// applied via CSS so white pieces stay crisp on dark squares. chess.js piece
// symbols (p/n/b/r/q/k) key the table directly.
const GLYPH: Record<PieceSymbol, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

// Text variation selector (U+FE0E). iOS Safari otherwise gives the black pawn
// (U+265F) emoji presentation. Appending this forces text presentation; it is a
// no-op on glyphs that already render as text.
const TEXT_PRESENTATION = String.fromCharCode(0xfe0e);

export function PieceGlyph({
  type,
  color,
  className,
}: {
  type: PieceSymbol;
  color: Color;
  className?: string;
}) {
  return (
    <span
      className={cn(
        color === "white" ? "text-white" : "text-neutral-900",
        // iOS/touch text-style chess glyphs sit low in the cell; nudge up on
        // coarse-pointer devices so they optically center. Desktop is untouched.
        "pointer-coarse:-translate-y-[8%]",
        className,
      )}
      style={{
        WebkitTextStroke:
          color === "white" ? "1.25px rgba(0,0,0,0.7)" : "1px rgba(255,255,255,0.35)",
      }}
    >
      {GLYPH[type] + TEXT_PRESENTATION}
    </span>
  );
}
