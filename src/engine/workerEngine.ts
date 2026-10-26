// 단일 스레드 엔진을 Web Worker 에서 돌린다. 이 파일은 화면 쪽 절반이고, Worker 쪽은
// engine-single/worker.js 다.
//
// 격리(crossOriginIsolated)가 안 되는 브라우저에서 쓴다. 안드로이드 앱 안 브라우저가 그렇다.
// 지금 엔진과 같은 모양(RawEngine)으로 감싸서 JanggiEngine 이 그대로 쓴다.
//
// 다른 점은 하나다. 엔진이 생각하는 동안 Worker 가 다른 메시지를 받지 못해 stop 이 닿지 않는다.
// 그래서 멈춰야 하면 restart() 로 Worker 를 끝내고 새로 띄운다. 새 엔진에는 써 둔 파일(신경망)을
// 여기서 다시 넣고, 설정은 JanggiEngine 이 다시 건다.

import { noteTrouble } from "../report/errors";
import type { RawEngine } from "./engine";

/** Worker 에서 쓰는 것만. 테스트는 가짜를 넘긴다. */
export interface EngineWorker {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

type FromWorker =
  | { type: "ready" }
  | { type: "line"; line: string }
  | { type: "error"; message: string };

export interface WorkerSetup {
  /** engine-single/worker.js 의 주소 */
  workerUrl: string;
  /** engine-single/stockfish.js 의 주소. Worker 가 불러온다. */
  glueUrl: string;
  /** stockfish.wasm 의 내용. 한 번 받아 두고 다시 띄울 때도 쓴다. */
  wasmBinary: Uint8Array;
}

export class WorkerEngine implements RawEngine {
  private setup: WorkerSetup;
  private worker: EngineWorker;
  private listeners: ((line: string) => void)[] = [];
  /** 엔진에 써 둔 파일. 새로 띄운 엔진에 다시 쓴다. */
  private files = new Map<string, Uint8Array>();
  private firstReady: Promise<void>;

  readonly FS = {
    writeFile: (path: string, data: Uint8Array) => {
      this.files.set(path, data);
      this.worker.postMessage({ type: "file", path, data });
    },
  };

  private constructor(setup: WorkerSetup) {
    this.setup = setup;
    let ready = () => {};
    let fail = (_err: Error) => {};
    this.firstReady = new Promise<void>((resolve, reject) => {
      ready = resolve;
      fail = reject;
    });
    this.worker = this.spawn(ready, fail);
  }

  /** Worker 를 띄우고 엔진이 뜰 때까지 기다린다. */
  static async create(setup: WorkerSetup): Promise<WorkerEngine> {
    const engine = new WorkerEngine(setup);
    await engine.firstReady;
    return engine;
  }

  postMessage(cmd: string): void {
    this.worker.postMessage({ type: "command", command: cmd });
  }

  addMessageListener(fn: (line: string) => void): void {
    this.listeners.push(fn);
  }

  /**
   * 지금 엔진을 버리고 새로 띄운다. 하던 생각은 사라지고 bestmove 도 오지 않는다.
   *
   * 새 엔진이 뜨기 전에 보낸 명령은 Worker 가 모아 두었다가 뜬 뒤에 순서대로 넣는다.
   * 그래서 기다리지 않고 바로 다음 명령을 보내도 된다.
   */
  restart(): void {
    this.worker.terminate();
    this.worker = this.spawn(
      () => {},
      (err) => noteTrouble("엔진 다시 띄우기", err)
    );
    for (const [path, data] of this.files) {
      this.worker.postMessage({ type: "file", path, data });
    }
  }

  private spawn(onReady: () => void, onFail: (err: Error) => void): EngineWorker {
    const w = makeWorker(this.setup.workerUrl);
    w.onmessage = (e) => {
      // 끝낸 Worker 가 남긴 말은 버린다.
      if (w !== this.worker) return;
      const m = e.data as FromWorker;
      if (m.type === "line") for (const fn of this.listeners) fn(m.line);
      else if (m.type === "ready") onReady();
      else onFail(new Error(m.message));
    };
    w.onerror = (e) => {
      if (w !== this.worker) return;
      onFail(new Error(e.message || "엔진 Worker 를 띄우지 못했습니다."));
    };
    w.postMessage({ type: "init", glue: this.setup.glueUrl, wasmBinary: this.setup.wasmBinary });
    return w;
  }
}

function makeWorker(url: string): EngineWorker {
  return new Worker(url);
}
