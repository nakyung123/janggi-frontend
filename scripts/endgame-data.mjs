// 끝내기·국면 연습 데이터 만들기 - 후보 국면을 만들고, 엔진끼리 끝까지 둬서 목표를 이룬 것만 담는다
//
//   node scripts/endgame-data.mjs [--workers 4] [--hours 5] [--dry] [--endgame-budget 80] [--middle-games 150]
//
// 쓰는 곳: src/janggi/endgames.json. 손으로 고치지 않고 이 스크립트로 다시 만든다. 출력(무엇을 해 봤고
// 왜 떨어졌는지)은 표준 출력으로 나온다 - 돌릴 때 파일로 받아 입력·엔진 판과 같이 남긴다.
//
// 국면은 책·사이트에서 옮기지 않는다.
//   끝내기     아래 SETS 의 기물 조합을 시드로 판에 놓는다(궁·사는 궁성 안, 졸은 처음 줄보다 앞,
//              두 궁이 마주 보지 않음, 장군을 받는 쪽이 없음).
//   국면 연습  엔진끼리 둔 판(양쪽 세기를 판마다 다르게)의 30~80수에서 둘 차례 쪽이 분명히 앞선
//              국면(깊은 평가 +300~+700, 외통 값 아님)을 뽑는다. 엔진의 Skill 난수는 엔진이 정해
//              같은 시드로 같은 판이 나오지 않는다 - 그래서 뽑은 판의 시작 국면과 수순을 데이터에 적는다.
//
// 넣는 기준(docs/report-endgame.md "승인받은 설계"):
//   1. 깊은 평가(200만 노드)로 거른다.
//   2. 엔진끼리 끝까지 세 판. 내 쪽은 Skill 20·100만 노드, AI 쪽은 앱과 같은 Skill 20 에 20만·30만·
//      50만 노드(앱은 30만이고, 브라우저의 스레드 넷 엔진은 같은 노드에서도 다른 수를 둘 수 있어
//      둘레를 같이 본다). 세 판 모두 목표를 이뤄야 넣는다.
//      - 이기기는 외통으로 끝난 판만 이룬 것으로 센다. 엔진은 양쪽 한수쉼 점수승도 같은 "이긴 값" 으로
//        보고 그쪽으로 끝내기도 해서(설계 5절 실험), 엔진을 외통으로 몰 수 없다. 끝난 모양으로 거른다.
//      - 버티기는 AI 가 HOLD_MOVES 수를 둘 때까지 내가 지지 않으면 이룬다.
//   3. 이기기의 목표 수 N = 세 판 가운데 가장 오래 걸린 판의 내 수 × 1.5, 올림. 100 을 넘지 않는다 - 현대
//      규칙은 양쪽 합 200수에서 점수로 끝나서, 내 쪽(먼저 둔다)은 100수까지만 둔다.
//
//   node scripts/endgame-data.mjs --reuse   이미 쓴 데이터의 확인 결과(check.games)로 N 과 id 만 다시
//                                           계산한다. 엔진을 돌리지 않는다. N 을 정하는 규칙만 바꿀 때 쓴다.
//
// 엔진은 앱이 싣는 것과 같은 패키지(node_modules/fairy-stockfish-nnue.wasm - fetch-engine.mjs 가
// public/engine 으로 복사한다)에 신경망을 물려 스레드 하나로 돌린다. 노드로 자르고 스레드가 하나라
// Skill 20 끼리의 판은 다시 돌려도 같다(국면 연습의 후보를 뽑는 자가 대국만 다르다).

import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const PKG_DIR = join(ROOT, "node_modules", "fairy-stockfish-nnue.wasm");
const NNUE = join(ROOT, "public", "engine", "janggi-9991472750de.nnue.gz.bin");
const OUT = join(ROOT, "src", "janggi", "endgames.json");

/** 이번 국면은 모두 현대 규칙(빅장 없음)이다. 까닭은 설계 5절. */
const VARIANT = "janggimodern";
const ME_NODES = 1_000_000;
const AI_NODES = [300_000, 200_000, 500_000]; // 앱과 같은 30만을 먼저 둔다 - 떨어질 국면이 가장 빨리 떨어진다
const EVAL_NODES = 2_000_000;
const HOLD_MOVES = 30;
/** 내 쪽이 둘 수 있는 가장 많은 수. 현대 규칙은 양쪽 합 200수(status.ts 의 MOVE_LIMIT)에서 점수로 끝난다. */
const MAX_MY_MOVES = 100;

/** 이기기의 목표 수 N. 세 판 가운데 가장 오래 걸린 판의 내 수 × 1.5 올림, 많아야 MAX_MY_MOVES. */
const winN = (games) => Math.min(MAX_MY_MOVES, Math.ceil(Math.max(...games.map((g) => g.myMoves)) * 1.5));

/** 국면 + 규칙 + 목표의 SHA-256 앞 10자리. src/janggi/endgame.test.ts 가 같은 식으로 다시 본다. */
const idOf = (fen, variant, goal) =>
  createHash("sha256")
    .update([fen.split(" ").slice(0, 2).join(" "), variant, goal.kind, goal.n].join("|"))
    .digest("hex")
    .slice(0, 10);
/** 이기기 후보를 끝까지 두는 한도(내 수). 끝내기는 짧고, 국면 연습은 길다. */
const WIN_CAP = { endgame: 50, middle: 80 };
const TARGET = { endgame: { win: 8, hold: 2 }, middle: { win: 6, hold: 0 } };
/** 한 기물 조합에서 많아야 몇 개 넣나. 같은 조합이 목록을 채우지 않게. */
const PER_SET = 2;

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (next !== undefined && !next.startsWith("--")) args.set(a.slice(2), next), i++;
  else args.set(a.slice(2), true);
}

// --- 엔진 ------------------------------------------------------------------------

async function openEngine() {
  const require = createRequire(import.meta.url);
  const Stockfish = require(join(PKG_DIR, "stockfish.js"));
  const engine = await Stockfish({ wasmBinary: new Uint8Array(await readFile(join(PKG_DIR, "stockfish.wasm"))) });
  const waiters = [];
  engine.addMessageListener((line) => {
    for (const w of waiters.slice()) {
      w.lines.push(line);
      if (w.done(line)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(w.lines);
      }
    }
  });
  const send = (cmd) => engine.postMessage(cmd);
  const ask = (cmd, done) =>
    new Promise((resolve) => {
      waiters.push({ lines: [], done, resolve });
      send(cmd);
    });
  const ready = () => ask("isready", (l) => l === "readyok");

  await ask("uci", (l) => l === "uciok");
  send("setoption name UCI_Variant value " + VARIANT);
  engine.FS.writeFile("/nn.nnue", new Uint8Array(gunzipSync(await readFile(NNUE))));
  send("setoption name EvalFile value /nn.nnue");
  send("setoption name Threads value 1");
  send("setoption name Hash value 32");
  await ready();

  const position = (fen, moves) => send(`position fen ${fen}${moves.length ? " moves " + moves.join(" ") : ""}`);

  return {
    ready,
    send,
    async skill(n) {
      send("setoption name Skill Level value " + n);
      await ready();
    },
    /** 합법수와 장군. 앱(src/engine/engine.ts 의 probe)과 같은 두 명령. */
    async probe(fen, moves = []) {
      position(fen, moves);
      const dump = await ask("d", (l) => l.startsWith("Checkers:"));
      const checkers = dump.find((l) => l.startsWith("Checkers:")).slice(9).trim();
      const out = await ask("go perft 1", (l) => l.startsWith("Nodes searched"));
      const legal = [];
      for (const l of out) {
        const m = l.match(/^([a-i](?:10|[1-9])[a-i](?:10|[1-9])):\s*\d+$/);
        if (m) legal.push(m[1]);
      }
      return { legal, inCheck: checkers.length > 0 };
    },
    /** 탐색. 마지막 줄의 점수(둘 차례 쪽에서 본 값)와 둘 수. */
    async go(fen, moves, nodes) {
      position(fen, moves);
      const out = await ask(`go nodes ${nodes}`, (l) => l.startsWith("bestmove"));
      let score = null;
      for (const l of out) {
        if (!l.startsWith("info") || !l.includes(" pv ") || / (lower|upper)bound/.test(l)) continue;
        const cp = l.match(/score cp (-?\d+)/);
        const mate = l.match(/score mate (-?\d+)/);
        score = mate ? { mate: Number(mate[1]) } : cp ? { cp: Number(cp[1]) } : score;
      }
      return { best: out.find((l) => l.startsWith("bestmove")).split(" ")[1], score };
    },
  };
}

const isPass = (m) => m.slice(0, m.length / 2) === m.slice(m.length / 2);
const scoreText = (s) => (!s ? "?" : "mate" in s ? `mate ${s.mate}` : `cp ${s.cp}`);

// --- 판 ------------------------------------------------------------------------

const FILES = "abcdefghi";
const sq = (f, r) => FILES[f] + r;
const PALACE = {
  cho: [3, 4, 5].flatMap((f) => [1, 2, 3].map((r) => sq(f, r))),
  han: [3, 4, 5].flatMap((f) => [8, 9, 10].map((r) => sq(f, r))),
};
const ALL = [...FILES].flatMap((_, f) => Array.from({ length: 10 }, (_, i) => sq(f, i + 1)));

function toFen(board, turn) {
  const rows = [];
  for (let r = 10; r >= 1; r--) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 9; f++) {
      const p = board[sq(f, r)];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        row += p;
        empty = 0;
      }
    }
    rows.push(row + (empty ? empty : ""));
  }
  return `${rows.join("/")} ${turn === "cho" ? "w" : "b"} - - 0 1`;
}

/** 두 궁이 한 줄에서 사이에 아무것도 없이 마주 보는지. 현대는 빅장이 없지만, 보기에 헷갈리는 자리라 뺀다. */
function facing(board) {
  const k = Object.entries(board).find(([, p]) => p === "K")?.[0];
  const kk = Object.entries(board).find(([, p]) => p === "k")?.[0];
  if (!k || !kk || k[0] !== kk[0]) return false;
  const a = Number(k.slice(1));
  const b = Number(kk.slice(1));
  for (let r = Math.min(a, b) + 1; r < Math.max(a, b); r++) if (board[k[0] + r]) return false;
  return true;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * 끝내기의 기물 조합. me 는 내 쪽(궁 밖), them 은 상대(궁 밖). 기물 글자는 엔진 표기(r 차, c 포, n 마,
 * b 상, a 사, p 졸). goal 이 hold 면 내가 지키는 쪽이다. 외통으로 끝나기 쉬운 조합(기물이 둘 이상)을
 * 많이 넣었다 - 설계 실험에서 차 하나·포마는 외통이 아니라 점수승으로 끝났다.
 */
const SETS = [
  { goal: "win", me: "rp", them: "aa" },
  { goal: "win", me: "rc", them: "aa" },
  { goal: "win", me: "rn", them: "aa" },
  { goal: "win", me: "rb", them: "aa" },
  { goal: "win", me: "rp", them: "a" },
  { goal: "win", me: "rn", them: "a" },
  { goal: "win", me: "rc", them: "ab" },
  { goal: "win", me: "rr", them: "aab" },
  { goal: "win", me: "cnp", them: "a" },
  { goal: "win", me: "npp", them: "a" },
  { goal: "win", me: "ppp", them: "" },
  { goal: "win", me: "cp", them: "" },
  { goal: "win", me: "rpp", them: "aab" },
  { goal: "hold", me: "aa", them: "r" },
  { goal: "hold", me: "aab", them: "cn" },
  { goal: "hold", me: "ab", them: "rp" },
];

/** 조합 하나를 시드로 판에 놓는다. 못 놓으면(자리가 겹침) null. */
function place(set, seed) {
  const rand = rng(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const me = seed % 2 === 0 ? "cho" : "han";
  const them = me === "cho" ? "han" : "cho";
  const board = {};
  const put = (side, type) => {
    const ch = side === "cho" ? type.toUpperCase() : type;
    let spots;
    if (type === "k" || type === "a") spots = PALACE[side];
    else if (type === "p") {
      // 졸은 처음 줄(초 4단, 한 7단)보다 뒤로 가지 못한다. 끝내기다운 자리로 처음 줄 앞쪽에 둔다.
      spots = ALL.filter((s) => {
        const r = Number(s.slice(1));
        return side === "cho" ? r >= 5 && r <= 9 : r >= 2 && r <= 6;
      });
    } else spots = ALL;
    spots = spots.filter((s) => !board[s]);
    if (!spots.length) return false;
    board[pick(spots)] = ch;
    return true;
  };
  if (!put(me, "k") || !put(them, "k")) return null;
  for (const t of set.them) if (!put(them, t)) return null;
  for (const t of set.me) if (!put(me, t)) return null;
  if (facing(board)) return null;
  return { me, fen: toFen(board, me) };
}

const flipTurn = (fen) => fen.replace(/ ([wb]) /, (_, t) => ` ${t === "w" ? "b" : "w"} `);

// --- 끝까지 두기 -------------------------------------------------------------------

/**
 * 국면에서 끝까지 둔다. 내 쪽은 ME_NODES, AI 쪽은 aiNodes. 둘 다 Skill 20.
 * 돌려주는 것: end(checkmate | other | cap), loser(외통이면 진 쪽: me | ai), myMoves, aiMoves, moves.
 */
async function playOut(e, fen, meIsToMove, aiNodes, stop) {
  await e.skill(20);
  e.send("ucinewgame");
  await e.ready();
  const moves = [];
  let myMoves = 0;
  let aiMoves = 0;
  for (;;) {
    const mine = (moves.length % 2 === 0) === meIsToMove;
    const p = await e.probe(fen, moves);
    if (p.legal.length === 0) {
      // 앱의 판정(status.ts)과 같다: 장군이면 외통, 아니면 규칙으로 끝남(현대는 양쪽 한수쉼)
      if (p.inCheck) return { end: "checkmate", loser: mine ? "me" : "ai", myMoves, aiMoves, moves };
      return { end: "other", lastPass: isPass(moves[moves.length - 1] ?? "a1b1"), myMoves, aiMoves, moves };
    }
    if (stop(myMoves, aiMoves, mine)) return { end: "cap", myMoves, aiMoves, moves };
    const r = await e.go(fen, moves, mine ? ME_NODES : aiNodes);
    if (!r.best || r.best === "(none)") return { end: "other", myMoves, aiMoves, moves };
    moves.push(r.best);
    if (mine) myMoves++;
    else aiMoves++;
  }
}

/** 후보 하나를 확인한다. 떨어지면 reason 을 단다. */
/**
 * 장군을 받는 쪽이 있으면 시작 국면으로 쓰지 않는다(분석판의 setupProblems 와 같은 뜻 - 둘 차례가
 * 아닌 쪽이 장군을 받으면 엔진이 궁을 잡는 수를 낸다. 둘 차례가 장군을 받는 것도 시작으로는 헷갈린다).
 */
async function startable(e, fen) {
  const here = await e.probe(fen);
  if (here.inCheck) return false;
  if (here.legal.filter((m) => !isPass(m)).length === 0) return false;
  return !(await e.probe(flipTurn(fen))).inCheck;
}

async function verify(e, cand0) {
  const meIsToMove = true; // 모든 국면은 내 차례로 시작한다
  const t0 = Date.now();
  // 끝내기는 못 쓰는 자리면 같은 조합을 정해진 다른 시드로 다시 놓는다(많아야 20번).
  let cand = cand0;
  for (let k = 1; !(await startable(e, cand.fen)); k++) {
    const again = cand0.setDef && k <= 20 ? place(cand0.setDef, cand0.seed + 100_000 * k) : null;
    if (!cand0.setDef || k > 20) return { ...cand, ok: false, reason: "시작할 수 없는 국면" };
    if (again) cand = { ...cand0, ...again, seed: cand0.seed + 100_000 * k };
  }

  await e.skill(20);
  e.send("ucinewgame");
  const ev = await e.go(cand.fen, [], EVAL_NODES);
  const s = ev.score ?? {};
  const evalText = scoreText(ev.score);
  if (cand.goal === "win") {
    const good =
      cand.group === "endgame" ? ("mate" in s ? s.mate > 0 : s.cp >= 500) : !("mate" in s) && s.cp >= 300 && s.cp <= 700;
    if (!good) return { ...cand, ok: false, reason: `평가 ${evalText}`, eval: evalText };
  } else if ("mate" in s ? s.mate < 0 : s.cp < -300) {
    return { ...cand, ok: false, reason: `평가 ${evalText}`, eval: evalText };
  }

  const games = [];
  for (const aiNodes of AI_NODES) {
    if (cand.goal === "win") {
      const cap = WIN_CAP[cand.group];
      const g = await playOut(e, cand.fen, meIsToMove, aiNodes, (my, _ai, mine) => mine && my >= cap);
      games.push({ aiNodes, end: g.end, myMoves: g.myMoves, aiMoves: g.aiMoves });
      if (!(g.end === "checkmate" && g.loser === "ai")) {
        return { ...cand, ok: false, reason: `AI ${aiNodes / 1000}k: ${g.end}${g.loser ? "(" + g.loser + " 짐)" : ""} ${g.myMoves}수`, eval: evalText, games, sec: (Date.now() - t0) / 1000 };
      }
    } else {
      const g = await playOut(e, cand.fen, meIsToMove, aiNodes, (_my, ai) => ai >= HOLD_MOVES);
      games.push({ aiNodes, end: g.end, myMoves: g.myMoves, aiMoves: g.aiMoves });
      const lost = (g.end === "checkmate" && g.loser === "me") || (g.end === "other" && g.aiMoves < HOLD_MOVES);
      if (lost) {
        return { ...cand, ok: false, reason: `AI ${aiNodes / 1000}k: ${g.end} AI ${g.aiMoves}수`, eval: evalText, games, sec: (Date.now() - t0) / 1000 };
      }
    }
  }
  const n = cand.goal === "win" ? winN(games) : HOLD_MOVES;
  return { ...cand, ok: true, eval: evalText, games, n, sec: (Date.now() - t0) / 1000 };
}

/**
 * 국면 연습 후보 하나: 엔진끼리 한 판을 두다 30~80수 사이에서 둘 차례 쪽이 분명히 앞선 국면을 뽑는다.
 * 양쪽 세기를 판마다 다르게 해야 한쪽이 앞서는 판이 나온다(외통 문제 조사의 gen.mjs 와 같은 방식).
 */
async function selfplay(e, seed) {
  const rand = rng(seed);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const back = (l, r, upper) => {
    const s = "r" + (l ? "nb" : "bn") + "a1a" + (r ? "bn" : "nb") + "r";
    return upper ? s.toUpperCase() : s;
  };
  const start = `${back(rand() < 0.5, rand() < 0.5, false)}/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/${back(rand() < 0.5, rand() < 0.5, true)} w - - 0 1`;
  const skill = [Math.floor(rand() * 12), Math.floor(rand() * 12)];
  const nodes = [20_000 + Math.floor(rand() * 40_000), 20_000 + Math.floor(rand() * 40_000)];
  const randomPlies = 2 + Math.floor(rand() * 5);
  e.send("ucinewgame");
  const moves = [];
  for (let ply = 0; ply < 80; ply++) {
    const p = await e.probe(start, moves);
    const real = p.legal.filter((m) => !isPass(m));
    if (real.length === 0) return null;
    if (ply < randomPlies) {
      moves.push(pick(real));
      continue;
    }
    await e.skill(skill[ply % 2]);
    const r = await e.go(start, moves, nodes[ply % 2]);
    const s = r.score;
    if (ply >= 30 && !p.inCheck && s && "cp" in s && s.cp >= 300 && s.cp <= 700) {
      return { start, moves: [...moves], skill, nodes, ply };
    }
    if (!r.best || r.best === "(none)") return null;
    moves.push(r.best);
  }
  return null;
}

// --- 일꾼 ------------------------------------------------------------------------

if (args.has("reuse")) {
  await reuse();
} else if (args.has("worker")) {
  const e = await openEngine();
  process.on("message", async (job) => {
    try {
      if (job.type === "verify") process.send({ id: job.id, result: await verify(e, job.cand) });
      else {
        const found = await selfplay(e, job.seed);
        // 수 세기는 처음으로 돌린다 - 연습은 그 국면에서 새로 시작한다(200수 셈도 처음부터).
        process.send({ id: job.id, result: found && { ...found, fen: fenOf(found.start, found.moves) } });
      }
    } catch (err) {
      process.send({ id: job.id, error: String(err?.stack ?? err) });
    }
  });
  process.send({ ready: true });
} else {
  await main();
}

/** 수순을 둔 국면의 FEN(수 세기는 0 1 로). 장기의 수는 기물 하나를 옮기기만 해서 판을 직접 옮긴다. */
function fenOf(start, moves) {
  const [placement, turn] = start.split(" ");
  const board = {};
  placement.split("/").forEach((row, i) => {
    let f = 0;
    for (const m of row.match(/\d+|[a-zA-Z]/g)) {
      if (/\d/.test(m)) f += Number(m);
      else board[sq(f++, 10 - i)] = m;
    }
  });
  let t = turn === "w" ? "cho" : "han";
  for (const mv of moves) {
    const from = mv.match(/^[a-i](10|[1-9])/)[0];
    const to = mv.slice(from.length);
    if (from !== to) {
      board[to] = board[from];
      delete board[from];
    }
    t = t === "cho" ? "han" : "cho";
  }
  return toFen(board, t);
}

// --- 고르고 쓰기 ---------------------------------------------------------------------

async function main() {
  const workers = Number(args.get("workers") ?? 4);
  const endgameBudget = Number(args.get("endgame-budget") ?? 80);
  const middleGames = Number(args.get("middle-games") ?? 150);
  // 전체 시간 제한. 넘기면 돌던 일을 버리고 그때까지 끝난 것으로 고른다(2026-11-09 root 조건).
  const hours = Number(args.get("hours") ?? 5);
  const deadline = Date.now() + hours * 3_600_000;
  let timedOut = false;
  const pkg = JSON.parse(await readFile(join(PKG_DIR, "package.json"), "utf8"));
  const engineName = `fairy-stockfish-nnue.wasm ${pkg.version}`;
  const t0 = Date.now();
  const log = (...a) => console.log(`[${((Date.now() - t0) / 60000).toFixed(1)}분]`, ...a);
  log(`시작: ${engineName}, 규칙 ${VARIANT}, 일꾼 ${workers}, 시간 제한 ${hours}시간, 내 쪽 ${ME_NODES}, AI ${AI_NODES.join("/")}, 평가 ${EVAL_NODES}, 버티기 ${HOLD_MOVES}, 이기기 한도 ${JSON.stringify(WIN_CAP)}, 목표 ${JSON.stringify(TARGET)}, 조합당 ${PER_SET}, 끝내기 후보 ${endgameBudget}, 자가 대국 ${middleGames}`);
  log(`끝내기 조합: ${SETS.map((x) => `${x.goal} ${x.me}/${x.them}`).join(", ")}`);

  // 일꾼을 띄우고, 일을 순서대로 나눠 준다. 결과는 번호로 받는다.
  const pool = [];
  for (let i = 0; i < workers; i++) {
    const child = fork(SELF, ["--worker"], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
    await new Promise((resolve) => child.once("message", resolve));
    pool.push(child);
  }
  let nextId = 0;
  const run = (jobs, onResult, enough) =>
    new Promise((resolve) => {
      let i = 0;
      let busy = 0;
      let ended = false;
      const finish = () => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        resolve();
      };
      // 시간이 다 되면 돌던 일을 기다리지 않는다. 늦게 온 답은 handler 가 버린다.
      const timer = setTimeout(() => {
        timedOut = true;
        log("시간 제한에 닿아 멈춥니다.");
        finish();
      }, Math.max(0, deadline - Date.now()));
      const give = (child) => {
        if (ended) return;
        if (timedOut || enough() || i >= jobs.length) {
          if (busy === 0) finish();
          return;
        }
        const job = { ...jobs[i++], id: nextId++ };
        busy++;
        const handler = (msg) => {
          if (msg.id !== job.id) return;
          child.off("message", handler);
          busy--;
          if (ended) return;
          if (msg.error) log("오류:", msg.error);
          onResult(job, msg.result ?? null);
          give(child);
        };
        child.on("message", handler);
        child.send(job);
      };
      for (const c of pool) give(c);
    });

  /*
   * 넣을 국면은 후보 번호 순서로 고른다. 일꾼이 끝내는 순서와 상관없이 같은 결과가 나오게. 앞 번호가
   * 다 끝나야 그 뒤를 센다.
   */
  const pickInOrder = (results, want, final = false) => {
    const chosen = [];
    const perSet = new Map();
    const count = { win: 0, hold: 0 };
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      // 아직 안 끝난 번호. 시간 제한으로 멈춘 뒤(final)에는 끝난 것만으로 고른다.
      if (r === undefined) {
        if (final) continue;
        break;
      }
      if (!r?.ok) continue;
      if (count[r.goal] >= want[r.goal]) continue;
      // 국면 연습은 판마다 다른 국면이라 조합 제한이 없다.
      const key = r.set ?? `seed ${r.seed}`;
      if ((perSet.get(key) ?? 0) >= PER_SET) continue;
      perSet.set(key, (perSet.get(key) ?? 0) + 1);
      count[r.goal]++;
      chosen.push(r);
    }
    return { chosen, done: count.win >= want.win && count.hold >= want.hold };
  };

  // 끝내기: 조합을 돌아가며 시드 하나씩.
  const endgameCands = [];
  for (let k = 0; endgameCands.length < endgameBudget && k < endgameBudget * 4; k++) {
    const set = SETS[k % SETS.length];
    const seed = 1000 + k;
    const placed = place(set, seed);
    if (!placed) continue;
    endgameCands.push({ group: "endgame", goal: set.goal, set: `${set.me}/${set.them}`, setDef: set, seed, ...placed });
  }
  const egResults = [];
  await run(
    endgameCands.map((cand) => ({ type: "verify", cand })),
    (job, r) => {
      const idx = endgameCands.indexOf(job.cand);
      egResults[idx] = r ?? { ok: false, reason: "오류" };
      log(`끝내기 ${idx} ${job.cand.set} ${job.cand.goal} seed ${job.cand.seed}: ${r?.ok ? "넣음 N=" + r.n : "뺌 " + (r?.reason ?? "")} ${r?.sec ? r.sec.toFixed(0) + "초" : ""}`);
    },
    () => pickInOrder(egResults, TARGET.endgame).done
  );
  const eg = pickInOrder(egResults, TARGET.endgame, timedOut).chosen;
  log(`끝내기 ${eg.length}개 (후보 ${egResults.filter(Boolean).length} 확인)`);

  // 국면 연습: 자가 대국으로 후보를 모은 뒤 확인한다.
  const mdCands = [];
  await run(
    Array.from({ length: middleGames }, (_, k) => ({ type: "selfplay", seed: 5000 + k })),
    (job, r) => {
      if (r) mdCands[job.seed - 5000] = { group: "middle", goal: "win", seed: job.seed, me: r.fen.includes(" w ") ? "cho" : "han", fen: r.fen, source: { start: r.start, moves: r.moves } };
      log(`자가 대국 seed ${job.seed}: ${r ? r.ply + "수에서 후보" : "후보 없음"}`);
    },
    () => false
  );
  const middleList = mdCands.filter(Boolean);
  const mdResults = [];
  await run(
    middleList.map((cand) => ({ type: "verify", cand })),
    (job, r) => {
      const idx = middleList.indexOf(job.cand);
      mdResults[idx] = r ?? { ok: false, reason: "오류" };
      log(`국면 연습 ${idx} seed ${job.cand.seed}: ${r?.ok ? "넣음 N=" + r.n : "뺌 " + (r?.reason ?? "")} ${r?.sec ? r.sec.toFixed(0) + "초" : ""}`);
    },
    () => pickInOrder(mdResults, TARGET.middle).done
  );
  const md = pickInOrder(mdResults, TARGET.middle, timedOut).chosen;
  log(`국면 연습 ${md.length}개 (후보 ${mdResults.filter(Boolean).length} 확인)`);
  for (const c of pool) c.kill();

  // 떨어진 까닭별 수. 국면 연습이 다 차지 않으면 root 가 이 수로 사용자에게 다시 묻는다.
  const why = (r) =>
    r.ok
      ? "넣음(조건 통과, 고를 때 한도·순서로 빠졌을 수 있음)"
      : r.reason.startsWith("평가")
        ? "깊은 평가가 범위 밖"
        : r.reason === "시작할 수 없는 국면"
          ? "시작할 수 없는 국면(장군 등)"
          : r.reason.includes(": other")
            ? "외통이 아닌 끝(양쪽 한수쉼 점수 등)"
            : r.reason.includes(": cap")
              ? "한도 수까지 외통이 안 남"
              : r.reason.includes("(me 짐)")
                ? "내 쪽이 외통을 당함"
                : r.reason.includes(": checkmate")
                  ? "버티기 실패(외통 당함)"
                  : r.reason;
  for (const [name, list] of [["끝내기", egResults], ["국면 연습", mdResults]]) {
    const tally = new Map();
    for (const r of list.filter(Boolean)) tally.set(why(r), (tally.get(why(r)) ?? 0) + 1);
    log(`${name} 까닭별: ${[...tally].map(([k, v]) => `${k} ${v}`).join(", ") || "없음"}`);
  }
  if (timedOut) log("시간 제한으로 멈춤 - 끝난 후보만으로 골랐습니다.");

  // 쉬운 것(가장 오래 걸린 판의 내 수가 적은 것) 먼저. 버티기는 끝내기 맨 뒤에.
  const hardness = (r) => (r.goal === "hold" ? 1e6 : Math.max(...r.games.map((g) => g.myMoves)));
  const entries = [...eg.sort((a, b) => hardness(a) - hardness(b)), ...md.sort((a, b) => hardness(a) - hardness(b))].map(
    (r) => {
      const goal = { kind: r.goal, n: r.n };
      const id = idOf(r.fen, VARIANT, goal);
      return {
        id,
        group: r.group,
        variant: VARIANT,
        fen: r.fen,
        goal,
        check: {
          engine: engineName,
          eval: r.eval,
          meNodes: ME_NODES,
          games: r.games,
          seed: r.seed,
          ...(r.source ? { source: r.source } : {}),
        },
      };
    }
  );
  if (new Set(entries.map((e) => e.id)).size !== entries.length) throw new Error("id 가 겹칩니다.");
  log(`끝: 끝내기 ${eg.length}, 국면 연습 ${md.length}, ${((Date.now() - t0) / 60000).toFixed(1)}분`);
  if (args.has("dry")) {
    log("--dry: 데이터를 쓰지 않습니다.");
    process.exit(0);
  }
  const text = "[\n" + entries.map((e) => "  " + JSON.stringify(e)).join(",\n") + "\n]\n";
  await writeFile(OUT, text);
  log(`썼다: ${OUT}`);
  process.exit(0);
}

/** --reuse: 데이터에 적힌 확인 결과로 목표 수 N 과 id 만 다시 계산해 쓴다. 순서·국면·확인 결과는 그대로. */
async function reuse() {
  const old = JSON.parse(await readFile(OUT, "utf8"));
  const entries = old.map((e) => {
    const goal = e.goal.kind === "win" ? { kind: "win", n: winN(e.check.games) } : e.goal;
    if (goal.n !== e.goal.n) console.log(`${e.id}: N ${e.goal.n} → ${goal.n}`);
    return { ...e, id: idOf(e.fen, e.variant, goal), goal };
  });
  if (new Set(entries.map((e) => e.id)).size !== entries.length) throw new Error("id 가 겹칩니다.");
  await writeFile(OUT, "[\n" + entries.map((e) => "  " + JSON.stringify(e)).join(",\n") + "\n]\n");
  console.log(`썼다: ${OUT} (${entries.length}개)`);
  process.exit(0);
}
