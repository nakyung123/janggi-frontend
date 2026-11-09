// 혼자 장기 문제 데이터 만들기 - 거꾸로 만들고, 끝까지 찾아 확인하고, 묶음마다 고른다
//
//   node scripts/solo-data.mjs
//
// 쓰는 곳: src/janggi/solos.json. 손으로 고치지 않고 이 스크립트로 다시 만든다. 씨앗이 정해져 있어
// 다시 돌리면 같은 파일이 나온다.
//
// 규칙은 앱의 것(src/janggi/solo.ts, 그 안에서 moves.ts)을 Vite 의 runnerImport 로 그대로 불러 쓴다.
// 문제를 만들 때와 화면에서 둘 때의 규칙이 한 벌이다.
//
// 만드는 법 - 거꾸로 만들기. 기물 하나를 놓고 "마지막 잡기" 를 한 번씩 되돌린다. 판의 기물 P(자리 t)가
// 다른 자리 s 에서 t 로 잡으러 올 수 있으면 P 를 s 로 물리고 t 에 상대 편 기물 Q 를 새로 놓는다. 기물
// 수가 찰 때까지 한다. 되돌린 차례를 거꾸로 두면 답이 되므로 만든 문제는 늘 풀린다. 그래도 끝까지
// 찾아 한 번 더 확인한다(안 풀리면 멈춘다).
//
// 놓는 자리는 대국에서 나올 수 있는 자리만 쓴다: 사는 제 궁성, 졸은 제 진영 뒤 세 줄 밖(뒤로 못
// 가서다), 한 편의 같은 기물은 대국 차림 수까지. 궁은 놓지 않는다.
//
// 고르기 - 묶음마다 기물 수와 "아무렇게나 잡을 때 풀릴 확률"(solo.ts 의 explore) 범위로 거른다. 시작
// 판에서 둘 수 있는 수가 둘 이상이고 그 가운데 막히는 첫 수가 하나 이상, 기물 종류가 셋 이상인
// 것만 쓴다. 남은 것을 확률이 높은 것(쉬울 것) 먼저 늘어놓고 고르게 12개를 뽑는다.

import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "janggi", "solos.json");

// solo.ts 가 이 파일을 읽으므로 처음 만들 때는 빈 목록을 먼저 둔다.
if (!existsSync(OUT)) writeFileSync(OUT, "[]\n");

const { runnerImport } = await import(pathToFileURL(join(ROOT, "node_modules", "vite", "dist", "node", "index.js")).href);
const load = async (path) => (await runnerImport(join(ROOT, path), { root: ROOT, configFile: false })).module;
const { FILES, RANKS, palaceOf, rankOf, sq, toFen } = await load("src/janggi/board.ts");
const { pieceMoves } = await load("src/janggi/moves.ts");
const { capturesOf, explore, playCapture } = await load("src/janggi/solo.ts");

/** 문제 id. 판 칸의 SHA-256 앞 10자리. 둘 차례는 이 규칙에서 뜻이 없어 넣지 않는다. */
const boardFen = (board) => toFen({ board, turn: "cho", halfmove: 0, fullmove: 1 }).split(" ")[0];
const idOf = (board) => createHash("sha256").update(boardFen(board)).digest("hex").slice(0, 10);

// --- 정해진 씨앗의 난수 ---------------------------------------------------------

let seed = 20261109;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (list) => list[Math.floor(rand() * list.length)];

// --- 거꾸로 만들기 --------------------------------------------------------------

const SQUARES = [];
for (let f = 0; f < FILES; f++) for (let r = 1; r <= RANKS; r++) SQUARES.push(sq(f, r));
const TYPES = ["r", "c", "n", "b", "a", "p"];
/** 한 편이 가진 수(대국 차림). 궁은 놓지 않는다. */
const MAX = { r: 2, c: 2, n: 2, b: 2, a: 2, p: 5 };
const sideOf = (c) => (c === c.toUpperCase() ? "cho" : "han");
const charOf = (type, side) => (side === "cho" ? type.toUpperCase() : type);

function canPlace(piece, square) {
  const type = piece.toLowerCase();
  const side = sideOf(piece);
  if (type === "a") return palaceOf(square) === side;
  if (type === "p") return side === "cho" ? rankOf(square) >= 4 : rankOf(square) <= 7;
  return true;
}

/** 기물 n 개짜리 판 하나. 못 만들면 null. */
function generate(n) {
  for (let tries = 0; tries < 200; tries++) {
    const first = charOf(pick(TYPES), pick(["cho", "han"]));
    const at = pick(SQUARES);
    if (!canPlace(first, at)) continue;
    let board = { [at]: first };
    let ok = true;
    for (let k = 1; k < n && ok; k++) {
      ok = false;
      for (let attempt = 0; attempt < 300 && !ok; attempt++) {
        const t = pick(Object.keys(board));
        const mover = board[t];
        const victim = charOf(pick(TYPES), sideOf(mover) === "cho" ? "han" : "cho");
        if (Object.values(board).filter((c) => c === victim).length >= MAX[victim.toLowerCase()]) continue;
        if (!canPlace(victim, t)) continue;
        const s = pick(SQUARES);
        if (board[s] || !canPlace(mover, s)) continue;
        const before = { ...board, [s]: mover, [t]: victim };
        if (pieceMoves(before, s).includes(t)) {
          board = before;
          ok = true;
        }
      }
    }
    if (ok) return board;
  }
  return null;
}

/** 답 하나. 수를 이름 순서로 보고 처음 찾은 길이다(늘 같은 답이 나온다). */
function firstLine(board) {
  if (Object.keys(board).length === 1) return [];
  for (const move of capturesOf(board).sort()) {
    const next = playCapture(board, move);
    if (explore(next).solutions > 0) return [move, ...firstLine(next)];
  }
  return null;
}

// --- 고르기 ---------------------------------------------------------------------

const LEVELS = [
  { level: 1, sizes: [4, 5], min: 0.3, max: 0.8 },
  { level: 2, sizes: [6, 7], min: 0.08, max: 0.3 },
  { level: 3, sizes: [8, 9, 10], min: 0, max: 0.08 },
];
const PER_LEVEL = 12;
const POOL = 300;

const puzzles = [];
const seen = new Set();
for (const { level, sizes, min, max } of LEVELS) {
  const candidates = [];
  for (const n of sizes) {
    for (let i = 0; i < POOL; i++) {
      const board = generate(n);
      if (!board) continue;
      const id = idOf(board);
      if (seen.has(id)) continue;
      seen.add(id);
      const { solutions, chance } = explore(board);
      if (solutions === 0) throw new Error(`거꾸로 만든 문제가 안 풀립니다: ${boardFen(board)}`);
      const first = capturesOf(board);
      const deadFirst = first.filter((m) => explore(playCapture(board, m)).solutions === 0).length;
      const types = new Set(Object.values(board).map((c) => c.toLowerCase())).size;
      if (chance < min || chance > max || first.length < 2 || deadFirst < 1 || types < 3) continue;
      candidates.push({ id, board, chance });
    }
  }
  if (candidates.length < PER_LEVEL) throw new Error(`${level} 묶음 후보가 ${candidates.length}개뿐입니다.`);
  candidates.sort((a, b) => b.chance - a.chance || a.id.localeCompare(b.id));
  const step = candidates.length / PER_LEVEL;
  for (let i = 0; i < PER_LEVEL; i++) {
    const { id, board, chance } = candidates[Math.floor(i * step)];
    const line = firstLine(board);
    if (!line || line.length !== Object.keys(board).length - 1) throw new Error(`답을 못 찾았습니다: ${boardFen(board)}`);
    puzzles.push({ id, level, fen: `${boardFen(board)} w - - 0 1`, line, chance });
  }
  console.log(`${level} 묶음: 후보 ${candidates.length}개에서 ${PER_LEVEL}개`);
}

// 문제 하나를 한 줄로 적는다. 풀릴 확률은 고를 때만 쓰고 담지 않는다.
const text = "[\n" + puzzles.map(({ chance: _, ...p }) => "  " + JSON.stringify(p)).join(",\n") + "\n]\n";
writeFileSync(OUT, text);
console.log(`문제 ${puzzles.length}개 → ${OUT}`);
for (const p of puzzles) console.log(`  ${p.level} ${p.id} 기물 ${p.line.length + 1} 풀릴 확률 ${p.chance.toFixed(3)}`);
process.exit(0);
