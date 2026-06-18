// The Stockfish driver state machine. Pure logic (no Worker, no DOM) so it is
// unit-testable: it is constructed with a `send(cmd)` function and fed raw engine
// lines via handleLine(). The browser Worker wiring lives in engine.ts.
//
// UCI lines carry no request id, so supersession is SERIALIZED: while a search is
// running we keep attributing output to its FEN and only `stop` it; the next
// (latest pending) FEN starts after that search's `bestmove`. Every emit carries
// the FEN it was computed for, so the caller can drop stale results.

import { parseInfoLine, sideToMoveFromFen, toWhiteRelative } from "./uci";

export interface EngineEval {
  fen: string;
  whiteCp: number | null; // white-relative
  mate: number | null; // white-relative
  depth: number | null;
  updating: boolean;
}

type Phase = "starting" | "handshake" | "idle" | "preparing" | "searching" | "failed" | "disposed";

export class StockfishEngine {
  private phase: Phase = "starting";
  private activeFen: string | null = null; // FEN of the in-flight / preparing search
  private pendingFen: string | null = null; // latest requested FEN not yet started
  private stopRequested = false;
  private lastDepth = -1;
  private lastWhiteCp: number | null = null;
  private lastMate: number | null = null;

  constructor(
    private readonly send: (cmd: string) => void,
    private readonly onEval: (e: EngineEval) => void,
  ) {}

  // Begin the UCI handshake. Call once after the transport is wired.
  start(): void {
    if (this.phase !== "starting") return;
    this.send("uci");
  }

  analyze(fen: string): void {
    if (this.phase === "disposed") return;
    if (this.phase === "failed") {
      // Engine is dead: fail closed immediately so the UI never stays updating.
      this.onEval({ fen, whiteCp: null, mate: null, depth: null, updating: false });
      return;
    }
    // Idempotent: a FEN already being searched or already queued is a no-op (no
    // extra stop, no second search).
    if (fen === this.activeFen || fen === this.pendingFen) return;
    this.pendingFen = fen;
    if (this.phase === "idle") {
      this.beginPrepare();
    } else if (this.phase === "searching" && !this.stopRequested) {
      // Keep attributing output to activeFen; just ask the engine to wrap up. The
      // latest pending FEN starts after this search's bestmove.
      this.stopRequested = true;
      this.send("stop");
    }
    // 'starting' / 'handshake' / 'preparing': storing pendingFen is enough; it
    // starts on the next readyok.
  }

  handleLine(line: string): void {
    if (this.phase === "disposed" || this.phase === "failed") return;
    const t = typeof line === "string" ? line.trim() : "";
    if (!t) return;

    if (t === "uciok") {
      if (this.phase === "starting") {
        this.phase = "handshake";
        this.send("isready");
      }
      return;
    }
    if (t === "readyok") {
      this.onReadyok();
      return;
    }
    if (t.startsWith("bestmove")) {
      if (this.phase === "searching") this.onBestmove();
      return;
    }
    if (this.phase === "searching" && (t.startsWith("info ") || t === "info")) {
      this.onInfo(t);
    }
  }

  handleError(): void {
    if (this.phase === "disposed" || this.phase === "failed") return;
    this.phase = "failed";
    // Fail closed for whatever we were (about to be) working on, so the UI clears.
    const fens = new Set<string>();
    if (this.activeFen) fens.add(this.activeFen);
    if (this.pendingFen) fens.add(this.pendingFen);
    for (const fen of fens) {
      this.onEval({ fen, whiteCp: null, mate: null, depth: null, updating: false });
    }
  }

  dispose(): void {
    this.phase = "disposed";
  }

  private onReadyok(): void {
    if (this.phase === "handshake") {
      this.phase = "idle";
      if (this.pendingFen) this.beginPrepare();
      return;
    }
    if (this.phase === "preparing") {
      // No `go` has been sent for activeFen yet, so adopting the latest pending FEN
      // now cannot strand late output under the wrong FEN.
      if (this.pendingFen) {
        this.activeFen = this.pendingFen;
        this.pendingFen = null;
      }
      if (!this.activeFen) {
        this.phase = "idle";
        return;
      }
      this.lastDepth = -1;
      this.lastWhiteCp = null;
      this.lastMate = null;
      this.stopRequested = false;
      this.phase = "searching";
      this.send(`position fen ${this.activeFen}`);
      this.send("go movetime 1000");
    }
  }

  private beginPrepare(): void {
    this.activeFen = this.pendingFen;
    this.pendingFen = null;
    if (!this.activeFen) {
      this.phase = "idle";
      return;
    }
    this.phase = "preparing";
    this.send("ucinewgame");
    this.send("isready");
  }

  private onInfo(line: string): void {
    if (!this.activeFen) return;
    const info = parseInfoLine(line);
    if (!info || !Number.isFinite(info.depth)) return;
    if (info.depth <= this.lastDepth) return; // emit only when depth advances
    const side = sideToMoveFromFen(this.activeFen);
    if (!side) return;
    const ws = toWhiteRelative({ cp: info.cp, mate: info.mate }, side);
    this.lastDepth = info.depth;
    this.lastWhiteCp = ws.whiteCp;
    this.lastMate = ws.mate;
    this.onEval({
      fen: this.activeFen,
      whiteCp: ws.whiteCp,
      mate: ws.mate,
      depth: info.depth,
      updating: true,
    });
  }

  private onBestmove(): void {
    const fen = this.activeFen;
    if (fen) {
      this.onEval({
        fen,
        whiteCp: this.lastWhiteCp,
        mate: this.lastMate,
        depth: this.lastDepth >= 0 ? this.lastDepth : null,
        updating: false,
      });
    }
    this.phase = "idle";
    this.activeFen = null;
    this.stopRequested = false;
    if (this.pendingFen) this.beginPrepare();
  }
}
