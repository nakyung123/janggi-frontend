// 격리가 안 되는 브라우저에서 단일 스레드 엔진을 Worker 로 띄우는 길(engine.ts + workerEngine.ts)
//
// 진짜 엔진(wasm)은 브라우저가 있어야 해서, Worker 를 가짜로 바꿔 끼운다. 가짜는 실제 엔진처럼
// uci·isready·go perft 1 에 답하고, 탐색(go nodes …)에는 정해 둔 때까지 답하지 않는다.
// 진짜 엔진으로는 E2E(e2e/, "격리 없음" 프로젝트)가 같은 길을 돈다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JanggiEngine } from "./engine";

const NNUE_PATH = "/janggi-9991472750de.nnue";
const START = "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1";

type Sent =
  | { type: "init"; glue: string; wasmBinary: Uint8Array }
  | { type: "command"; command: string }
  | { type: "file"; path: string; data: Uint8Array };

class FakeWorker {
  static all: FakeWorker[] = [];
  /** true 면 탐색(go nodes …)에 바로 bestmove 로 답한다. false 면 끝나지 않는 탐색이다. */
  static searchEnds = false;
  static failInit = false;

  readonly url: string;
  readonly sent: Sent[] = [];
  terminated = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWorker.all.push(this);
  }

  postMessage(m: Sent) {
    if (this.terminated) return;
    this.sent.push(m);
    // 진짜 Worker 처럼 답은 나중에 온다.
    setTimeout(() => this.answer(m), 0);
  }

  terminate() {
    this.terminated = true;
  }

  /** 받은 UCI 명령만, 받은 순서대로. 파일은 "file:경로" 로 적는다. */
  log(): string[] {
    return this.sent.map((m) =>
      m.type === "command" ? m.command : m.type === "file" ? "file:" + m.path : "init"
    );
  }

  private say(data: unknown) {
    if (!this.terminated) this.onmessage?.({ data });
  }

  private line(line: string) {
    this.say({ type: "line", line });
  }

  private answer(m: Sent) {
    if (m.type === "init") {
      if (FakeWorker.failInit) this.say({ type: "error", message: "wasm 을 열지 못함" });
      else this.say({ type: "ready" });
      return;
    }
    if (m.type !== "command") return;
    const c = m.command;
    if (c === "uci") this.line("uciok");
    else if (c === "isready") this.line("readyok");
    else if (c === "d") {
      this.line("Fen: " + START);
      this.line("Checkers:");
    } else if (c === "go perft 1") {
      this.line("a4b4: 1");
      this.line("Nodes searched: 1");
    } else if (c.startsWith("go ")) {
      this.line("info depth 1 multipv 1 score cp 10 nodes 100 nps 1000 pv a4b4");
      if (FakeWorker.searchEnds) this.line("bestmove a4b4");
    }
  }
}

const ref = { startFen: START, moves: [] };

/** 이 Worker 가 이 명령을 받을 때까지 기다린다. */
async function untilSent(w: FakeWorker, command: string) {
  await vi.waitFor(() => expect(w.log()).toContain(command));
}

beforeEach(() => {
  FakeWorker.all = [];
  FakeWorker.searchEnds = false;
  FakeWorker.failInit = false;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      // 신경망은 크기만 맞춘 빈 바이트다. gzip 이 아니어서 그대로 쓴다(engine.ts 의 fetchNnue).
      url.includes(".nnue")
        ? new Response(new Uint8Array(10_000_001))
        : new Response(new Uint8Array([0, 97, 115, 109]))
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("격리가 안 되는 브라우저의 엔진", () => {
  it("단일 스레드 엔진을 Worker 에서 띄우고 wasm 을 넘긴다", async () => {
    const engine = await JanggiEngine.create(() => {});

    expect(engine.singleThread).toBe(true);
    expect(FakeWorker.all).toHaveLength(1);
    const init = FakeWorker.all[0].sent[0];
    expect(init.type).toBe("init");
    if (init.type !== "init") return;
    expect(init.glue).toMatch(/stockfish\.js/);
    expect([...init.wasmBinary]).toEqual([0, 97, 115, 109]);
  });

  it("엔진을 띄우지 못하면 만들기가 실패한다", async () => {
    FakeWorker.failInit = true;
    await expect(JanggiEngine.create(() => {})).rejects.toThrow("wasm 을 열지 못함");
  });

  it("생각하는 중에 멈추면 엔진을 새로 띄우고 바로 끝난다", async () => {
    const engine = await JanggiEngine.create(() => {});
    await engine.whenStrong();
    const first = FakeWorker.all[0];

    const search = engine.analyzeOnce(ref, { nodes: 2_000_000 });
    await untilSent(first, "go nodes 2000000");

    await engine.stop();

    expect(first.terminated).toBe(true);
    expect(FakeWorker.all).toHaveLength(2);
    // 끊긴 탐색은 둘 수 없이 끝난다. 그때까지 받은 줄은 남는다.
    const snap = await search;
    expect(snap.bestmove).toBeNull();
    expect(snap.running).toBe(false);
  });

  it("새로 띄운 엔진에는 신경망과 설정이 다음 명령보다 먼저 들어간다", async () => {
    const engine = await JanggiEngine.create(() => {});
    await engine.whenStrong();

    const search = engine.analyzeOnce(ref, { nodes: 2_000_000 });
    await untilSent(FakeWorker.all[0], "go nodes 2000000");
    await engine.stop();
    await search;
    const probe = await engine.probe(ref);

    expect(probe.legal).toEqual(["a4b4"]);
    const log = FakeWorker.all[1].log();
    const at = (s: string) => {
      const i = log.indexOf(s);
      expect(i, s + " 를 받지 못함: " + log.join(" | ")).toBeGreaterThanOrEqual(0);
      return i;
    };
    expect(log[0]).toBe("init");
    expect(at("file:" + NNUE_PATH)).toBeLessThan(at("uci"));
    expect(at("uci")).toBeLessThan(at("setoption name UCI_Variant value janggi"));
    expect(at("setoption name EvalFile value " + NNUE_PATH)).toBeLessThan(at("isready"));
    expect(at("isready")).toBeLessThan(at("d"));
  });

  it("제 한도에서 끝난 탐색 뒤에 멈추면 엔진을 새로 띄우지 않는다", async () => {
    FakeWorker.searchEnds = true;
    const engine = await JanggiEngine.create(() => {});

    const snap = await engine.analyzeOnce(ref, { nodes: 1000 });
    await engine.stop();

    expect(snap.bestmove).toBe("a4b4");
    expect(FakeWorker.all).toHaveLength(1);
    expect(FakeWorker.all[0].log()).not.toContain("stop");
  });
});
