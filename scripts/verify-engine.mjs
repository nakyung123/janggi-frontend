// 엔진 부팅 검증 스크립트 (①단계 확인용)
//
// 브라우저 UI를 만들기 전에, Fairy-Stockfish WASM 이 Node 에서
//   - 장기(janggi) 변형을 인식하는지
//   - 장기 NNUE 신경망을 물고 평가하는지
//   - 임의 FEN 국면(판 커스텀)을 받아 수를 찾는지
// 를 먼저 확인한다. 여기서 실패하면 UI 작업은 전부 헛수고다.

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_DIR = join(ROOT, "public", "engine");
const NNUE_NAME = "janggi-9991472750de.nnue";
// 신경망은 압축해서 둔다(scripts/fetch-engine.mjs). 브라우저가 풀듯 여기서도 푼다.
const NNUE_GZ = NNUE_NAME + ".gz.bin";

const require = createRequire(import.meta.url);

// 장기 초기 국면. wasm 바이너리에 내장된 값과 동일하다.
// r=차 n=마 b=상 a=사 k=궁 c=포 p=졸/병, 대문자=초(楚), 소문자=한(漢)
const START_FEN =
  "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1";

// 판 커스텀 검증용 국면: 한(漢)이 차 둘과 포 하나만 남고 초(楚)는 궁과 사 둘뿐인 종반.
// 사람이 직접 편집해서 만들 법한, 초기 배치와 무관한 국면이다.
const CUSTOM_FEN = "4k4/4a4/3a5/9/9/9/9/2C6/9/R3K3R w - - 0 1";

async function createEngine() {
  const Stockfish = require(join(ENGINE_DIR, "stockfish.js"));
  // Node 24 에는 전역 fetch 가 있어서, 엠스크립튼이 .wasm 을 브라우저처럼 fetch 로
  // 받으려다 파일 경로에서 "unknown scheme" 으로 실패한다.
  // 바이너리를 직접 넘겨 그 경로를 건너뛴다. 브라우저에서도 같은 방식을 쓴다.
  const wasmBinary = new Uint8Array(
    await readFile(join(ENGINE_DIR, "stockfish.wasm"))
  );
  return Stockfish({ wasmBinary });
}

// UCI 는 줄 단위 비동기 프로토콜이라, 원하는 줄이 나올 때까지 모으는 헬퍼가 필요하다.
class Uci {
  constructor(engine) {
    this.engine = engine;
    this.lines = [];
    this.waiters = [];
    engine.addMessageListener((line) => {
      this.lines.push(line);
      for (const w of this.waiters.slice()) {
        w.buffer.push(line);
        if (w.done(line)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(w.buffer);
        }
      }
    });
  }
  send(cmd) {
    this.engine.postMessage(cmd);
  }
  until(done, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const w = { buffer: [], done, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        if (this.waiters.includes(w)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          reject(new Error(`시간 초과: 기다리던 응답이 오지 않았습니다.`));
        }
      }, timeoutMs).unref?.();
    });
  }
  async cmd(command, done) {
    const p = this.until(done);
    this.send(command);
    return p;
  }
  async ready() {
    return this.cmd("isready", (l) => l === "readyok");
  }
}

const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
  return ok;
};

async function main() {
  console.log("장기 엔진 검증 시작\n");

  const engine = await createEngine();
  const uci = new Uci(engine);

  // --- 1. UCI 핸드셰이크 + 변형 목록 확인 -------------------------------
  const handshake = await uci.cmd("uci", (l) => l === "uciok");
  const variantLine = handshake.find((l) =>
    l.startsWith("option name UCI_Variant")
  );
  const variants = variantLine
    ? variantLine.split(" var ").slice(1).map((s) => s.trim())
    : [];
  check("UCI 핸드셰이크", handshake.includes("uciok"));
  check(
    "장기 변형 지원",
    variants.includes("janggi"),
    `총 ${variants.length}종 중 janggi 계열: ${variants
      .filter((v) => v.startsWith("janggi"))
      .join(", ")}`
  );

  // --- 2. 장기 NNUE 신경망 주입 -----------------------------------------
  // 엠스크립튼 가상 파일시스템에 신경망을 써넣고 EvalFile 로 가리킨다.
  // 브라우저에서도 완전히 동일한 방식이다.
  // 순서가 중요하다. UCI_Variant 는 다음 `position` 명령을 받아야 실제로 적용되고,
  // EvalFile 은 그 뒤에 걸어야 장기용 신경망으로 인식된다.
  const nnue = new Uint8Array(gunzipSync(await readFile(join(ENGINE_DIR, NNUE_GZ))));
  engine.FS.writeFile("/" + NNUE_NAME, nnue);
  uci.send("setoption name UCI_Variant value janggi");
  uci.send(`position fen ${START_FEN}`);
  uci.send(`setoption name EvalFile value /${NNUE_NAME}`);
  uci.send("setoption name Threads value 1");
  uci.send("setoption name Hash value 64");
  await uci.ready();

  // `eval` 은 첫 줄에 어떤 평가 방식이 쓰이는지 알려준다.
  // 신경망이 안 붙으면 "classical evaluation enabled" 가 나온다.
  uci.send(`position fen ${START_FEN}`);
  const evalOut = await uci.cmd("eval", (l) => l.includes("evaluation"));
  const evalLine = evalOut.find((l) => l.includes("evaluation"))?.trim() ?? "";
  check(
    "NNUE 신경망 적용",
    evalLine.includes("NNUE evaluation using"),
    evalLine.replace("info string ", "")
  );

  // --- 3. 초기 국면 탐색 -------------------------------------------------
  uci.send(`position fen ${START_FEN}`);
  await uci.ready();
  const startDump = await uci.cmd("d", (l) => l.startsWith("Fen:"));
  console.log("\n" + startDump.filter((l) => l.trim() !== "").join("\n") + "\n");
  check(
    "초기 국면 로드",
    startDump.some((l) => l.startsWith("Fen:") && l.includes("rnba1abnr")),
    startDump.find((l) => l.startsWith("Fen:"))?.trim()
  );

  uci.send("setoption name MultiPV value 3");
  await uci.ready();
  const search1 = await uci.cmd("go depth 16", (l) =>
    l.startsWith("bestmove")
  );
  const best1 = search1.find((l) => l.startsWith("bestmove"))?.split(" ")[1];
  const pvs1 = search1.filter((l) => l.includes(" multipv ") && l.includes(" pv "));
  console.log("\n  [초기 국면 후보수 3개]");
  for (const pv of pvs1.slice(-3)) {
    const m = pv.match(/depth (\d+).* multipv (\d+) score (cp|mate) (-?\d+).* pv (.+)$/);
    if (m) {
      console.log(
        `    ${m[2]}위  깊이 ${m[1]}  평가 ${m[3] === "cp" ? (m[4] / 100).toFixed(2) : "#" + m[4]}  수순 ${m[5].split(" ").slice(0, 6).join(" ")}`
      );
    }
  }
  console.log("");
  check("초기 국면 최선수 산출", Boolean(best1) && best1 !== "(none)", best1);

  // --- 4. 임의 편집 국면 탐색 (판 커스텀 핵심 검증) ----------------------
  uci.send(`position fen ${CUSTOM_FEN}`);
  await uci.ready();
  const customDump = await uci.cmd("d", (l) => l.startsWith("Fen:"));
  const customFen = customDump.find((l) => l.startsWith("Fen:"))?.replace("Fen: ", "").trim();
  check(
    "임의 편집 국면 수용",
    customFen?.startsWith("4k4/4a4/3a5"),
    customFen
  );

  const search2 = await uci.cmd("go depth 18", (l) => l.startsWith("bestmove"));
  const best2 = search2.find((l) => l.startsWith("bestmove"))?.split(" ")[1];
  const lastInfo = search2.filter((l) => l.includes(" score ")).at(-1) ?? "";
  const scoreMatch = lastInfo.match(/score (cp|mate) (-?\d+)/);
  check(
    "임의 편집 국면 최선수 산출",
    Boolean(best2) && best2 !== "(none)",
    `${best2}, 평가 ${
      scoreMatch
        ? scoreMatch[1] === "cp"
          ? (scoreMatch[2] / 100).toFixed(2)
          : "#" + scoreMatch[2]
        : "?"
    }`
  );

  // --- 5. 잘못된 국면 거부 확인 -----------------------------------------
  // 편집 모드에서 사용자가 이상한 판을 만들었을 때 엔진이 어떻게 반응하는지 본다.
  uci.send("position fen 9/9/9/9/9/9/9/9/9/9 w - - 0 1");
  await uci.ready();
  const emptyDump = await uci.cmd("d", (l) => l.startsWith("Fen:"));
  console.log(
    `\n  [참고] 빈 판 입력 시 엔진 응답: ${emptyDump
      .find((l) => l.startsWith("Fen:"))
      ?.trim()}`
  );

  console.log(
    `\n${process.exitCode ? "일부 검증 실패" : "모든 검증 통과"}\n`
  );
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error("\n[verify-engine] 실패:", err);
  process.exit(1);
});
