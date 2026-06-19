// Rules copy for Ludwig chess: standard online chess with a live engine eval bar.

const RULES = [
  "Standard chess.",
  "The side bar is a live Stockfish evaluation: a blunder makes it swing, but it never tells you why.",
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
      <p className="mt-4 text-xs text-muted-foreground">
        Evaluation by{" "}
        <a
          href="https://github.com/nmrugg/stockfish.js"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          Stockfish.js
        </a>{" "}
        (GPLv3), running in your browser. See{" "}
        <a
          href="/engine/stockfish-LICENSE.txt"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          license
        </a>
        .
      </p>
    </div>
  );
}
