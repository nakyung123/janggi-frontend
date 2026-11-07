// 포진 - 모양 만드는 수가 앱의 엔진에서 둘 수 있는 수이고, 끝 국면이 그 포진 모양인지
//
// 포진 화면은 엔진 없이 데이터(openings.ts)의 수를 판에 둔다. 그 수가 엔진에서 둘 수 없는 수이거나
// 끝 국면이 포진 모양이 아니면 화면이 틀린 것을 가르친다. 그래서 앱이 싣는 엔진과 같은 패키지
// (node_modules/fairy-stockfish-nnue.wasm)를 띄워 세 규칙에서 수마다 다시 묻는다. 묻는 명령(d,
// go perft 1)과 합법수를 읽는 함수(engine/uci.ts)도 앱과 같다. 외통 문제 시험(mate.test.ts)과 같은
// 길이다.
//
// 포진 모양은 데이터가 아니라 이 파일에 따로 적는다(SHAPES). 데이터에 같이 적으면 데이터가 틀릴 때
// 모양도 같이 틀려 잡지 못한다. 정의는 대한장기협회 장기 용어의 포진 뜻과 조사 세션의 정의를 따른다.
//
// 수순이 가장 짧은지는 보지 않는다. 화면도 "가장 짧은" 이라고 말하지 않는다.

import { beforeAll, describe, expect, it } from "vitest";
import { parsePerftMoves } from "../engine/uci";
import type { Board, Position } from "./board";
import { toFen } from "./board";
import type { Opening, OpeningId } from "./openings";
import { OPENINGS, passOf, positionAt, startOf } from "./openings";
import { SETUPS, detectSetup } from "./setups";

// --- 엔진 ------------------------------------------------------------------------

const VARIANTS = ["janggi", "janggimodern", "janggitraditional"] as const;

/*
 * Node 모듈은 이름을 변수로 넘겨 불러온다. 앱 코드는 브라우저에서 돌아서 tsconfig 에 Node 타입이
 * 없다(types: vite/client). 받은 값은 타입 검사를 받지 않는다. mate.test.ts 와 같은 코드다.
 */
const nodeModule = (name: string) => import(/* @vite-ignore */ name);

interface Probe {
  /** 엔진이 해석한 FEN 의 판 칸 */
  board: string;
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
  // .wasm 은 직접 읽어 넘긴다. 엔진이 fetch 로 받으려 하면 Node 에서는 파일 경로를 못 읽는다.
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
    async probe(fen, moves) {
      engine.postMessage(`position fen ${fen}${moves.length ? " moves " + moves.join(" ") : ""}`);
      const dump = await ask("d", (l) => l.startsWith("Checkers:"));
      const board = dump.find((l) => l.startsWith("Fen:"))!.slice(4).trim().split(" ")[0];
      const legal = parsePerftMoves(await ask("go perft 1", (l) => l.startsWith("Nodes searched")));
      return { board, legal };
    },
  };
}

// --- 포진 모양(초 기준) ----------------------------------------------------------

/*
 * 자리는 엔진 칸이다. 앱 기보 번호로는 d3 = 84, f3 = 86, e3 = 85, e4 = 75, e5 = 65, c3 = 83, g3 = 87.
 *   귀마   마 하나가 궁성 귀(84 또는 86). 협회: "마 하나만을 궁성의 귀 자리에".
 *   원앙마 마 하나가 75, 다른 마가 83 또는 87 에서 그 마를 지킨다(84·86 이 비어야 75 로 간다).
 *   면상   상이 궁성 면(85).
 *   양귀마 마 둘이 84·86, 가운데 졸이 65 로 한 칸 올라 75 가 빈다.
 *   양귀상 상 둘이 84·86.
 */
const SHAPES: Record<OpeningId, (b: Board) => boolean> = {
  gwima: (b) => b.d3 === "N" || b.f3 === "N",
  wonang: (b) => b.e4 === "N" && ((b.c3 === "N" && !b.d3) || (b.g3 === "N" && !b.f3)),
  myeonsang: (b) => b.e3 === "B",
  yanggwima: (b) => b.d3 === "N" && b.f3 === "N" && b.e5 === "P" && !b.e4,
  yanggwisang: (b) => b.d3 === "B" && b.f3 === "B",
};

const boardOf = (pos: Position) => toFen(pos).split(" ")[0];

/**
 * 포진 데이터를 엔진과 맞춰 본다. 어긋난 곳을 말로 돌려준다(없으면 빈 배열).
 * 일부러 망가뜨린 사본도 같은 함수로 넣어 본다 - 검사가 실제로 무언가를 잡는지 보려고.
 */
async function problemsOf(list: readonly Opening[], engine: Engine): Promise<string[]> {
  const problems: string[] = [];
  for (const o of list) {
    if (o.lines.length === 0) problems.push(`${o.name}: 수순이 없음`);
    // 화면의 "~에서 n수에 됩니다" 는 한 포진 안의 수순 길이가 모두 같아야 맞다.
    if (new Set(o.lines.map((l) => l.moves.length)).size > 1) problems.push(`${o.name}: 차림마다 수가 다름`);
    for (const line of o.lines) {
      const where = `${o.name}(${line.setup})`;
      if (!SETUPS.some((s) => s.name === line.setup)) {
        problems.push(`${where}: 없는 차림`);
        continue;
      }
      const fen = toFen(startOf(line));
      for (const v of VARIANTS) {
        engine.variant(v);
        const played: string[] = [];
        for (let step = 0; step < line.moves.length; step++) {
          const at = `${where} ${v} ${step + 1}째 수`;
          const before = await engine.probe(fen, played);
          if (before.board !== boardOf(positionAt(line, step))) problems.push(`${at} 앞: 판이 엔진과 다름`);
          if (!before.legal.includes(line.moves[step])) {
            problems.push(`${at}: ${line.moves[step]} 는 합법수가 아님`);
            break;
          }
          played.push(line.moves[step]);
          const pass = passOf(positionAt(line, step), "han");
          if (!(await engine.probe(fen, played)).legal.includes(pass)) {
            problems.push(`${at} 뒤: 한의 한수쉼이 합법수가 아님`);
            break;
          }
          played.push(pass);
        }
        if (played.length !== line.moves.length * 2) continue;
        const end = await engine.probe(fen, played);
        const last = positionAt(line, line.moves.length);
        if (end.board !== boardOf(last)) problems.push(`${where} ${v}: 끝 판이 엔진과 다름`);
        if (!SHAPES[o.id](last.board)) problems.push(`${where} ${v}: 끝 국면이 ${o.name} 모양이 아님`);
      }
    }
  }
  return problems;
}

/** 판의 at 에 한 병을 놓았을 때 초가 그 자리로 갈 수 있는 수(= 그 자리를 지키는 초 기물의 수). */
async function guardsOf(engine: Engine, pos: Position, at: string): Promise<string[]> {
  engine.variant("janggi");
  const fen = toFen({ ...pos, board: { ...pos.board, [at]: "p" }, turn: "cho" });
  return (await engine.probe(fen, [])).legal.filter((m) => m.slice(2) === at).sort();
}

const lineOf = (id: OpeningId, setup?: string) => {
  const o = OPENINGS.find((x) => x.id === id)!;
  return setup ? o.lines.find((l) => l.setup === setup)! : o.lines[0];
};

const clone = () => structuredClone(OPENINGS) as Opening[];

describe("데이터 - 처음 판", () => {
  // 화면 판과 엔진에 넘기는 FEN 이 둘 다 startOf 에서 나와서, 위 엔진 시험은 한의 차림이 틀려도 잡지 못한다.
  it("수순마다 처음 판의 초와 한이 둘 다 그 차림이다(한의 차림은 초와 같다)", () => {
    for (const o of OPENINGS) {
      for (const line of o.lines) {
        const { board } = startOf(line);
        expect([o.name, detectSetup(board, "cho")?.name, detectSetup(board, "han")?.name]).toEqual([
          o.name,
          line.setup,
          line.setup,
        ]);
      }
    }
  });
});

describe("데이터 - 앱의 엔진과 같다(세 규칙)", () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await openEngine();
  }, 30_000);

  it("포진 다섯, 수순 여덟 - 모든 수가 합법이고 한의 한수쉼도 합법이며, 끝 국면이 그 포진 모양이다", async () => {
    expect(OPENINGS.map((o) => [o.name, o.lines.map((l) => `${l.setup} ${l.moves.length}`)])).toEqual([
      ["귀마", ["마상마상 1", "상마상마 1"]],
      ["원앙마", ["마상상마 4"]],
      ["면상", ["상마마상 2", "마상마상 2", "상마상마 2"]],
      ["양귀마", ["상마마상 3"]],
      ["양귀상", ["마상상마 5"]],
    ]);
    expect(await problemsOf(OPENINGS, engine)).toEqual([]);
  }, 60_000);

  // 검사가 실제로 잡는지. 수순 하나씩을 망가뜨린 사본을 넣어 본다.
  it("망가뜨린 사본 1 - 면상에서 상을 먼저 두면 합법수가 아니라고 잡는다", async () => {
    const list = clone().filter((o) => o.id === "myeonsang");
    const line = list[0].lines.find((l) => l.setup === "상마상마")!;
    line.moves = [line.moves[1], line.moves[0]];
    expect(await problemsOf(list, engine)).toEqual(
      VARIANTS.map((v) => `면상(상마상마) ${v} 1째 수: b1e3 는 합법수가 아님`)
    );
  }, 30_000);

  it("망가뜨린 사본 2 - 원앙마 마지막 수를 지우면 끝 국면이 모양이 아니라고 잡는다", async () => {
    const list = clone().filter((o) => o.id === "wonang");
    list[0].lines[0].moves.pop();
    expect(await problemsOf(list, engine)).toEqual(
      VARIANTS.map((v) => `원앙마(마상상마) ${v}: 끝 국면이 원앙마 모양이 아님`)
    );
  }, 30_000);

  it("망가뜨린 사본 3 - 양귀마의 둘째 마 수를 다른 합법수(차)로 바꾸면 모양이 아니라고 잡는다", async () => {
    const list = clone().filter((o) => o.id === "yanggwima");
    list[0].lines[0].moves[1] = "i1i2";
    expect(await problemsOf(list, engine)).toEqual(
      VARIANTS.map((v) => `양귀마(상마마상) ${v}: 끝 국면이 양귀마 모양이 아님`)
    );
  }, 30_000);

  it("망가뜨린 사본 4 - 양귀상에서 상을 먼저 두면 합법수가 아니라고 잡는다(사·궁이 길을 막고 있다)", async () => {
    const list = clone().filter((o) => o.id === "yanggwisang");
    const moves = list[0].lines[0].moves;
    list[0].lines[0].moves = [moves[3], ...moves.slice(0, 3), moves[4]];
    expect(await problemsOf(list, engine)).toEqual(
      VARIANTS.map((v) => `양귀상(마상상마) ${v} 1째 수: c1f3 는 합법수가 아님`)
    );
  }, 30_000);

  // --- 화면 문장 중 엔진으로 따질 수 있는 것 ---------------------------------------

  it("원앙마 끝 국면 - 다른 마(87)가 75 의 마를 지킨다", async () => {
    const line = lineOf("wonang");
    expect(await guardsOf(engine, positionAt(line, line.moves.length), "e4")).toContain("g3e4");
  }, 30_000);

  it("양귀마 - 처음 판에서 75 의 졸을 지키는 기물이 없고, 끝 국면에서 65 의 졸은 귀에 선 두 마가 지킨다", async () => {
    const line = lineOf("yanggwima");
    expect(await guardsOf(engine, startOf(line), "e4")).toEqual([]);
    expect(await guardsOf(engine, positionAt(line, line.moves.length), "e5")).toEqual(["d3e5", "f3e5"]);
  }, 30_000);

  /*
   * 읽을거리 글 1(상차림 넷은 무엇이 다른가요)의 사실. 처음 판에서 본다.
   *   안쪽 마는 한 수에 귀(84 = d3, 86 = f3)로 간다.
   *   75(e4) 의 졸을 지키는 초 기물은 안쪽 상뿐이다.
   *   안쪽 상은 처음에 움직일 길이 없고, 바깥 상은 74(d4)·76(f4) 으로 나간다.
   */
  it.each([
    ["마상상마", [], ["c1e4", "g1e4"], []],
    ["상마마상", ["c1d3", "g1f3"], [], ["b1d4", "h1f4"]],
    ["마상마상", ["g1f3"], ["c1e4"], ["h1f4"]],
    ["상마상마", ["c1d3"], ["g1e4"], ["b1d4"]],
  ])("읽을거리 글 1 - %s: 귀로 가는 마 %j, 75 를 지키는 수 %j, 바깥 상의 수 %j", async (setup, gwi, guard75, outer) => {
    const start = startOf({ setup, moves: [] });
    engine.variant("janggi");
    const legal = (await engine.probe(toFen(start), [])).legal;
    const from = (m: string) => start.board[m.slice(0, 2)];
    expect(legal.filter((m) => from(m) === "N" && ["d3", "f3"].includes(m.slice(2))).sort()).toEqual(gwi);
    expect(await guardsOf(engine, start, "e4")).toEqual(guard75);
    // 바깥 상 = b1·h1 에 선 상, 안쪽 상 = c1·g1 에 선 상. 안쪽 상은 처음에 둘 수 있는 수가 없다.
    const outerOrInner = (squares: string[]) => legal.filter((m) => from(m) === "B" && squares.includes(m.slice(0, 2)));
    expect(outerOrInner(["b1", "h1"]).sort()).toEqual(outer);
    expect(outerOrInner(["c1", "g1"])).toEqual([]);
  }, 30_000);
});
