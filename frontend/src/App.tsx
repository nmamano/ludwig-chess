import { useCallback, useEffect, useRef, useState } from "react";
import { Lobby } from "@/components/Lobby";
import { Waiting } from "@/components/Waiting";
import { Game } from "@/components/Game";
import { Net, type Status } from "@/net/socket";
import { publishDebug, publishError, publishEval, type LudwigEvalDebug } from "@/lib/debug";
import { evalToBar } from "@/lib/evalbar";
import { createStockfishEngine, type EngineEval, type EngineHandle } from "@/lib/engine";
import type { Square, PromotionPiece } from "@shared/chess";
import type { PlayerId, RoomSnapshot, ServerMsg } from "@shared/protocol";

const SESSION_KEY = "ludwig-chess";

interface Session {
  code: string;
  token: string;
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function roomFromUrl(): string | undefined {
  try {
    return new URLSearchParams(location.search).get("room")?.toUpperCase() ?? undefined;
  } catch {
    return undefined;
  }
}

// Strip ?room= from the URL (e.g. on Back to lobby), so the lobby doesn't keep
// prefilling a code for a room you've already left.
function clearRoomParam() {
  try {
    if (new URLSearchParams(location.search).has("room")) {
      history.replaceState(null, "", location.pathname);
    }
  } catch {
    // history may be unavailable in some embeds; ignore
  }
}

// Terminal positions have no engine search: map the game result straight to the
// bar. Draw -> even; White win -> positive mate pin; Black win -> negative pin.
function terminalEval(snapshot: RoomSnapshot): LudwigEvalDebug {
  const r = snapshot.result;
  if (!r || r.kind === "draw") {
    return {
      source: "stockfish",
      fen: snapshot.fen,
      whiteCp: 0,
      mate: null,
      depth: null,
      updating: false,
      fillPct: 50,
      label: "0.0",
    };
  }
  const white = r.winner === "white";
  return {
    source: "stockfish",
    fen: snapshot.fen,
    whiteCp: null,
    mate: white ? 1 : -1,
    depth: null,
    updating: false,
    fillPct: white ? 99 : 1,
    label: white ? "1-0" : "0-1",
  };
}

export function App() {
  const [status, setStatus] = useState<Status>("connecting");
  const [you, setYou] = useState<PlayerId | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [actionNonce, setActionNonce] = useState(0);

  const netRef = useRef<Net | null>(null);
  const urlRoom = roomFromUrl();

  // ---- The SINGLE eval producer (slice 1c: client-side Stockfish) ----
  // Only this block changed from slice 1b: the source swapped from material to a
  // real engine. Game, EvalBar, the LudwigEvalDebug contract, and the publisher are
  // untouched. The same evalState object is published to window.__ludwigEval AND
  // passed to Game, so the visible bar and the evidence surface can never diverge.
  const [evalState, setEvalState] = useState<LudwigEvalDebug | null>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const fenRef = useRef<string | null>(null); // current authoritative FEN (stale guard)
  const lastBarRef = useRef<{ fillPct: number; label: string }>({ fillPct: 50, label: "0.0" });
  const analyzedKeyRef = useRef<string | null>(null); // fen + lifecycle; ignores presence-only changes

  // Engine results: drop stale-FEN output, map score -> bar, merge into evalState.
  const onEngineEval = useCallback((e: EngineEval) => {
    if (e.fen !== fenRef.current) return; // belongs to a superseded position
    setEvalState(() => {
      let fillPct: number;
      let label: string;
      if (e.whiteCp != null) {
        ({ fillPct, label } = evalToBar({ kind: "cp", whiteCp: e.whiteCp }));
      } else if (e.mate != null) {
        ({ fillPct, label } = evalToBar({ kind: "mate", mate: e.mate }));
      } else if (e.updating) {
        // No score yet: hold the prior bar (do not snap to 50).
        ({ fillPct, label } = lastBarRef.current);
      } else {
        // Failed / no score, not updating: finite neutral bar.
        fillPct = 50;
        label = "0.0";
      }
      lastBarRef.current = { fillPct, label };
      return {
        source: "stockfish",
        fen: e.fen,
        whiteCp: e.whiteCp,
        mate: e.mate,
        depth: e.depth,
        updating: e.updating,
        fillPct,
        label,
      };
    });
  }, []);

  // React to authoritative FEN changes: terminal/waiting short-circuit; otherwise
  // hold the prior bar, mark updating, and (lazily) kick the engine.
  useEffect(() => {
    fenRef.current = snapshot ? snapshot.fen : null;

    // Presence-only broadcasts (a player connects/disconnects/joins) re-send the
    // SAME position. Key the analysis lifecycle to fen + waiting/terminal state so
    // room-metadata changes never restart the engine or reset the bar to updating.
    const key = snapshot
      ? `${snapshot.lobby}|${snapshot.result ? "over" : "live"}|${snapshot.fen}`
      : null;
    if (key === analyzedKeyRef.current) return;
    analyzedKeyRef.current = key;

    if (!snapshot || snapshot.lobby === "waiting") {
      lastBarRef.current = { fillPct: 50, label: "0.0" };
      setEvalState(null);
      return;
    }
    if (snapshot.result) {
      const term = terminalEval(snapshot);
      lastBarRef.current = { fillPct: term.fillPct, label: term.label };
      setEvalState(term);
      return; // a finished game has no search; do not call the engine
    }
    const hold = lastBarRef.current;
    setEvalState({
      source: "stockfish",
      fen: snapshot.fen,
      whiteCp: null,
      mate: null,
      depth: null,
      updating: true,
      fillPct: hold.fillPct,
      label: hold.label,
    });
    if (!engineRef.current) engineRef.current = createStockfishEngine(onEngineEval);
    engineRef.current.analyze(snapshot.fen);
  }, [snapshot, onEngineEval]);

  // Dispose the engine on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Mirror the authoritative snapshot and the single eval onto window for the
  // gate's evidence surface. Diagnostic only; never read by app logic.
  useEffect(() => {
    publishDebug(snapshot, you);
    publishEval(evalState);
  }, [snapshot, you, evalState]);

  const handleMessage = useCallback((m: ServerMsg) => {
    switch (m.t) {
      case "joined":
        setYou(m.you);
        setOpponentLeft(false);
        setError(null);
        publishError(null);
        setSnapshot(m.state);
        saveSession({ code: m.code, token: m.token });
        break;
      case "state":
        setError(null);
        publishError(null);
        setSnapshot(m.state);
        break;
      case "opponentLeft":
        setOpponentLeft(true);
        break;
      case "error":
        setError(m.message);
        publishError(m.code);
        if (m.code === "room_not_found" || m.code === "bad_token") {
          // A failed (auto-)reconnect or stale code: drop back to the lobby.
          clearSession();
          setYou(null);
          setSnapshot(null);
        } else {
          // An in-game rejection (illegal move, out of turn, ...): keep the room,
          // but tell Game to clear its optimistic selection/picker.
          setActionNonce((n) => n + 1);
        }
        break;
    }
  }, []);

  useEffect(() => {
    const net = new Net({
      onMessage: handleMessage,
      onStatus: setStatus,
      getReconnect: () => {
        const s = loadSession();
        if (!s) return null;
        // A ?room= link is the user's explicit intent: never auto-rejoin a
        // different stored room over it. Same room (or no URL room) is fine.
        const fromUrl = roomFromUrl();
        if (fromUrl && s.code !== fromUrl) return null;
        return { t: "reconnect", code: s.code, token: s.token };
      },
    });
    netRef.current = net;
    net.connect();
    return () => net.close();
  }, [handleMessage]);

  // User-initiated create/join: clear any stored session FIRST so a stale
  // reconnect isn't replayed ahead of this on (re)connect.
  const create = useCallback((name: string) => {
    clearSession();
    setError(null);
    netRef.current?.send({ t: "create", name });
  }, []);

  const join = useCallback((code: string, name: string) => {
    clearSession();
    setError(null);
    netRef.current?.send({ t: "join", code, name });
  }, []);

  const move = useCallback((from: Square, to: Square, promotion?: PromotionPiece) => {
    netRef.current?.send(promotion ? { t: "move", from, to, promotion } : { t: "move", from, to });
  }, []);

  // Test-only seam: drive a move through the real client socket (used by the
  // headless-browser gate to inject illegal moves and scripted lines). The server
  // still validates everything, so this cannot cheat.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__ludwigMove = move;
    return () => {
      delete window.__ludwigMove;
    };
  }, [move]);

  const newGame = useCallback(() => {
    setError(null);
    netRef.current?.send({ t: "newGame" });
  }, []);

  const exit = useCallback(() => {
    netRef.current?.send({ t: "leave" });
    clearSession();
    clearRoomParam(); // drop ?room= so the lobby doesn't prefill a now-stale code
    setYou(null);
    setSnapshot(null);
    setOpponentLeft(false);
    setError(null);
  }, []);

  const disconnected = status !== "open";

  let view;
  if (!you || !snapshot) {
    view = (
      <Lobby
        onCreate={create}
        onJoin={join}
        initialCode={urlRoom}
        error={error}
        busy={disconnected}
      />
    );
  } else if (snapshot.lobby === "waiting") {
    view = <Waiting code={snapshot.code} onCancel={exit} />;
  } else {
    view = (
      <Game
        snapshot={snapshot}
        you={you}
        error={error}
        actionNonce={actionNonce}
        opponentLeft={opponentLeft}
        evalState={evalState}
        onMove={move}
        onNewGame={newGame}
        onExit={exit}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {disconnected && (
        <div className="fixed inset-x-0 top-0 z-40 bg-primary py-1.5 text-center text-xs font-bold text-primary-foreground">
          {status === "connecting" ? "Connecting..." : "Connection lost. Reconnecting..."}
        </div>
      )}
      {view}
    </div>
  );
}
