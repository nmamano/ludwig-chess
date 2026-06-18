// Browser Worker factory for the Stockfish engine. Wires a real Web Worker
// (loading the copied lite-single asset) to the pure StockfishEngine state
// machine. This module is browser-only (it references Worker) and is imported by
// App only, never by tests.

import { StockfishEngine, type EngineEval } from "./engine-core";

const WORKER_URL = "/engine/stockfish-18-lite-single.js";

export type { EngineEval };

export interface EngineHandle {
  analyze(fen: string): void;
  dispose(): void;
}

export function createStockfishEngine(onEval: (e: EngineEval) => void): EngineHandle {
  const worker = new Worker(WORKER_URL);
  const engine = new StockfishEngine((cmd) => worker.postMessage(cmd), onEval);

  worker.onmessage = (e: MessageEvent) => {
    const data = typeof e.data === "string" ? e.data : e.data && e.data.data;
    if (typeof data !== "string") return;
    for (const line of data.split("\n")) engine.handleLine(line);
  };
  worker.onerror = () => engine.handleError();
  worker.onmessageerror = () => engine.handleError();

  engine.start();

  return {
    analyze: (fen) => engine.analyze(fen),
    dispose: () => {
      engine.dispose();
      try {
        worker.terminate();
      } catch {
        // already gone
      }
    },
  };
}
