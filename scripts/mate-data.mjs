// 외통 문제 데이터 만들기 - 조사 세션이 검사를 통과시킨 국면에서 문제를 고르고 합법수를 담는다
//
//   node scripts/mate-data.mjs <passed.json 경로>
//
// 쓰는 곳: src/janggi/mates.json. 손으로 고치지 않고 이 스크립트로 다시 만든다.
//
// 재료(passed.json)는 저장소 밖에 있다(C:\nakyung\janggi-docs-backup\research-2026-10-27\).
// 엔진끼리 둔 자가 대국에서 외통 국면을 뽑고(gen.mjs), 합법수를 하나씩 따라가는 완전 탐색으로
// "정답이 하나뿐이다" 를 세 규칙(표준·현대·전통)에서 증명한(verify.mjs) 것들이다. 그 두 스크립트는
// 백업 폴더에 있다(docs/report-research.md 1절). 여기서는 고르고, 엔진에 합법수를 물어 담기만 한다.
//
// 화면에는 엔진이 없다. 공격 쪽이 기물을 집으면 갈 곳이 보여야 하고, 답이 아닌 수가 둘 수 있는
// 수인지도 가려야 해서, 공격 차례 국면마다 엔진의 합법수를 데이터에 넣는다. 한수쉼은 뺀다 - 답이 될
// 일이 없고, 넣으면 집은 궁의 제자리가 갈 곳에 들어간다. 데이터가 엔진과 같은지는
// src/janggi/mate.test.ts 가 같은 엔진으로 다시 본다.

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// 앱이 싣는 엔진은 이 패키지를 public/engine 으로 복사한 것이다(fetch-engine.mjs). 합법수만 물으므로
// 신경망은 물리지 않는다.
const PKG_DIR = join(ROOT, "node_modules", "fairy-stockfish-nnue.wasm");
const OUT = join(ROOT, "src", "janggi", "mates.json");
const VARIANTS = ["janggi", "janggimodern", "janggitraditional"];

const input = process.argv[2];
if (!input) {
  console.error("passed.json 경로를 주세요: node scripts/mate-data.mjs <경로>");
  process.exit(1);
}

/** 문제 id. FEN 의 판 + 둘 차례의 SHA-256 앞 10자리. 수 세기 칸은 넣지 않는다 - 같은 국면이면 같은 문제다. */
const idOf = (fen) =>
  createHash("sha256").update(fen.split(" ").slice(0, 2).join(" ")).digest("hex").slice(0, 10);
const isPass = (m) => m.slice(0, m.length / 2) === m.slice(m.length / 2);

// --- 엔진 ---------------------------------------------------------------------

const require = createRequire(import.meta.url);
const Stockfish = require(join(PKG_DIR, "stockfish.js"));
const engine = await Stockfish({
  wasmBinary: new Uint8Array(await readFile(join(PKG_DIR, "stockfish.wasm"))),
});
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
const ask = (command, done) =>
  new Promise((resolve) => {
    waiters.push({ lines: [], done, resolve });
    engine.postMessage(command);
  });

await ask("uci", (l) => l === "uciok");

/** 국면의 합법수와 장군 여부. 앱(src/engine/engine.ts 의 probe)과 같은 두 명령을 쓴다. */
async function probe(fen, moves) {
  engine.postMessage(`position fen ${fen}${moves.length ? " moves " + moves.join(" ") : ""}`);
  const dump = await ask("d", (l) => l.startsWith("Checkers:"));
  const checkers = dump.find((l) => l.startsWith("Checkers:")).slice(9).trim();
  const out = await ask("go perft 1", (l) => l.startsWith("Nodes searched"));
  const legal = [];
  for (const l of out) {
    const m = l.match(/^([a-i](?:10|[1-9])[a-i](?:10|[1-9])):\s*\d+$/);
    if (m) legal.push(m[1]);
  }
  return { legal, inCheck: checkers.length > 0 };
}

// --- 고르기 -------------------------------------------------------------------

const passed = JSON.parse(await readFile(input, "utf8"));

/*
 * 같은 자가 대국에서는 하나만 남긴다. 가장 긴 외통, 길이가 같으면 앞 수.
 *
 * 수집 스크립트가 외통 국면을 뽑은 뒤 이어지는 국면(3수 → 2수 → 1수)도 따로 뽑았다. 앞 문제의
 * 수순 구간만 빼면 48개인데, 늘어나는 6개도 같은 판의 몇 수 뒤라 거의 같은 판이 두 번 나온다.
 */
const byGame = new Map();
for (const r of [...passed].sort((a, b) => a.src.ply - b.src.ply)) {
  if (!r.modern.ok || !r.janggi.ok || !r.janggi.sameLine || !r.janggitraditional.ok || !r.janggitraditional.sameLine) {
    throw new Error(`세 규칙을 다 통과하지 않은 국면이 섞여 있습니다: ${r.fen}`);
  }
  const key = `${r.src.seed}:${r.src.game}`;
  const kept = byGame.get(key);
  if (!kept || r.modern.n > kept.modern.n) byGame.set(key, r);
}

/*
 * 화면 순서: 길이 → 첫 수가 장군인 것 먼저 → 엔진이 정답을 찾은 노드 수가 적은 것 먼저. 노드가 적으면
 * 사람에게도 쉬울 것으로 본다(추정, 사람으로 재 보지 않았다). 끝은 id 로 갈라 늘 같은 순서가 되게 한다.
 */
const chosen = [...byGame.values()].sort(
  (a, b) =>
    a.modern.n - b.modern.n ||
    Number(a.modern.firstIsCheck === false) - Number(b.modern.firstIsCheck === false) ||
    a.cost.nodes - b.cost.nodes ||
    idOf(a.fen).localeCompare(idOf(b.fen))
);

// --- 합법수 담기 --------------------------------------------------------------

const puzzles = [];
for (const r of chosen) {
  const line = r.modern.line;
  const legal = [];
  for (let i = 0; i < line.length; i += 2) {
    let first = null;
    for (const variant of VARIANTS) {
      engine.postMessage("setoption name UCI_Variant value " + variant);
      const { legal: moves } = await probe(r.fen, line.slice(0, i));
      const shown = moves.filter((m) => !isPass(m)).sort();
      if (!shown.includes(line[i])) throw new Error(`정답이 합법수에 없습니다(${variant}): ${r.fen} ${line[i]}`);
      if (first && first.join(" ") !== shown.join(" ")) {
        throw new Error(`규칙마다 합법수가 다릅니다(${variant}): ${r.fen}, ${i}째 수`);
      }
      first = shown;
    }
    legal.push(first);
  }
  puzzles.push({
    id: idOf(r.fen),
    n: r.modern.n,
    fen: r.fen,
    quiet: !r.modern.firstIsCheck,
    line,
    legal,
  });
}

if (new Set(puzzles.map((p) => p.id)).size !== puzzles.length) throw new Error("id 가 겹칩니다.");

// 문제 하나를 몇 줄로 적는다. 합법수 배열을 한 수씩 줄을 바꾸면 3천 줄이 넘는다.
const text =
  "[\n" +
  puzzles
    .map((p) =>
      [
        `  {"id": ${JSON.stringify(p.id)}, "n": ${p.n}, "quiet": ${p.quiet},`,
        `   "fen": ${JSON.stringify(p.fen)},`,
        `   "line": ${JSON.stringify(p.line)},`,
        `   "legal": [\n${p.legal.map((l) => "     " + JSON.stringify(l)).join(",\n")}\n   ]}`,
      ].join("\n")
    )
    .join(",\n") +
  "\n]\n";
await writeFile(OUT, text);

const count = (n) => puzzles.filter((p) => p.n === n).length;
console.log(`문제 ${puzzles.length}개 (1수 ${count(1)}, 2수 ${count(2)}, 3수 ${count(3)}) → ${OUT}`);
process.exit(0);
