// 외통 문제 - 데이터가 앱의 엔진과 같은지, 정답 판정과 푼 기록 모양
//
// 화면은 엔진 없이 데이터(mates.json)의 합법수로 둔다. 그 합법수가 엔진과 다르면 둘 수 있는 수가
// 막히거나 둘 수 없는 수가 열리고, 주 수순 끝이 외통이 아니면 "풀었습니다" 가 거짓말이 된다. 그래서
// 앱이 싣는 엔진과 같은 패키지(node_modules/fairy-stockfish-nnue.wasm - scripts/fetch-engine.mjs 가
// public/engine 으로 복사한다)를 여기서 띄워, 세 규칙에서 문제마다 다시 묻는다. 묻는 명령(d,
// go perft 1)과 합법수를 읽는 함수(engine/uci.ts)도 앱과 같다. 엔진 패키지 판이 오르면 이 시험이
// 어긋남을 잡는다.
//
// 정답이 하나뿐인지(다른 수로도 n수 외통이 되지 않는지)는 여기서 보지 않는다. 3수 문제 하나에
// 수십 초~수 분이 걸린다. 조사 세션의 완전 탐색(scripts/mate-data.mjs 머리 주석) 결과를 믿는다.

import { beforeAll, describe, expect, it } from "vitest";
import { parsePerftMoves } from "../engine/uci";
import { parseFen, toFen, validate } from "./board";
import type { MatePuzzle } from "./mate";
import {
  MATES,
  NO_SOLVED,
  answerAt,
  attackerOf,
  isSolvedRecord,
  kingOf,
  legalAt,
  nextOf,
  numberOf,
  positionAt,
  replyAt,
  solvedIn,
  withSolved,
} from "./mate";
import { gameStatus } from "./status";

// --- 엔진 ------------------------------------------------------------------------

const VARIANTS = ["janggi", "janggimodern", "janggitraditional"] as const;

/*
 * Node 모듈은 이름을 변수로 넘겨 불러온다. 앱 코드는 브라우저에서 돌아서 tsconfig 에 Node 타입이
 * 없다(types: vite/client). 이 시험 하나 때문에 타입 패키지를 들이지 않는다 - 대신 받은 값은 타입
 * 검사를 받지 않는다.
 */
const nodeModule = (name: string) => import(/* @vite-ignore */ name);

interface Probe {
  /** 엔진이 해석한 FEN 의 판 칸 */
  board: string;
  checkers: string[];
  legal: string[];
}

interface Engine {
  variant(v: string): void;
  probe(fen: string, moves: string[]): Promise<Probe>;
}

/*
 * 엔진을 띄운다. 끝에 quit 을 보내지 않는다 - 받으면 엔진이 프로세스째 끝내서 vitest 작업
 * 프로세스가 죽는다(끝 코드 7).
 */
async function openEngine(): Promise<Engine> {
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
    async probe(fen, moves) {
      engine.postMessage(`position fen ${fen}${moves.length ? " moves " + moves.join(" ") : ""}`);
      const dump = await ask("d", (l) => l.startsWith("Checkers:"));
      const board = dump.find((l) => l.startsWith("Fen:"))!.slice(4).trim().split(" ")[0];
      const checkers = dump.find((l) => l.startsWith("Checkers:"))!.slice(9).trim().split(/\s+/).filter(Boolean);
      const legal = parsePerftMoves(await ask("go perft 1", (l) => l.startsWith("Nodes searched")));
      return { board, checkers, legal };
    },
  };
}

const isPass = (m: string) => m.slice(0, m.length / 2) === m.slice(m.length / 2);

/** 문제 id 를 FEN 에서 다시 계산한다(scripts/mate-data.mjs 와 같은 값이어야 한다). */
async function idOf(fen: string): Promise<string> {
  const text = new TextEncoder().encode(fen.split(" ").slice(0, 2).join(" "));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", text));
  return [...hash].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10);
}

/**
 * 문제 데이터를 엔진과 맞춰 본다. 어긋난 곳을 말로 돌려준다(없으면 빈 배열).
 * 일부러 망가뜨린 사본도 같은 함수로 넣어 본다 - 검사가 실제로 무언가를 잡는지 보려고.
 */
async function problemsOf(list: readonly MatePuzzle[], engine: Engine): Promise<string[]> {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of list) {
    const where = `${p.id}(${p.n}수)`;
    const start = parseFen(p.fen);
    if (validate(start).length > 0) problems.push(`${where}: 판이 맞지 않음 ${validate(start).join(" ")}`);
    if (p.id !== (await idOf(p.fen))) problems.push(`${where}: id 가 FEN 으로 계산한 값과 다름`);
    if (ids.has(p.id)) problems.push(`${where}: id 겹침`);
    ids.add(p.id);
    if (p.line.length !== p.n * 2 - 1) problems.push(`${where}: 수순 길이가 ${p.line.length}`);
    if (p.legal.length !== p.n) problems.push(`${where}: 합법수 묶음이 ${p.legal.length}개`);

    for (const v of VARIANTS) {
      engine.variant(v);
      for (let ply = 0; ply <= p.line.length; ply++) {
        const got = await engine.probe(p.fen, p.line.slice(0, ply));
        const at = `${where} ${v} ${ply}째 수 앞`;
        // 화면이 그리는 판(applyMove 로 둔 것)이 엔진의 판과 같아야 한다.
        if (toFen(positionAt(p, ply)).split(" ")[0] !== got.board) problems.push(`${at}: 판이 엔진과 다름`);
        if (ply === p.line.length) {
          const status = gameStatus({ position: positionAt(p, ply), legal: new Set(got.legal), checkers: got.checkers, ready: true });
          if (status.kind !== "checkmate") problems.push(`${where} ${v}: 수순 끝이 외통이 아님(${status.kind})`);
        } else if (ply % 2 === 0) {
          const engineLegal = got.legal.filter((m) => !isPass(m)).sort();
          if (engineLegal.join(" ") !== [...(p.legal[ply / 2] ?? [])].sort().join(" ")) {
            problems.push(`${at}: 합법수가 엔진과 다름`);
          }
          if (!got.legal.includes(p.line[ply])) problems.push(`${at}: 정답이 합법수가 아님`);
        } else if (!got.legal.includes(p.line[ply])) {
          problems.push(`${at}: 응수가 합법수가 아님`);
        }
        if (ply === 1 && v === "janggi" && p.quiet !== (got.checkers.length === 0)) {
          problems.push(`${where}: "첫 수가 장군 아님" 표시가 엔진과 다름`);
        }
      }
    }
  }
  return problems;
}

describe("데이터 - 앱의 엔진과 같다(세 규칙)", () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await openEngine();
  }, 30_000);

  it("42문제(1수 21, 2수 13, 3수 8), 공격 차례 합법수·응수·판·끝 국면 외통이 모두 엔진과 맞는다", async () => {
    expect([1, 2, 3].map((n) => MATES.filter((p) => p.n === n).length)).toEqual([21, 13, 8]);
    expect(await problemsOf(MATES, engine)).toEqual([]);
  }, 60_000);

  // 검사가 실제로 잡는지. 문제 하나씩을 망가뜨린 사본을 넣어 본다.
  const twoMove = () => structuredClone(MATES.find((p) => p.n === 2)!);

  it("망가뜨린 사본 1 - 첫 수 정답을 다른 합법수로 바꾸면 잡는다", async () => {
    const p = twoMove();
    p.line[0] = p.legal[0].find((m) => m !== p.line[0])!;
    expect(await problemsOf([p], engine)).not.toEqual([]);
  }, 30_000);

  it("망가뜨린 사본 2 - 합법수 하나를 빼면 잡는다", async () => {
    const p = twoMove();
    p.legal[0] = p.legal[0].filter((m) => m !== p.legal[0].find((x) => x !== p.line[0]));
    expect(await problemsOf([p], engine)).toEqual(
      VARIANTS.map((v) => `${p.id}(2수) ${v} 0째 수 앞: 합법수가 엔진과 다름`)
    );
  }, 30_000);

  it("망가뜨린 사본 3 - 마지막 수를 지워 1수 문제로 만들면 끝 국면이 외통이 아니라고 잡는다", async () => {
    const p = twoMove();
    p.n = 1;
    p.line = [p.line[0]];
    p.legal = [p.legal[0]];
    expect(await problemsOf([p], engine)).toEqual(
      VARIANTS.map((v) => `${p.id}(1수) ${v}: 수순 끝이 외통이 아님(check)`)
    );
  }, 30_000);
});

// --- 판정·순서 ---------------------------------------------------------------------

describe("판정과 순서", () => {
  const p = MATES.find((q) => q.n === 3)!;

  it("정답·응수·합법수는 공격 쪽 수 번호(0부터)로 꺼낸다", () => {
    expect([0, 1, 2].map((s) => answerAt(p, s))).toEqual([p.line[0], p.line[2], p.line[4]]);
    expect([0, 1, 2].map((s) => replyAt(p, s))).toEqual([p.line[1], p.line[3], null]);
    expect([...legalAt(p, 1)]).toEqual(p.legal[1]);
  });

  it("공격 쪽은 문제 국면의 둘 차례다. 한이 공격하는 문제도 있다", () => {
    expect(new Set(MATES.map(attackerOf))).toEqual(new Set(["cho", "han"]));
    for (const q of MATES) expect(attackerOf(q)).toBe(q.fen.split(" ")[1] === "w" ? "cho" : "han");
  });

  it("주 수순을 다 두면 수비 쪽 궁이 판에 있고 둘 차례가 수비 쪽이다", () => {
    for (const q of MATES) {
      const end = positionAt(q, q.line.length);
      const defender = attackerOf(q) === "cho" ? "han" : "cho";
      expect(end.turn).toBe(defender);
      expect(kingOf(end, defender)).not.toBeNull();
    }
  });

  it("번호는 묶음 안에서 1부터, 다음 문제는 전체 순서의 다음이고 마지막 뒤에는 없다", () => {
    const ones = MATES.filter((q) => q.n === 1);
    expect(numberOf(ones[0])).toBe(1);
    expect(numberOf(ones[20])).toBe(21);
    expect(numberOf(MATES.find((q) => q.n === 2)!)).toBe(1);
    expect(nextOf(ones[20])).toBe(MATES.find((q) => q.n === 2));
    expect(nextOf(MATES[MATES.length - 1])).toBeNull();
  });

  it("묶음은 1수 → 2수 → 3수, 묶음 안에서는 첫 수가 장군인 문제가 먼저다", () => {
    const keys = MATES.map((q) => [q.n, Number(q.quiet)]);
    expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  });
});

// --- 푼 기록 ----------------------------------------------------------------------

describe("푼 기록 모양", () => {
  it("solved 가 문자열 배열인 객체만 받는다", () => {
    expect(isSolvedRecord({ solved: [] })).toBe(true);
    expect(isSolvedRecord({ solved: ["8b7f95153b"] })).toBe(true);
    // 나중에 칸이 더해진 기록도 읽는다.
    expect(isSolvedRecord({ solved: ["8b7f95153b"], later: 1 })).toBe(true);

    for (const bad of [null, "x", 3, [], ["8b7f95153b"], {}, { solved: "8b7f95153b" }, { solved: [1] }, { solved: [null] }]) {
      expect(isSolvedRecord(bad)).toBe(false);
    }
  });

  it("푼 문제를 더하면 한 번만 들어가고, 다른 칸은 그대로 둔다", () => {
    const once = withSolved(NO_SOLVED, "a");
    expect(once).toEqual({ solved: ["a"] });
    expect(withSolved(once, "a")).toBe(once);
    const later = { solved: ["a"], later: 1 };
    expect(withSolved(later, "b")).toEqual({ solved: ["a", "b"], later: 1 });
  });

  it("데이터에 없는 id 는 기록에 남아 있어도 푼 문제로 세지 않는다", () => {
    const record = { solved: [MATES[0].id, "0000000000", MATES[5].id] };
    expect(solvedIn(record, MATES)).toEqual(new Set([MATES[0].id, MATES[5].id]));
    expect(solvedIn(record, MATES.filter((q) => q.n === 2))).toEqual(new Set());
  });
});
