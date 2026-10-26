// 푸시한 뒤 배포본이 지금 커밋과 같은지, 헤더와 경로가 그대로인지 본다.
//
// main 에 푸시하면 Vercel 이 배포한다. 그 뒤에 손으로 하던 확인을 한 번에 한다.
//
//   node scripts/check-deploy.mjs                         운영 사이트
//   node scripts/check-deploy.mjs <주소> [--wait <초>]     다른 주소. 배포를 기다리는 시간(기본 600)
//
// 하는 일
//   1. 커밋 안 된 변경이 없고 HEAD 가 origin/main 과 같은지. 다르면 비교할 수 없어서 멈춘다.
//   2. 임시 폴더에 빌드해서 번들 파일 이름을 얻는다(dist/ 는 건드리지 않는다).
//   3. 라이브 번들 이름이 같아질 때까지 기다린다. Vercel 이 실패를 알리면 바로 멈춘다.
//   4. 라이브 응답 헤더가 vercel.json 과 같은지.
//   5. 있어야 할 경로는 200, 드러나면 안 되는 경로는 404 인지.
//
// 하지 않는 것: 화면(엔진이 뜨는지, 320 폭, 콘솔 오류)은 브라우저로 따로 본다.
// 운영 사이트에는 읽기(GET)만 보낸다.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO = "nakyung123/janggi-frontend";

const args = process.argv.slice(2);
const waitAt = args.indexOf("--wait");
const WAIT = waitAt >= 0 ? Number(args.splice(waitAt, 2)[1]) : 600;
const SITE = (args[0] ?? "https://janggi-ai.vercel.app").replace(/\/$/, "");

// 멈출 때 process.exit 를 부르지 않는다. 요청을 보낸 뒤에 부르면 윈도우의 Node 가
// 닫히는 중인 연결을 만나 종료코드 127 로 죽는다. 던져서 맨 아래에서 받는다.
class Stop extends Error {}
const stop = (why) => {
  throw new Stop(why);
};

let failed = 0;
const pass = (what) => console.log(`  통과  ${what}`);
const fail = (what) => {
  failed++;
  console.log(`  실패  ${what}`);
};
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const bundleOf = (html) => html.match(/assets\/index-[\w-]+\.js/)?.[0] ?? null;

function get(path, timeout = 20_000) {
  return fetch(SITE + path, {
    redirect: "manual",
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(timeout),
  });
}

// GitHub 에 남은 이 커밋의 Vercel 배포 상태. 못 읽으면 null(번들 이름만으로 판단한다).
async function vercelState(head) {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${head}/status`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.statuses?.find((s) => s.context === "Vercel")?.state ?? "없음";
  } catch {
    return null;
  }
}

async function main() {
  // 1. 비교할 수 있는 상태인가
  if (git("status", "--porcelain")) stop("커밋 안 된 변경이 있다. 로컬 빌드가 배포본과 달라져 비교할 수 없다.");
  git("fetch", "-q", "origin", "main");
  const head = git("rev-parse", "HEAD");
  if (head !== git("rev-parse", "origin/main")) stop(`HEAD(${head.slice(0, 7)})가 origin/main 과 다르다. 푸시했는지 본다.`);
  console.log(`커밋 ${head.slice(0, 7)} · 대상 ${SITE}`);

  // 2. 로컬 빌드의 번들 이름
  const out = mkdtempSync(join(tmpdir(), "janggi-check-deploy-"));
  let local;
  try {
    await build({ root: ROOT, logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
    local = bundleOf(readFileSync(join(out, "index.html"), "utf8"));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  if (!local) stop("로컬 빌드에서 번들 이름을 찾지 못했다.");

  // 3. 라이브가 이 커밋이 될 때까지. 번들이 안 바뀌는 커밋(스크립트·문서)은 배포 전에도
  // 번들 이름이 같으므로, 이 커밋의 Vercel 배포가 끝났다는 기록도 같이 기다린다.
  // 기록을 못 읽으면(null, GitHub API 한도 등) 번들 이름만으로 판단한다.
  const started = Date.now();
  let live = null;
  let state = null;
  for (let round = 0; ; round++) {
    live = bundleOf(await (await get("/")).text());
    if (state !== "success" && round % 2 === 0) state = await vercelState(head);
    if (state === "failure" || state === "error") stop(`Vercel 배포가 실패했다(${state}). Vercel 대시보드의 빌드 기록을 본다.`);
    if (live === local && (state === "success" || state === null)) break;
    if ((Date.now() - started) / 1000 >= WAIT) break;
    if (round === 0) console.log(`배포를 기다린다(최대 ${WAIT}초)`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  if (state === "success") pass("이 커밋의 Vercel 배포가 끝났다");
  else if (state === null) console.log("  모름  Vercel 배포 기록을 읽지 못해 번들 이름만 본다");
  else fail(`이 커밋의 Vercel 배포가 끝나지 않았다(${state})`);
  if (live === local) pass(`번들 이름이 로컬 빌드와 같다: ${local}`);
  else fail(`번들 이름이 다르다: 로컬 ${local}, 라이브 ${live ?? "못 찾음"}`);

  // 4. 헤더
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  const want = (vercel.headers ?? []).find((h) => h.source === "/(.*)")?.headers ?? [];
  if (want.length === 0) stop("vercel.json 에서 전체 경로(/(.*))의 헤더를 찾지 못했다.");
  const got = (await get("/")).headers;
  for (const { key, value } of want) {
    const v = got.get(key);
    if (v === value) pass(`헤더 ${key}`);
    else fail(`헤더 ${key}\n          기대 ${value}\n          받음 ${v ?? "없음"}`);
  }

  // 5. 경로
  const paths = [
    ["/engine/stockfish.js", 200, "엔진 스크립트"],
    ["/privacy/", 200, "개인정보처리방침"],
    ["/api/actuator/health", 200, "백엔드로 넘기는 경로(/api 되돌림)"],
    [`/${local}.map`, 404, "소스맵이 드러나지 않음"],
    ["/.git/config", 404, "git 설정이 드러나지 않음"],
    ["/.env", 404, ".env 가 드러나지 않음"],
  ];
  for (const [path, code, what] of paths) {
    // 백엔드는 쉬다 깨어나는 데 몇 초 걸린다.
    const status = await get(path, 30_000).then(
      (r) => r.status,
      (e) => e.name,
    );
    if (status === code) pass(`${what}: ${path} ${status}`);
    else fail(`${what}: ${path} 기대 ${code}, 받음 ${status}`);
  }

  if (failed) stop(`${failed}개 실패`);
  console.log("배포본이 이 커밋과 같고, 헤더와 경로가 그대로다. 화면은 브라우저로 따로 본다.");
}

try {
  await main();
} catch (e) {
  if (!(e instanceof Stop)) throw e;
  console.error(e.message);
  process.exitCode = 1;
}
