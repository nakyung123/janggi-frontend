// 끝내기·국면 연습 - 목표 판정, 깬 기록 합치기, 데이터가 앱의 엔진과 맞는지
//
// 데이터(endgames.json)의 국면은 scripts/endgame-data.mjs 가 엔진끼리 끝까지 둬서 골랐다. 그 확인은
// 국면 하나에 몇 분이라 여기서 다시 하지 않는다. 여기서는 앱이 싣는 엔진과 같은 패키지(Node)로
// "그 국면에서 판을 시작할 수 있는지" 를 본다 - 국면이 분석판의 국면 검사를 통과하고, 장군도 끝남도
// 아니고, 둘 차례가 내 쪽이고, 둘 수가 있는지. 엔진 패키지 판이 오르면 이 시험이 어긋남을 잡는다.

import { beforeAll, describe, expect, it } from "vitest";
import { parsePerftMoves } from "../engine/uci";
import { parseFen, toFen } from "./board";
import { setupProblems } from "./editor";
import type { EndgameGoal, EndgamePosition, GoalInput } from "./endgame";
import {
  ENDGAMES,
  NO_CLEARED,
  goalSentence,
  goalShort,
  goalState,
  isClearedRecord,
  mergeCleared,
  mySideOf,
  nextOf,
  positionsOf,
  titleOf,
} from "./endgame";
import { gameStatus, variantRules } from "./status";

const win8: EndgameGoal = { kind: "win", n: 8 };
const hold30: EndgameGoal = { kind: "hold", n: 30 };
const 판정 = (o: Partial<GoalInput>) =>
  goalState({ goal: win8, me: "cho", outcome: null, myMoves: 0, aiMoves: 0, ready: true, ...o });

describe("이기기 판정", () => {
  it("끝나지 않았으면 남은 내 수를 센다", () => {
    expect(판정({ myMoves: 3, aiMoves: 3 })).toEqual({ done: false, left: 5 });
  });

  it("내 n 번째 수로 외통이 되면 이룬다", () => {
    expect(판정({ myMoves: 8, aiMoves: 7, outcome: { kind: "checkmate", winner: "cho" } })).toEqual({
      done: true,
      achieved: true,
      reason: "외통입니다. 8수 만에 이겼습니다.",
    });
  });

  it("내 n 번째 수를 두고도 안 끝나면 못 이룬다. 그 국면의 엔진 답을 받기 전에는 미룬다", () => {
    // 답을 받기 전에는 그 수가 외통인지 모른다 - 이룬 판을 못 이룬 판으로 끝내지 않게.
    expect(판정({ myMoves: 8, aiMoves: 7, ready: false })).toEqual({ done: false, left: 0 });
    expect(판정({ myMoves: 8, aiMoves: 7 })).toEqual({
      done: true,
      achieved: false,
      reason: "8수 안에 외통을 걸지 못했습니다.",
    });
  });

  it("양쪽 한수쉼으로 이겨도 외통이 아니라 못 이룬다", () => {
    const s = 판정({ myMoves: 3, outcome: { kind: "passes", winner: "cho" } });
    expect(s).toMatchObject({ done: true, achieved: false });
    expect(s.done && s.reason).toBe("양쪽 한수쉼 - 초가 이겼습니다. 외통이 아니라 목표를 이루지 못했습니다.");
  });

  it("지거나 비기면 못 이룬다", () => {
    expect(판정({ outcome: { kind: "checkmate", winner: "han" } })).toMatchObject({ done: true, achieved: false, reason: "외통을 당했습니다." });
    expect(판정({ outcome: { kind: "passes", winner: null } })).toMatchObject({ done: true, achieved: false });
  });

  it("한을 잡으면 한의 외통이 이룬 것이다", () => {
    expect(판정({ me: "han", outcome: { kind: "checkmate", winner: "han" }, myMoves: 2 })).toMatchObject({ achieved: true });
    expect(판정({ me: "han", outcome: { kind: "checkmate", winner: "cho" } })).toMatchObject({ achieved: false });
  });
});

describe("버티기 판정", () => {
  const 버티기 = (o: Partial<GoalInput>) => 판정({ goal: hold30, ...o });

  it("AI 의 수를 센다. 내 수는 세지 않는다", () => {
    expect(버티기({ myMoves: 12, aiMoves: 11 })).toEqual({ done: false, left: 19 });
  });

  it("AI 가 n 수를 둘 때까지 지지 않으면 이룬다. 엔진 답을 받기 전에는 미룬다", () => {
    // AI 의 n 번째 수가 외통일 수 있다.
    expect(버티기({ aiMoves: 30, ready: false })).toEqual({ done: false, left: 0 });
    expect(버티기({ aiMoves: 30 })).toEqual({ done: true, achieved: true, reason: "AI의 수 30개를 버텼습니다." });
  });

  it("AI 의 n 번째 수가 외통이면 못 이룬다", () => {
    expect(버티기({ aiMoves: 30, outcome: { kind: "checkmate", winner: "han" } })).toMatchObject({ done: true, achieved: false });
  });

  it("그 전에 비기거나 이겨서 끝나도 이룬다. 점수로 지면 진 것이다", () => {
    expect(버티기({ aiMoves: 5, outcome: { kind: "passes", winner: null } })).toMatchObject({ achieved: true });
    expect(버티기({ aiMoves: 5, outcome: { kind: "checkmate", winner: "cho" } })).toMatchObject({ achieved: true });
    expect(버티기({ aiMoves: 5, outcome: { kind: "passes", winner: "han" } })).toMatchObject({ achieved: false });
  });
});

describe("깬 기록", () => {
  it("모양이 맞을 때만 받는다", () => {
    expect(isClearedRecord({ cleared: ["a1b2c3d4e5"] })).toBe(true);
    expect(isClearedRecord(NO_CLEARED)).toBe(true);
    expect(isClearedRecord(["a1"])).toBe(false);
    expect(isClearedRecord({ cleared: [1] })).toBe(false);
    expect(isClearedRecord(null)).toBe(false);
  });

  it("합칠 때 앞 기록을 지우지 않고 뒤 기록에만 있는 것을 붙인다", () => {
    // 다른 탭이 x 를 남긴 뒤 이 탭이 y 를 남긴다 - 쓰기 직전에 다시 읽은 값(x)에 y 를 합친다.
    const 저장된것 = { cleared: ["x"] };
    expect(mergeCleared(저장된것, { cleared: ["y"] })).toEqual({ cleared: ["x", "y"] });
    expect(mergeCleared(저장된것, { cleared: ["x"] })).toBe(저장된것);
    expect(mergeCleared({ cleared: ["x", "y"] }, { cleared: ["y", "z", "x"] })).toEqual({ cleared: ["x", "y", "z"] });
  });
});

describe("화면 글", () => {
  const 끝내기 = (fen: string, goal = win8): EndgamePosition => ({ id: "t", group: "endgame", variant: "janggimodern", fen, goal, check: null });

  it("제목은 남은 기물, 궁은 적지 않는다", () => {
    expect(titleOf(끝내기("3a1a3/4k4/9/9/9/R8/4P4/9/3K5/9 w - - 0 1"))).toBe("차·졸 대 사·사");
    // 한을 잡으면 한의 기물이 앞에 선다. 한의 졸은 병이다.
    expect(titleOf(끝내기("4k4/4p4/9/9/9/9/9/9/3K5/9 b - - 0 1"))).toBe("병 대 궁");
  });

  it("목표 글", () => {
    expect(goalShort(win8)).toBe("8수 안에 외통");
    expect(goalShort(hold30)).toBe("AI의 수 30개 버티기");
    expect(goalSentence(끝내기("4k4/9/9/9/9/9/9/9/3K5/R8 w - - 0 1"))).toBe("초를 잡고 8수 안에 외통을 거세요.");
    expect(goalSentence(끝내기("4k4/9/9/9/9/9/9/9/3K5/r8 b - - 0 1", hold30))).toBe("한을 잡고 AI의 수 30개를 지지 않고 버티세요.");
  });
});

// --- 데이터와 엔진 ----------------------------------------------------------------------

const nodeModule = (name: string) => import(/* @vite-ignore */ name);

interface Engine {
  probe(fen: string): Promise<{ checkers: string[]; legal: string[] }>;
}

/** mate.test.ts 와 같은 방식으로 앱의 엔진 패키지를 Node 에서 띄운다(끝에 quit 을 보내지 않는다). */
async function openEngine(variant: string): Promise<Engine> {
  const { createRequire } = await nodeModule("node:module");
  const { readFile } = await nodeModule("node:fs/promises");
  const Stockfish = createRequire(import.meta.url)("fairy-stockfish-nnue.wasm/stockfish.js");
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
  engine.postMessage("setoption name UCI_Variant value " + variant);
  return {
    async probe(fen) {
      engine.postMessage(`position fen ${fen}`);
      const dump = await ask("d", (l) => l.startsWith("Checkers:"));
      const checkers = dump.find((l) => l.startsWith("Checkers:"))!.slice(9).trim().split(/\s+/).filter(Boolean);
      const legal = parsePerftMoves(await ask("go perft 1", (l) => l.startsWith("Nodes searched")));
      return { checkers, legal };
    },
  };
}

/** 국면 id 를 다시 계산한다(scripts/endgame-data.mjs 와 같은 값이어야 한다). */
async function idOf(p: EndgamePosition): Promise<string> {
  const text = new TextEncoder().encode([p.fen.split(" ").slice(0, 2).join(" "), p.variant, p.goal.kind, p.goal.n].join("|"));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", text));
  return [...hash].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10);
}

const isPass = (m: string) => m.slice(0, m.length / 2) === m.slice(m.length / 2);

/** 상대 궁을 뺀 국면. */
function withoutKing(fen: string): string {
  const pos = parseFen(fen);
  const theirs = pos.turn === "cho" ? "k" : "K";
  const board = Object.fromEntries(Object.entries(pos.board).filter(([, c]) => c !== theirs));
  return toFen({ ...pos, board });
}

/** 데이터를 엔진과 맞춰 본다. 어긋난 곳을 말로 돌려준다. 망가뜨린 사본도 같은 함수로 넣어 본다. */
async function problemsOf(list: readonly EndgamePosition[], engine: Engine): Promise<string[]> {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of list) {
    const where = `${p.group} ${p.id}`;
    const position = parseFen(p.fen);
    if (p.variant !== "janggimodern") problems.push(`${where}: 규칙이 현대가 아님(${p.variant})`);
    if (setupProblems(position).length) problems.push(`${where}: 국면 검사 ${setupProblems(position).join(" ")}`);
    if (!(p.goal.n > 0)) problems.push(`${where}: 목표 수가 ${p.goal.n}`);
    if (p.id !== (await idOf(p))) problems.push(`${where}: id 가 국면·규칙·목표로 계산한 값과 다름`);
    if (ids.has(p.id)) problems.push(`${where}: id 겹침`);
    ids.add(p.id);
    const got = await engine.probe(p.fen);
    if (got.checkers.length) problems.push(`${where}: 시작 국면이 장군`);
    if (got.legal.filter((m) => !isPass(m)).length === 0) problems.push(`${where}: 둘 수가 없음`);
    const status = gameStatus({ position, legal: new Set(got.legal), checkers: got.checkers, ready: true, plies: 0, ...variantRules(p.variant), passesInRow: 0 });
    if (status.kind !== "playing") problems.push(`${where}: 시작 국면 판정이 ${status.kind}`);
    if (mySideOf(p) !== position.turn) problems.push(`${where}: 둘 차례가 내 쪽이 아님`);
  }
  return problems;
}

describe("데이터", () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await openEngine("janggimodern");
  });

  it("끝내기 10개 · 국면 연습 6개, 쉬운 것부터", () => {
    expect(positionsOf("endgame")).toHaveLength(10);
    expect(positionsOf("middle")).toHaveLength(6);
    expect(nextOf(positionsOf("middle")[5])).toBeNull();
    expect(nextOf(positionsOf("endgame")[0])).toBe(positionsOf("endgame")[1]);
  });

  it("모든 국면이 앱의 엔진에서 시작할 수 있는 국면이다", async () => {
    expect(await problemsOf(ENDGAMES, engine)).toEqual([]);
  }, 30_000);

  it("검사가 실제로 잡는다 - 망가뜨린 사본", async () => {
    const first = ENDGAMES[0];
    const broken: EndgamePosition[] = [
      // 둘 차례를 바꾸면 id 가 어긋난다. 상대 궁이 장군을 받는 국면이면 국면 검사에도 걸린다.
      { ...first, fen: first.fen.replace(/ ([wb]) /, (_, t: string) => ` ${t === "w" ? "b" : "w"} `) },
      // 궁을 빼면 국면 검사에 걸린다.
      { ...first, fen: withoutKing(first.fen) },
      { ...first, goal: { ...first.goal, n: first.goal.n + 1 } },
    ];
    const found = await problemsOf(broken, engine);
    expect(found.some((p) => p.includes("id"))).toBe(true);
    expect(found.some((p) => p.includes("국면 검사"))).toBe(true);
  }, 30_000);
});
