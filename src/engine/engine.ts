// Fairy-Stockfish 제어기
//
// UCI 는 한 번에 한 가지 일만 하는 줄 단위 프로토콜이라, 명령을 마구 던지면
// 응답이 뒤섞인다. 여기서 요청을 직렬화하고, 탐색 중에는 stop 으로만 끊는다.
//
// 뜨는 순서가 중요하다. 엔진(wasm 1.6MB)만 받으면 바로 둘 수 있고, 신경망(11MB)은
// 뒤에서 받아 다 받은 뒤에 갈아 끼운다. 자세한 까닭은 loadNnue 주석에 있다.

import type {
  AnalysisLine,
  PositionProbe,
  PositionRef,
  AnalysisSnapshot,
  EngineOptions,
  LoadProgress,
  SearchLimits,
  Variant,
} from "./types";
import { noteTrouble } from "../report/errors";
import { positionCommand } from "./types";
import { parseInfo, parsePerftMoves } from "./uci";
import { WorkerEngine } from "./workerEngine";
// 격리가 안 되는 브라우저에서 쓰는 단일 스레드 엔진. 빌드가 이름에 내용 해시를 붙여 내보낸다.
// worker.js 는 작아서 그냥 두면 번들 안에 data: 주소로 들어간다. CSP worker-src 'self' 가
// 그 주소를 막으므로 no-inline 으로 파일로 내보낸다.
import singleWorkerUrl from "../../engine-single/worker.js?url&no-inline";
import singleGlueUrl from "../../engine-single/stockfish.js?url";
import singleWasmUrl from "../../engine-single/stockfish.wasm?url";

const ENGINE_BASE = "/engine/";
const NNUE_FILE = "janggi-9991472750de.nnue";
/**
 * 서버에 올라가 있는 이름. 압축해서 둔다(scripts/fetch-engine.mjs).
 *
 * 이름이 세 토막인 까닭 — `.nnue` 신경망, `.gz` gzip 으로 압축됨, `.bin` **서버야 건드리지
 * 마라.** 마지막이 핵심이다. 그냥 `.gz` 로 뒀더니 vite preview 가 보자마자
 * `Content-Encoding: gzip` 을 붙였고, 브라우저가 먼저 풀어 버려서 우리가 또 풀려다
 * 실패했다. 끝이 `.bin` 이면 아무도 손대지 않고 application/octet-stream 으로 나간다.
 */
const NNUE_PACKED = NNUE_FILE + ".gz.bin";
/** 엠스크립튼 가상 파일시스템 안에서의 신경망 경로 */
const NNUE_VFS_PATH = "/" + NNUE_FILE;
/**
 * 신경망이라고 받아들일 최소 크기. 실측 11,261,920 바이트.
 *
 * 크기를 봐야 하는 까닭 - 없는 주소를 물으면 **200 으로 index.html 이 돌아오는** 서버가
 * 있다(쪽 하나짜리 앱의 흔한 기본 동작이다). 그러면 res.ok 가 true 라 그냥 통과하고,
 * HTML 1KB 를 신경망이라고 엔진에 써넣게 된다. 엔진은 조용히 classical 로 두는데 우리는
 * 신경망이 물린 줄 안다. 실제로 그랬다 - 파일을 치우고 띄워 보다가 찾았다.
 *
 * 빌드 스크립트도 같은 까닭으로 같은 검사를 한다(scripts/fetch-engine.mjs 의 minBytes).
 */
const NNUE_MIN_BYTES = 10_000_000;

type Listener = (line: string) => void;

export interface RawEngine {
  postMessage(cmd: string): void;
  addMessageListener(fn: Listener): void;
  FS: { writeFile(path: string, data: Uint8Array): void };
  /**
   * 단일 스레드 엔진(workerEngine.ts)에만 있다. 생각하는 중에 stop 이 닿지 않아서, 멈추려면
   * 엔진을 새로 띄운다.
   */
  restart?(): void;
}

declare global {
  interface Window {
    Stockfish?: (opts?: Record<string, unknown>) => Promise<RawEngine>;
  }
}

/**
 * 진행률을 보고하면서 파일을 받는다. 엔진 wasm 이 쓴다 - 이것만은 다 받아야 판이 뜨므로
 * 받는 동안 무엇을 기다리는지 보여야 한다. 신경망은 뒤에서 받으니 표시가 필요 없다.
 */
async function fetchWithProgress(
  url: string,
  stage: string,
  onProgress: (p: LoadProgress) => void
): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(stage + " 내려받기 실패 (HTTP " + res.status + ")");

  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ stage, loaded, total });
  }

  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * 압축해 둔 신경망을 받아서 푼다. 5.74MB 를 받아 11.26MB 를 얻는다.
 *
 * **왜 우리가 푸나** — 서버가 `Content-Encoding` 을 붙여 주면 브라우저가 알아서 풀어
 * 준다. 그 길을 안 간 까닭은 그러면 동작이 **우리 코드가 아니라 호스트 설정에 달리기**
 * 때문이다. 헤더가 빠진 날에는 압축 덩어리가 그대로 넘어오고, 앱은 신경망 없이 조용히
 * 돈다 - 이미 한 번 당한 모양이다(NNUE_MIN_BYTES 주석). 우리가 풀면 어디에 올리든 같다.
 *
 * brotli 면 4.88MB 로 더 작지만 브라우저에 brotli 를 푸는 API 가 없어서, 쓰려면 위
 * 헤더에 기대는 수밖에 없다. 0.86MB 를 호스트 의존과 바꾸지 않았다.
 *
 * **이미 풀려서 올 수도 있다.** 서버가 제 딴에는 도우려고 `Content-Encoding` 을 붙이면
 * 브라우저가 먼저 푼다. 그래서 받은 것이 정말 gzip 인지 **앞 두 바이트를 보고** 가른다
 * (0x1f 0x8b). 아니면 이미 풀린 것이니 그대로 쓴다. 파일 이름으로 그런 서버를 피해
 * 두긴 했지만(NNUE_PACKED 주석), 올릴 데마다 확인하느니 양쪽을 다 받는 편이 낫다.
 *
 * **그래도 못 쓰는 경우가 둘이다.** 서버가 신경망 대신 index.html 을 돌려줬거나(그건
 * gzip 도 아니고 11MB 도 아니라 부르는 쪽 크기 검사에 걸린다), DecompressionStream 이
 * 없는 옛 브라우저이거나(사파리 16.3 이하, 파이어폭스 112 이하). 둘 다 부르는 쪽이
 * 장부에 적고 classical 로 둔다.
 */
async function fetchNnue(): Promise<Uint8Array> {
  const res = await fetch(ENGINE_BASE + NNUE_PACKED);
  if (!res.ok) {
    throw new Error("장기 신경망 내려받기 실패 (HTTP " + res.status + ")");
  }
  const got = new Uint8Array(await res.arrayBuffer());

  const isGzip = got[0] === 0x1f && got[1] === 0x8b;
  if (!isGzip) return got;

  if (typeof DecompressionStream === "undefined") {
    throw new Error("이 브라우저는 gzip 을 풀지 못합니다.");
  }
  const packed = new Blob([got]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(packed).arrayBuffer());
}

function loadEngineScript(): Promise<void> {
  if (window.Stockfish) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = ENGINE_BASE + "stockfish.js";
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("stockfish.js 를 불러오지 못했습니다."));
    document.head.appendChild(el);
  });
}

/** 스레드를 쓰는 엔진. 격리된 브라우저에서만 뜬다. */
async function loadThreaded(onProgress: (p: LoadProgress) => void): Promise<RawEngine> {
  await loadEngineScript();
  const factory = window.Stockfish;
  if (!factory) throw new Error("Stockfish 로더를 찾지 못했습니다.");

  const wasmBinary = await fetchWithProgress(
    ENGINE_BASE + "stockfish.wasm",
    "엔진",
    onProgress
  );
  onProgress({ stage: "엔진 초기화", loaded: 0, total: 0 });
  return factory({ wasmBinary });
}

/** 단일 스레드 엔진. Web Worker 안에서 돈다(workerEngine.ts). */
async function loadSingleThread(onProgress: (p: LoadProgress) => void): Promise<RawEngine> {
  const wasmBinary = await fetchWithProgress(singleWasmUrl, "엔진", onProgress);
  onProgress({ stage: "엔진 초기화", loaded: 0, total: 0 });
  return WorkerEngine.create({
    workerUrl: singleWorkerUrl,
    glueUrl: singleGlueUrl,
    wasmBinary,
  });
}

export class JanggiEngine {
  private raw: RawEngine;
  private listeners = new Set<Listener>();
  /** 명령 직렬화용 꼬리. 앞선 작업이 끝나야 다음이 시작된다. */
  private tail: Promise<unknown> = Promise.resolve();
  private searching = false;
  /** 가장 최근 탐색 요청의 번호. 뒤늦게 차례가 온 옛 요청을 걸러낸다. */
  private searchGen = 0;
  /** 진행 중인(또는 대기 중인) 탐색 작업. stop() 이 이걸 기다린다. */
  private searchSettled: Promise<unknown> = Promise.resolve();
  /** 신경망이 가상 파일시스템에 올라가 EvalFile 로 물렸는지. */
  private nnueLoaded = false;
  /** 신경망이 다 물릴 때까지. 실패해도 reject 하지 않는다(그래도 둘 수 있다). */
  private strongReady: Promise<void> = Promise.resolve();
  /** 탐색을 끊으려고 엔진을 새로 띄웠는지. 그 탐색이 끝나는 자리에서 설정을 다시 건다. */
  private restarted = false;
  /**
   * 단일 스레드 엔진인지. 격리가 안 되는 브라우저에서 이렇다(create 주석).
   * Threads 설정과 상관없이 스레드 하나로 돈다. 복기 시간 어림이 이 값을 본다.
   */
  readonly singleThread: boolean;
  private options: EngineOptions = {
    threads: 1,
    hashMb: 128,
    multiPV: 3,
    skill: 20,
    variant: "janggi",
  };

  private constructor(raw: RawEngine) {
    this.raw = raw;
    this.singleThread = raw.restart !== undefined;
    this.raw.addMessageListener((line) => {
      for (const fn of this.listeners) fn(line);
    });
  }

  static async create(
    onProgress: (p: LoadProgress) => void
  ): Promise<JanggiEngine> {
    /*
     * 격리가 되면 스레드를 쓰는 엔진, 안 되면 단일 스레드 엔진을 띄운다.
     *
     * 스레드를 쓰는 엔진은 SharedArrayBuffer 가 있어야 뜨고, 그것은 격리가 돼야 생긴다.
     * 안드로이드 앱 안 브라우저(카카오톡, 네이버 앱 등)는 헤더를 줘도 격리가 안 된다. 예전에는
     * 거기서 "다른 브라우저로 열기" 를 안내하고 멈췄고, 앱 안 브라우저 방문은 모두 실패했다.
     *
     * 단일 스레드 엔진은 같은 수를 두지만 폰의 4스레드보다 약 4배 느리다. 그래서 격리가
     * 되는 브라우저에서는 쓰지 않는다. crossOriginIsolated 가 아예 없는 옛 사파리(15.2 미만)도
     * 단일 스레드 쪽으로 간다.
     */
    const raw =
      globalThis.crossOriginIsolated === true
        ? await loadThreaded(onProgress)
        : await loadSingleThread(onProgress);
    const engine = new JanggiEngine(raw);

    await engine.handshake();
    await engine.applyOptions();

    // 신경망은 기다리지 않는다. 받는 동안에도 둘 수 있다(loadNnue 주석).
    engine.strongReady = engine.loadNnue();

    return engine;
  }

  /**
   * 신경망을 뒤에서 받아 갈아 끼운다.
   *
   * **왜 기다리지 않나** — 신경망은 받는 데 5.74MB(푼 뒤 11.26MB)다. 다 받아야 판이 뜨게
   * 해 두면 처음 온 사람이 빈 화면을 한참 본다(휴대폰이면 더). 엔진 자체는 1.6MB 라,
   * 그것만 받고 뜨면 체감이 훨씬 빠르다. 그 사이에도 엔진은 classical 평가로 멀쩡히 둔다.
   *
   * **언제 갈아 끼우나** — 큐에 넣는다. 탐색이 돌고 있으면 그 탐색이 끝난 뒤다. 중간에
   * 끊지 않는다 - 끊으면 AI 가 두던 수가 사라진다.
   *
   * **실패해도 던지지 않는다.** 신경망이 없어도 앱은 돈다. 예전에는 이 내려받기가
   * 실패하면 앱이 아예 안 떴다.
   */
  private async loadNnue(): Promise<void> {
    try {
      const nnue = await fetchNnue();
      if (nnue.byteLength < NNUE_MIN_BYTES) {
        throw new Error(
          "신경망이 아닌 것을 받았습니다. (" + nnue.byteLength + "바이트)"
        );
      }
      await this.queue(async () => {
        this.raw.FS.writeFile(NNUE_VFS_PATH, nnue);
        this.nnueLoaded = true;
        await this.applyOptions();
      });
    } catch (err) {
      noteTrouble("장기 신경망 내려받기", err);
    }
  }

  /**
   * 신경망까지 물리기를 기다린다. 이미 물렸거나 실패했으면 바로 끝난다.
   *
   * 대국은 기다릴 필요가 없다 - 몇 수 약하게 두는 것이 10초 기다리는 것보다 낫고,
   * 사람이 첫 수를 두는 동안 어차피 다 받는다. 복기는 다르다. 한 번 매긴 등급이 그대로
   * 남으므로, 신경망으로 매겨야 한다.
   */
  whenStrong(): Promise<void> {
    return this.strongReady;
  }

  // --- 저수준 통신 -------------------------------------------------------

  private send(cmd: string) {
    this.raw.postMessage(cmd);
  }

  /** 종료 조건을 만족하는 줄이 나올 때까지 모아서 돌려준다. */
  private collect(
    isDone: (line: string) => boolean,
    timeoutMs = 60000
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const buffer: string[] = [];
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error("엔진 응답 시간이 초과되었습니다."));
      }, timeoutMs);

      const listener: Listener = (line) => {
        buffer.push(line);
        if (isDone(line)) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve(buffer);
        }
      };
      this.listeners.add(listener);
    });
  }

  /** 앞선 요청이 끝난 뒤에 실행되도록 줄을 세운다. */
  private queue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.tail.then(job, job);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async handshake() {
    const done = this.collect((l) => l === "uciok");
    this.send("uci");
    await done;
  }

  private async ready() {
    const done = this.collect((l) => l === "readyok");
    this.send("isready");
    await done;
  }

  // --- 설정 -------------------------------------------------------------

  private async applyOptions() {
    const o = this.options;
    // 순서가 중요하다. 변형을 먼저 알리고 그 변형의 국면을 물린 뒤에야
    // EvalFile 이 장기용 신경망으로 인식된다.
    this.send("setoption name UCI_Variant value " + o.variant);
    this.send("position startpos");
    if (this.nnueLoaded) {
      this.send("setoption name EvalFile value " + NNUE_VFS_PATH);
    } else {
      // 아직 파일이 없다. 켜 두면 엔진이 없는 파일을 찾는다. 꺼 두면 classical 로 둔다.
      this.send("setoption name Use NNUE value false");
    }
    this.send("setoption name Threads value " + o.threads);
    this.send("setoption name Hash value " + o.hashMb);
    this.send("setoption name MultiPV value " + o.multiPV);
    // 급수 대국의 손잡이. 20 이 전력, 낮출수록 최선수를 덜 고른다.
    this.send("setoption name Skill Level value " + o.skill);
    await this.ready();
  }

  getOptions(): EngineOptions {
    return { ...this.options };
  }

  async setOptions(patch: Partial<EngineOptions>): Promise<void> {
    this.options = { ...this.options, ...patch };
    // 설정을 바꾸려면 먼저 탐색을 끊어야 한다. 큐 밖에서 끊는 이유는 stop() 주석 참고.
    await this.stop();
    await this.queue(() => this.applyOptions());
  }

  /** 신경망이 실제로 물렸는지 확인한다. 진단용. */
  async evaluationMode(fen: string): Promise<string> {
    return this.queue(async () => {
      this.send("position fen " + fen);
      const done = this.collect((l) => l.includes("evaluation"));
      this.send("eval");
      const out = await done;
      return (
        out
          .find((l) => l.includes("evaluation"))
          ?.replace("info string ", "")
          .trim() ?? "알 수 없음"
      );
    });
  }

  // --- 국면 조회 ---------------------------------------------------------

  /**
   * 국면을 한 번에 살핀다. 엔진에게 두 가지를 묻는다.
   *   d           → 엔진이 해석한 FEN 과 "Checkers:" (궁을 노리는 기물 자리)
   *   go perft 1  → 합법수 전체
   * 합법수가 0이면 대국이 끝난 것이고, Checkers 가 비어 있지 않으면 장군이다.
   * 두 질문을 한 작업으로 묶어 큐를 덜 오간다.
   */
  async probe(ref: PositionRef): Promise<PositionProbe> {
    return this.queue(async () => {
      this.send(positionCommand(ref));

      const dumped = this.collect((l) => l.startsWith("Checkers:"));
      this.send("d");
      const dump = await dumped;

      const normalized =
        dump.find((l) => l.startsWith("Fen:"))?.replace("Fen:", "").trim() ??
        null;
      const checkers =
        dump
          .find((l) => l.startsWith("Checkers:"))
          ?.replace("Checkers:", "")
          .trim()
          .split(/\s+/)
          .filter(Boolean) ?? [];

      const listed = this.collect((l) => l.startsWith("Nodes searched"));
      this.send("go perft 1");
      const legal = parsePerftMoves(await listed);

      return { fen: normalized, checkers, legal };
    });
  }

  /**
   * 기보의 수가 모두 규칙에 맞는지 가린다. 맞지 않는 첫 수의 번호(0부터)를, 다 맞으면
   * null 을 돌려준다.
   *
   * 앞에서부터 한 수씩 국면을 물리고 합법수(go perft 1)에 다음 수가 있는지 본다. 수순을
   * 통째로 넘겨서는 알 수 없다 - position 명령은 규칙에 어긋난 수를 만나면 말없이 거기서
   * 멈추고, 엔진은 그 앞 국면에 머문 채 아무 일 없다는 듯 답한다.
   *
   * 합법수는 규칙마다 다를 수 있어 기보의 규칙으로 잠깐 바꿔 묻고, 끝나면 지금 설정으로
   * 되돌린다. 되돌릴 때는 설정 전체를 다시 건다 - 규칙을 바꾸면 신경망도 다시 물려야 한다
   * (applyOptions 주석 참고).
   */
  async firstIllegalMove(
    variant: Variant,
    startFen: string,
    moves: string[]
  ): Promise<number | null> {
    return this.queue(async () => {
      const switched = variant !== this.options.variant;
      if (switched) this.send("setoption name UCI_Variant value " + variant);
      try {
        for (let i = 0; i < moves.length; i++) {
          this.send(positionCommand({ startFen, moves: moves.slice(0, i) }));
          const listed = this.collect((l) => l.startsWith("Nodes searched"));
          this.send("go perft 1");
          if (!parsePerftMoves(await listed).includes(moves[i])) return i;
        }
        return null;
      } finally {
        if (switched) await this.applyOptions();
      }
    });
  }

  // --- 탐색 -------------------------------------------------------------

  /**
   * 탐색을 끊는다.
   *
   * 이 메서드는 일부러 큐를 거치지 않는다. 무제한 분석은 bestmove 가 올 때까지
   * 끝나지 않는 큐 작업이라, stop 까지 줄을 세우면 서로를 기다리며 영원히 멈춘다.
   * 끊는 명령은 큐 밖에서 곧장 나가야 안에서 도는 탐색을 깨울 수 있다.
   */
  async stop(): Promise<void> {
    // 아직 시작하지 않고 큐에서 대기 중인 탐색도 무효로 만든다.
    this.searchGen += 1;
    if (this.searching) {
      if (this.singleThread) this.interrupt();
      else this.send("stop");
    }
    await this.searchSettled;
  }

  /**
   * 단일 스레드 엔진의 탐색을 끊는다. 엔진을 새로 띄우는 수밖에 없다(workerEngine.ts).
   *
   * stop 을 보내면 지금 탐색이 제 한도(노드 수, 시간)를 다 채운 뒤에야 닿는다. 높은 급수는
   * 30초, 폰의 "정밀" 복기는 한 국면에 20초가 넘는다. 그동안 무르기·새 판이 멈춰 있게 된다.
   *
   * 새로 띄운 엔진은 bestmove 를 내지 않으므로, 기다리는 탐색(runSearch)에 대신 넣어 끝낸다.
   * 설정은 그 탐색이 끝나는 자리에서 다시 건다. 큐 안이라 다음 작업보다 먼저 들어간다.
   */
  private interrupt() {
    this.raw.restart?.();
    this.searching = false;
    this.restarted = true;
    for (const fn of this.listeners) fn("bestmove (none)");
  }

  /**
   * 탐색 한 번. 이미 큐 안에 들어와 있다고 가정한다.
   * analyze() 와 analyzeOnce() 가 이 한 몸을 같이 쓴다.
   */
  private async runSearch(
    ref: PositionRef,
    limits: SearchLimits,
    onUpdate?: (snap: AnalysisSnapshot) => void
  ): Promise<AnalysisSnapshot> {
    // 둘 차례는 시작 국면과 둔 수의 개수로 정해진다.
    const startsWithCho = ref.startFen.split(/\s+/)[1] !== "b";
    const choToMove = ref.moves.length % 2 === 0 ? startsWithCho : !startsWithCho;
    const lines = new Map<number, AnalysisLine>();
    const snap: AnalysisSnapshot = {
      lines: [],
      depth: 0,
      nodes: 0,
      nps: 0,
      timeMs: 0,
      hashfull: 0,
      bestmove: null,
      running: true,
    };

    // 매 info 라인마다 렌더링하면 초당 수십 번이라 화면이 버벅인다.
    // 갱신은 모아뒀다가 일정 간격으로 흘려보낸다.
    let dirty = false;
    const collectLines = () =>
      [...lines.values()]
        .sort((a, b) => a.multipv - b.multipv)
        .map((l) => ({ ...l }));
    const flush = () => {
      if (!dirty || !onUpdate) return;
      dirty = false;
      onUpdate({ ...snap, lines: collectLines() });
    };
    // 결과만 받아가는 쪽(복기)은 중간 보고가 필요 없다.
    const ticker = onUpdate ? window.setInterval(flush, 120) : 0;

    const done = this.collect(
      (l) => l.startsWith("bestmove"),
      24 * 60 * 60 * 1000
    );
    const listener: Listener = (line) => {
      const info = parseInfo(line, choToMove);
      if (!info?.pv || info.depth === undefined) return;
      lines.set(info.multipv ?? 1, {
        multipv: info.multipv ?? 1,
        depth: info.depth,
        seldepth: info.seldepth ?? info.depth,
        score: info.score ?? 0,
        mate: info.mate ?? null,
        pv: info.pv,
      });
      snap.depth = Math.max(snap.depth, info.depth);
      snap.nodes = info.nodes ?? snap.nodes;
      snap.nps = info.nps ?? snap.nps;
      snap.timeMs = info.timeMs ?? snap.timeMs;
      snap.hashfull = info.hashfull ?? snap.hashfull;
      dirty = true;
    };
    this.listeners.add(listener);

    this.send(positionCommand(ref));
    let go = "go";
    if (limits.infinite) go += " infinite";
    if (limits.depth) go += " depth " + limits.depth;
    if (limits.nodes) go += " nodes " + limits.nodes;
    if (limits.movetimeMs) go += " movetime " + limits.movetimeMs;
    this.searching = true;
    this.send(go);

    const out = await done;
    this.searching = false;
    if (ticker) window.clearInterval(ticker);
    this.listeners.delete(listener);

    if (this.restarted) {
      // 새로 띄운 엔진은 아무것도 모른다. 신경망 파일은 workerEngine 이 다시 넣었다.
      this.restarted = false;
      await this.handshake();
      await this.applyOptions();
    }

    const best = out.find((l) => l.startsWith("bestmove"))?.split(" ")[1];
    snap.bestmove = best && best !== "(none)" ? best : null;
    snap.running = false;
    dirty = true;
    flush();

    return { ...snap, lines: collectLines() };
  }

  /**
   * 국면을 분석한다. 진행 상황이 갱신될 때마다 onUpdate 가 호출되고,
   * 탐색이 끝나면 마지막 스냅샷의 running 이 false 가 된다.
   */
  analyze(
    ref: PositionRef,
    limits: SearchLimits,
    onUpdate: (snap: AnalysisSnapshot) => void
  ): void {
    const gen = ++this.searchGen;
    const job = this.queue(async () => {
      // 줄을 서 있는 사이에 국면이 또 바뀌었다면 이 요청은 버린다.
      if (gen !== this.searchGen) return;
      await this.runSearch(ref, limits, onUpdate);
    });

    // stop() 이 이 작업의 끝을 기다릴 수 있게 해둔다. 실패해도 멈추지 않도록 삼킨다.
    this.searchSettled = job.catch(() => undefined);
    void job;
  }

  /**
   * 한 국면을 끝까지 분석하고 결과를 돌려준다.
   * 기보를 처음부터 끝까지 한 수씩 훑는 복기가 이걸 쓴다.
   */
  async analyzeOnce(
    ref: PositionRef,
    limits: SearchLimits
  ): Promise<AnalysisSnapshot> {
    const gen = ++this.searchGen;
    const job = this.queue(async () => {
      if (gen !== this.searchGen) {
        throw new Error("분석이 취소되었습니다.");
      }
      return this.runSearch(ref, limits);
    });
    this.searchSettled = job.catch(() => undefined);
    return job;
  }
}
