// Rules copy for Ludwig chess: standard online chess.

const RULES = [
  "Standard chess. Checkmate the opponent's king to win.",
  "Castling, en passant, and pawn promotion all work as normal.",
  "Draws: stalemate, threefold repetition, the fifty-move rule, or insufficient material.",
  "The side bar shows the material balance, not a full engine evaluation.",
  "Share the 4-letter room code with a friend to play.",
];

export function RulesPanel() {
  return (
    <div className="rounded-3xl border-2 border-border bg-card p-5">
      <h2 className="font-heading text-xs font-bold tracking-widest text-muted-foreground uppercase">
        Rules
      </h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
        {RULES.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-primary">▸</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
