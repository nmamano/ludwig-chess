import { test, expect, describe } from "bun:test";
import { StockfishEngine, type EngineEval } from "../frontend/src/lib/engine-core";

const FEN1 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"; // white to move
const FEN2 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"; // black to move
const FEN3 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"; // white to move

function harness() {
  const sent: string[] = [];
  const emits: EngineEval[] = [];
  const e = new StockfishEngine(
    (c) => sent.push(c),
    (ev) => emits.push(ev),
  );
  return { sent, emits, e };
}

function handshake(h: ReturnType<typeof harness>) {
  h.e.start(); // -> uci
  h.e.handleLine("uciok"); // -> isready
  h.e.handleLine("readyok"); // -> idle
}

describe("StockfishEngine - handshake + search", () => {
  test("analyze prepares (ucinewgame/isready) then sends position+go after readyok", () => {
    const h = harness();
    handshake(h);
    expect(h.sent).toEqual(["uci", "isready"]);
    h.e.analyze(FEN1);
    expect(h.sent.slice(-2)).toEqual(["ucinewgame", "isready"]);
    h.e.handleLine("readyok");
    expect(h.sent.slice(-2)).toEqual([`position fen ${FEN1}`, "go movetime 1000"]);
  });

  test("emits white-relative refinements on increasing depth only; bestmove finalizes", () => {
    const h = harness();
    handshake(h);
    h.e.analyze(FEN1);
    h.e.handleLine("readyok");
    h.e.handleLine("info depth 5 score cp 20 pv e2e4");
    h.e.handleLine("info depth 5 score cp 25"); // same depth -> ignored
    h.e.handleLine("info depth 8 score cp 30");
    h.e.handleLine("bestmove e2e4");

    const updates = h.emits.filter((x) => x.updating);
    expect(updates.map((x) => x.depth)).toEqual([5, 8]); // only deeper
    expect(updates.every((x) => x.fen === FEN1)).toBe(true);
    expect(updates[0].whiteCp).toBe(20);

    const final = h.emits[h.emits.length - 1];
    expect(final).toMatchObject({ fen: FEN1, whiteCp: 30, depth: 8, updating: false });
  });

  test("black-to-move scores are negated to white-relative", () => {
    const h = harness();
    handshake(h);
    h.e.analyze(FEN2);
    h.e.handleLine("readyok");
    h.e.handleLine("info depth 6 score cp 40"); // +40 for Black -> -40 for White
    expect(h.emits[h.emits.length - 1].whiteCp).toBe(-40);
  });

  test("queues only the latest FEN while still handshaking", () => {
    const h = harness();
    h.e.start();
    h.e.handleLine("uciok");
    h.e.analyze(FEN1);
    h.e.analyze(FEN2); // supersede before ready
    h.e.handleLine("readyok"); // idle -> prepare latest (FEN2)
    expect(h.sent.slice(-2)).toEqual(["ucinewgame", "isready"]);
    h.e.handleLine("readyok");
    expect(h.sent.slice(-2)).toEqual([`position fen ${FEN2}`, "go movetime 1000"]);
  });
});

describe("StockfishEngine - serialized supersession", () => {
  test("new analyze during search stops, keeps old FEN, only latest pending starts after bestmove", () => {
    const h = harness();
    handshake(h);
    h.e.analyze(FEN1);
    h.e.handleLine("readyok"); // searching FEN1
    h.e.handleLine("info depth 7 score cp 10");

    h.e.analyze(FEN2); // supersede -> stop
    h.e.analyze(FEN3); // supersede again -> FEN3 is the latest pending, no 2nd stop

    expect(h.sent.filter((c) => c === "stop").length).toBe(1);

    // Late output still belongs to the OLD active search (FEN1), not the pending.
    h.e.handleLine("info depth 9 score cp 12");
    expect(h.emits[h.emits.length - 1].fen).toBe(FEN1);

    h.e.handleLine("bestmove e2e4"); // finalize FEN1, then prepare latest pending
    expect(h.emits[h.emits.length - 1]).toMatchObject({ fen: FEN1, updating: false });
    expect(h.sent.slice(-2)).toEqual(["ucinewgame", "isready"]);

    h.e.handleLine("readyok");
    expect(h.sent.slice(-2)).toEqual([`position fen ${FEN3}`, "go movetime 1000"]); // FEN2 was skipped
  });
});

describe("StockfishEngine - idempotent analyze", () => {
  test("re-analyzing the active FEN sends neither stop nor a new search", () => {
    const h = harness();
    handshake(h);
    h.e.analyze(FEN1);
    h.e.handleLine("readyok"); // searching FEN1
    const before = h.sent.length;
    h.e.analyze(FEN1); // same FEN, already active -> no-op
    expect(h.sent.length).toBe(before);
    expect(h.sent).not.toContain("stop");
  });

  test("re-analyzing a pending FEN does not send a second stop", () => {
    const h = harness();
    handshake(h);
    h.e.analyze(FEN1);
    h.e.handleLine("readyok"); // searching FEN1
    h.e.analyze(FEN2); // pending FEN2 -> one stop
    h.e.analyze(FEN2); // same pending -> no-op
    expect(h.sent.filter((c) => c === "stop").length).toBe(1);
  });
});

describe("StockfishEngine - failure and dispose", () => {
  test("handleError fails closed for active FEN, then analyze emits a neutral non-updating eval", () => {
    const h = harness();
    handshake(h);
    h.e.analyze(FEN1);
    h.e.handleLine("readyok"); // searching FEN1
    h.e.handleError();
    expect(
      h.emits.some(
        (x) => x.fen === FEN1 && x.updating === false && x.whiteCp === null && x.depth === null,
      ),
    ).toBe(true);

    h.emits.length = 0;
    h.e.analyze(FEN2);
    expect(h.emits).toEqual([
      { fen: FEN2, whiteCp: null, mate: null, depth: null, updating: false },
    ]);
  });

  test("dispose silences all further callbacks and commands", () => {
    const h = harness();
    handshake(h);
    h.e.dispose();
    h.emits.length = 0;
    h.sent.length = 0;
    h.e.analyze(FEN1);
    h.e.handleLine("info depth 5 score cp 10");
    h.e.handleLine("bestmove e2e4");
    expect(h.emits).toEqual([]);
    expect(h.sent).toEqual([]);
  });
});
