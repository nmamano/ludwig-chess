// A DUMB board renderer: a pure function of its props with NO chess rules. It
// receives a square list (display order), a square->piece map, and decoration sets,
// and reports raw square clicks; the caller (Game) owns all intent. This keeps the
// renderer trivially swappable (e.g. chessground later).

import type { Square, UiPiece } from "@/lib/chess";
import { isDarkSquare, fileIndex, rankIndex } from "@/lib/chess";
import { PieceGlyph } from "@/components/PieceGlyph";
import { cn } from "@/lib/cn";

interface Props {
  squares: Square[]; // 64 squares in display order
  pieces: Map<Square, UiPiece>;
  selected: Square | null;
  legalTargets: Square[];
  lastMoveSquares: Square[];
  checkSquare: Square | null;
  interactive: boolean;
  onSquareClick: (square: Square) => void;
}

export function Board({
  squares,
  pieces,
  selected,
  legalTargets,
  lastMoveSquares,
  checkSquare,
  interactive,
  onSquareClick,
}: Props) {
  const legal = new Set(legalTargets);
  const lastMove = new Set(lastMoveSquares);

  return (
    <div
      className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-xl border-2 border-border shadow-[0_4px_0_0_var(--border)]"
      role="grid"
      aria-label="Chess board"
    >
      {squares.map((sq, i) => {
        const piece = pieces.get(sq);
        const dark = isDarkSquare(sq);
        const isSelected = selected === sq;
        const isLegal = legal.has(sq);
        const isLast = lastMove.has(sq);
        const isCheck = checkSquare === sq;
        const showRank = i % 8 === 0; // leftmost display column
        const showFile = i >= 56; // bottom display row
        return (
          <button
            key={sq}
            type="button"
            disabled={!interactive}
            onClick={() => onSquareClick(sq)}
            className={cn(
              // container-type lets the glyph scale with the cell (cqi) so pieces
              // fill the square at any board width.
              "relative flex aspect-square items-center justify-center select-none [container-type:inline-size]",
              dark ? "bg-[var(--sq-dark)]" : "bg-[var(--sq-light)]",
              interactive ? "cursor-pointer" : "cursor-default",
              isSelected && "outline outline-2 -outline-offset-2 outline-[var(--sq-sel)]",
            )}
            aria-label={sq + (piece ? ` ${piece.color} ${piece.type}` : " empty")}
          >
            {isLast && <span className="pointer-events-none absolute inset-0 bg-amber-300/35" />}
            {isCheck && <span className="pointer-events-none absolute inset-0 bg-red-500/35" />}
            {showRank && (
              <span className="absolute top-0.5 left-0.5 text-[9px] font-bold text-foreground/40">
                {rankIndex(sq) + 1}
              </span>
            )}
            {showFile && (
              <span className="absolute right-0.5 bottom-0.5 text-[9px] font-bold text-foreground/40">
                {"abcdefgh"[fileIndex(sq)]}
              </span>
            )}
            {piece && (
              <PieceGlyph
                type={piece.type}
                color={piece.color}
                className="text-[100cqi] leading-none"
              />
            )}
            {isLegal &&
              (piece ? (
                <span className="pointer-events-none absolute inset-1 rounded-full border-[3px] border-[var(--sq-move)]" />
              ) : (
                <span className="pointer-events-none absolute h-1/4 w-1/4 rounded-full bg-[var(--sq-move)]" />
              ))}
          </button>
        );
      })}
    </div>
  );
}
