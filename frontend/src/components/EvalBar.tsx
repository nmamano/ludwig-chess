import type { Color } from "@shared/chess";
import { cn } from "@/lib/cn";

interface Props {
  fillPct: number; // White's share, 0..100
  label: string;
  orientation: Color; // board orientation; White's share grows from the white side
  updating: boolean;
}

// A thin vertical advantage bar beside the board. White's share fills from the
// viewer's own side: bottom for a White-oriented board, top for a Black-oriented
// board. Presentation only; the gate judges the data on window.__ludwigEval, not
// these pixels.
export function EvalBar({ fillPct, label, orientation, updating }: Props) {
  const whiteAtBottom = orientation === "white";
  const pct = Number.isFinite(fillPct) ? Math.min(100, Math.max(0, fillPct)) : 50;

  return (
    <div
      className="flex flex-col items-center gap-1"
      aria-label="Material advantage bar"
      title="Material advantage (not a full engine evaluation)"
    >
      <div className="relative w-6 flex-1 overflow-hidden rounded-md border-2 border-border bg-neutral-800 sm:w-7">
        <div
          className={cn(
            "absolute inset-x-0 bg-neutral-100 transition-[height] duration-300 ease-out",
            whiteAtBottom ? "bottom-0" : "top-0",
          )}
          style={{ height: `${pct}%` }}
        />
        {/* Even line at the midpoint. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {updating && (
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-primary/25" />
        )}
      </div>
      <span className="font-heading text-xs font-bold tabular-nums text-muted-foreground">
        {updating ? "..." : label}
      </span>
    </div>
  );
}
