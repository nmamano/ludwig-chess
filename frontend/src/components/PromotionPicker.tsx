import type { Color, PromotionPiece } from "@shared/chess";
import { PieceGlyph } from "@/components/PieceGlyph";

// Queen-first, the conventional default ordering.
const ORDER: PromotionPiece[] = ["q", "r", "b", "n"];
const NAME: Record<PromotionPiece, string> = {
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
};

interface Props {
  color: Color;
  onChoose: (p: PromotionPiece) => void;
  onCancel: () => void;
}

export function PromotionPicker({ color, onChoose, onCancel }: Props) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-foreground/40 p-6 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-3xl border-2 border-border bg-card p-6 text-center shadow-[0_8px_0_0_var(--border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-heading text-lg font-extrabold">Promote to...</div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChoose(p)}
              className="flex aspect-square items-center justify-center rounded-2xl border-2 border-border bg-background text-3xl transition-colors hover:border-primary hover:bg-muted"
              aria-label={`Promote to ${NAME[p]}`}
            >
              <PieceGlyph type={p} color={color} />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
