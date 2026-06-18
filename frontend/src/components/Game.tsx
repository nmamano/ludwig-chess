import { useEffect, useMemo, useState } from "react";
import { Board } from "@/components/Board";
import { PromotionPicker } from "@/components/PromotionPicker";
import { RulesPanel } from "@/components/RulesPanel";
import { Button } from "@/components/Button";
import {
  piecesFromFen,
  squaresInDisplayOrder,
  legalTargets as legalTargetsFor,
  needsPromotion,
  checkedKingSquare,
  type Square,
} from "@/lib/chess";
import { cn } from "@/lib/cn";
import type { Color, DrawReason, PromotionPiece } from "@shared/chess";
import type { PlayerId, RoomSnapshot } from "@shared/protocol";

interface Props {
  snapshot: RoomSnapshot;
  you: PlayerId;
  error: string | null;
  actionNonce: number; // bumps when the server rejects an action -> clear local UI
  opponentLeft: boolean;
  onMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  onNewGame: () => void;
  onExit: () => void;
}

const DRAW_TEXT: Record<DrawReason, string> = {
  stalemate: "stalemate",
  threefold: "threefold repetition",
  "fifty-move": "the fifty-move rule",
  "insufficient-material": "insufficient material",
};

export function Game({
  snapshot,
  you,
  error,
  actionNonce,
  opponentLeft,
  onMove,
  onNewGame,
  onExit,
}: Props) {
  const { fen, turn, lastMove, check, result, players, code } = snapshot;
  const me = players.find((p) => p.id === you);
  // Read my color from the server-authoritative snapshot rather than assuming
  // p1 = White, so the frontend stays correct as colors alternate each New Game.
  const myColor: Color = me?.color ?? (you === "p1" ? "white" : "black");
  const opp = players.find((p) => p.id !== you);
  const myName = me?.name ?? "You";
  const oppName = opp?.name ?? "Opponent";
  const oppConnected = opp?.connected ?? false;

  const over = result;
  const isMyTurn = !over && turn === myColor;

  const [selected, setSelected] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);

  // Clear ephemeral UI whenever the authoritative position changes or the server
  // rejects an action. The board always renders snapshot.fen (no optimism).
  useEffect(() => {
    setSelected(null);
    setPromo(null);
  }, [fen, snapshot.lobby, actionNonce]);

  // Transient error toast.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!error) {
      setToast(null);
      return;
    }
    setToast(error);
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [error, actionNonce]);

  const pieces = useMemo(() => piecesFromFen(fen), [fen]);
  const squares = useMemo(() => squaresInDisplayOrder(myColor), [myColor]);
  const legalTargets = useMemo(
    () => (isMyTurn && selected ? legalTargetsFor(fen, selected) : []),
    [isMyTurn, selected, fen],
  );
  const checkSquare = useMemo(() => (check ? checkedKingSquare(fen) : null), [check, fen]);
  const lastMoveSquares = lastMove ? [lastMove.from, lastMove.to] : [];

  function handleSquareClick(square: Square) {
    if (!isMyTurn) return;
    const piece = pieces.get(square);

    if (selected) {
      if (square === selected) {
        setSelected(null); // click the same square to deselect
        return;
      }
      if (legalTargets.includes(square)) {
        if (needsPromotion(fen, selected, square)) setPromo({ from: selected, to: square });
        else {
          onMove(selected, square);
          setSelected(null);
        }
        return;
      }
    }

    // Otherwise (re)select one of your own pieces, or clear.
    if (piece && piece.color === myColor) setSelected(square);
    else setSelected(null);
  }

  function choosePromotion(piece: PromotionPiece) {
    if (!promo) return;
    onMove(promo.from, promo.to, piece);
    setPromo(null);
    setSelected(null);
  }

  // Status / prompt line.
  let status: string;
  if (over) {
    status =
      over.kind === "win"
        ? `${over.winner === myColor ? "You win" : `${oppName} wins`} by checkmate.`
        : `Draw by ${DRAW_TEXT[over.reason]}.`;
  } else if (isMyTurn) {
    status = check
      ? "You are in check. Your move."
      : selected
        ? "Pick a highlighted square to move."
        : "Your move. Pick a piece.";
  } else if (!oppConnected) {
    status = `${oppName} disconnected. Waiting for them to return...`;
  } else {
    status = check ? `${oppName} is in check...` : `${oppName}'s turn...`;
  }

  const banner = over
    ? over.kind === "win"
      ? `🎉 ${over.winner.toUpperCase()} WINS 🎉`
      : "🤝 DRAW"
    : null;
  const iWon = over?.kind === "win" && over.winner === myColor;
  const iLost = over?.kind === "win" && over.winner !== myColor;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
      {/* Top bar */}
      <header className="flex items-center justify-between">
        <button
          onClick={onExit}
          className="font-heading text-lg font-extrabold tracking-tight text-muted-foreground transition-colors hover:text-foreground"
        >
          Ludwig<span className="text-primary">Chess</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="rounded-full border-2 border-border bg-card px-3 py-1 font-heading text-xs font-bold text-muted-foreground">
            Room {code}
          </span>
          <span className="rounded-full border-2 border-primary/30 bg-card px-3 py-1 font-heading text-xs font-bold text-primary">
            You: {myColor.toUpperCase()}
          </span>
        </div>
      </header>

      {/* Turn indicator */}
      <div className="flex items-center gap-3 rounded-3xl border-2 border-border bg-card p-4 shadow-[0_6px_0_0_var(--border)]">
        <span className="font-heading text-xs font-bold tracking-widest text-muted-foreground uppercase">
          Current Turn
        </span>
        <span
          className={cn(
            "rounded-full px-3 py-1 font-heading text-sm font-extrabold",
            over ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {turn.toUpperCase()}
        </span>
        {isMyTurn && <span className="font-heading text-xs font-bold text-primary">(you)</span>}
        {check && !over && <span className="font-heading text-xs font-bold text-lose">CHECK</span>}
      </div>

      {/* Players */}
      <div className="flex items-center justify-between px-1 text-sm">
        <span className="flex items-center gap-2 font-bold">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          {myName} <span className="font-normal text-muted-foreground">(you)</span>
        </span>
        <span className="flex items-center gap-2 font-bold">
          {oppName}
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              oppConnected ? "bg-win" : "bg-muted-foreground/40",
            )}
            title={oppConnected ? "Connected" : "Reconnecting..."}
          />
        </span>
      </div>

      {/* Board */}
      <div className="flex justify-center">
        <div className="w-full max-w-[520px]">
          <Board
            squares={squares}
            pieces={pieces}
            selected={selected}
            legalTargets={legalTargets}
            lastMoveSquares={lastMoveSquares}
            checkSquare={checkSquare}
            interactive={isMyTurn}
            onSquareClick={handleSquareClick}
          />
        </div>
      </div>

      {/* Status / banner */}
      <div
        className={cn(
          "rounded-3xl border-2 p-4 text-center transition-colors",
          iWon && "border-win/60 bg-win/10",
          iLost && "border-lose/60 bg-lose/10",
          over?.kind === "draw" && "border-border bg-muted",
          !over && isMyTurn && "border-primary bg-primary/10",
          !over && !isMyTurn && "border-border bg-card",
        )}
      >
        {banner ? (
          <div className="flex flex-col items-center gap-4">
            <div
              className={cn(
                "font-heading text-2xl font-extrabold sm:text-3xl",
                iWon && "text-win",
                iLost && "text-lose",
                over?.kind === "draw" && "text-foreground",
              )}
            >
              {banner}
            </div>
            <p className="text-sm font-semibold text-muted-foreground">{status}</p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button className="flex-1 rounded-2xl sm:flex-none sm:px-8" onClick={onNewGame}>
                New Game
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-2xl sm:flex-none sm:px-8"
                onClick={onExit}
              >
                Back to lobby
              </Button>
            </div>
          </div>
        ) : (
          <p className="font-heading text-base font-bold sm:text-lg">{status}</p>
        )}
      </div>

      <RulesPanel />

      {/* Promotion picker */}
      {promo && (
        <PromotionPicker
          color={myColor}
          onChoose={choosePromotion}
          onCancel={() => {
            setPromo(null);
            setSelected(null);
          }}
        />
      )}

      {/* Error toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <button
            onClick={() => setToast(null)}
            className="rounded-2xl border-2 border-lose/40 bg-card px-4 py-2 text-sm font-semibold text-lose shadow-[0_4px_0_0_var(--border)]"
          >
            {toast}
          </button>
        </div>
      )}

      {/* Opponent-left overlay */}
      {opponentLeft && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-foreground/30 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border-2 border-border bg-card p-6 text-center shadow-[0_8px_0_0_var(--border)]">
            <div className="font-heading text-2xl font-extrabold">Opponent left</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Your opponent disconnected and didn&apos;t return.
            </p>
            <Button className="mt-5 w-full rounded-2xl" onClick={onExit}>
              Back to lobby
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
