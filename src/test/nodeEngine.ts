// 시험에서 진짜 엔진을 Node 로 띄운다 - 국면을 넣고 판·장군·합법수를 묻는다
//
// 앱이 싣는 엔진은 node_modules/fairy-stockfish-nnue.wasm 을 public/engine 으로 복사한 것이다
// (scripts/fetch-engine.mjs). 이 패키지를 시험 안에서 띄워, 앱과 같은 명령(d, go perft 1)과 같은
// 합법수 읽기 함수(engine/uci.ts)로 묻는다. 합법수만 물으므로 신경망은 물리지 않는다.
//
// mate.test.ts·openings.test.ts 에도 같은 코드가 있다. 그 둘을 이 파일로 옮기는 것은 따로 한다
// (이 파일을 만든 일의 범위 밖이었다).

import { parsePerftMoves } from "../engine/uci";

/*
 * Node 모듈은 이름을 변수로 넘겨 불러온다. 앱 코드는 브라우저에서 돌아서 tsconfig 에 Node 타입이
 * 없다(types: vite/client). 이 도움 함수 하나 때문에 타입 패키지를 들이지 않는다 - 대신 받은 값은
 * 타입 검사를 받지 않는다.
 */
const nodeModule = (name: string) => import(/* @vite-ignore */ name);

export interface Probe {
  /** 엔진이 해석한 FEN 의 판 칸 */
  board: string;
  /** 둘 차례 쪽 궁에 장군을 거는 기물의 자리. 비면 장군이 아니다. */
  checkers: string[];
  /** 합법수(a4a5 꼴). 한수쉼(e1e1)도 들어 있다. */
  legal: string[];
}

export interface NodeEngine {
  variant(v: string): void;
  probe(fen: string, moves?: string[]): Promise<Probe>;
}

/*
 * 엔진을 띄운다. 끝에 quit 을 보내지 않는다 - 받으면 엔진이 프로세스째 끝내서 vitest 작업
 * 프로세스가 죽는다(끝 코드 7).
 */
export async function openNodeEngine(): Promise<NodeEngine> {
  const { createRequire } = await nodeModule("node:module");
  const { readFile } = await nodeModule("node:fs/promises");
  const Stockfish = createRequire(import.meta.url)("fairy-stockfish-nnue.wasm/stockfish.js");
  // .wasm 은 직접 읽어 넘긴다. 엔진이 fetch 로 받으려 하면 Node 에서는 파일 경로를 못 읽는다
  // (scripts/verify-engine.mjs 와 같다).
  const wasm = new URL("../../node_modules/fairy-stockfish-nnue.wasm/stockfish.wasm", import.meta.url);
  const engine = await Stockfish({ wasmBinary: new Uint8Array(await readFile(wasm)) });
  const waiters: { lines: string[]; done: (l: string) => boolean; resolve: (l: string[]) => void }[] = [];
  engine.addMessageListener((line: string) => {
    for (const w of waiters.slice()) {
      w.lines.push(line);
      if (w.done(line)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(w.lines);
      }
    }
  });
  const ask = (command: string, done: (l: string) => boolean) =>
    new Promise<string[]>((resolve) => {
      waiters.push({ lines: [], done, resolve });
      engine.postMessage(command);
    });
  await ask("uci", (l) => l === "uciok");
  return {
    variant: (v) => engine.postMessage("setoption name UCI_Variant value " + v),
    // 앱의 국면 조회(engine/engine.ts 의 probe)와 같은 순서로 묻는다.
    async probe(fen, moves = []) {
      engine.postMessage(`position fen ${fen}${moves.length ? " moves " + moves.join(" ") : ""}`);
      const dump = await ask("d", (l) => l.startsWith("Checkers:"));
      const board = dump.find((l) => l.startsWith("Fen:"))!.slice(4).trim().split(" ")[0];
      const checkers = dump.find((l) => l.startsWith("Checkers:"))!.slice(9).trim().split(/\s+/).filter(Boolean);
      const legal = parsePerftMoves(await ask("go perft 1", (l) => l.startsWith("Nodes searched")));
      return { board, checkers, legal };
    },
  };
}
