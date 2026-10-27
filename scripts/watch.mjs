// 바깥에서 보는 감시. GitHub Actions 가 15분 간격으로 걸어 두고 돌린다(실제로는 더 드물다, .github/workflows/watch.yml).
//
//   node scripts/watch.mjs                 셋을 보고 결과만 찍는다(DB 는 빼고)
//   node scripts/watch.mjs --db            DB 까지 본다
//   node scripts/watch.mjs --issues        장애 이슈를 열고·닫는다(gh 와 GH_TOKEN 이 있어야 한다)
//   node scripts/watch.mjs --fail backend  그 대상을 없는 주소로 보게 해 일부러 실패시킨다(알림 시험)
//
// 무엇을 보나
//   site     첫 화면 200, 격리 헤더(COOP·COEP), 엔진 파일 200. 격리가 깨지면 대부분의 사람이 엔진을 못 띄운다.
//   backend  Vercel 을 거쳐 /api/me 200. 로그인하지 않은 요청이라 DB 를 보지 않는다(MeController).
//   db       /api/actuator/health 200. DB 지표가 들어 있어 DB 가 없으면 503 이다.
//
// **DB 는 드물게 본다(워크플로가 6시간마다만 --db 를 준다).** health 를 부르면 Neon 이 깨어나
// 최소 5분 동안 컴퓨트 시간을 쓴다. 15분마다 부르면 무료 한 달 100시간을 넘길 수 있다.
//
// 한 번 실패로 장애라 하지 않는다. 30초 간격으로 두 번 더 해 보고 셋 다 실패해야 장애다.
// 콜드 스타트(2.4초)나 한 번 튄 응답으로 메일이 가면 알림을 안 보게 된다.
//
// 알림은 장애 하나에 이슈 하나다(라벨 "장애"). 처음 실패에 열고, 실패하는 대상이 바뀔 때만
// 댓글을 달고, 회복하면 댓글을 달고 닫는다. 이슈 본문 끝의 표식에 지금 실패 중인 대상을 적어 둔다.
// 이 스크립트가 고장 나면(예외) 종료 코드가 1 이라 GitHub 가 작업 실패 메일을 보낸다.

import { spawnSync } from "node:child_process";

const BASE = "https://janggi-ai.vercel.app";
const REPOS = ["nakyung123/janggi-frontend", "nakyung123/janggi-backend"];
const LABEL = "장애";
const TRIES = 3;
const WAIT_MS = 30_000;
const TIMEOUT_MS = 20_000;

const args = process.argv.slice(2);
const withDb = args.includes("--db");
const withIssues = args.includes("--issues");
const failIndex = args.indexOf("--fail");
const forcedFail = failIndex >= 0 ? args[failIndex + 1] : null;

/** 일부러 실패시킬 때 쓰는 없는 주소. 진짜 404 를 받아 오는 길을 그대로 지난다. */
const missing = (path) => (name) => (forcedFail === name ? "/__watch_missing__" : path);

const CHECKS = [
  {
    name: "site",
    label: "사이트",
    async run() {
      const res = await get(missing("/")("site"));
      if (res.status !== 200) return `첫 화면 HTTP ${res.status}`;
      const coop = res.headers.get("cross-origin-opener-policy");
      const coep = res.headers.get("cross-origin-embedder-policy");
      if (coop !== "same-origin" || coep !== "require-corp") {
        return `격리 헤더가 다르다 (COOP=${coop}, COEP=${coep})`;
      }
      const engine = await get("/engine/stockfish.js");
      if (engine.status !== 200) return `엔진 파일 HTTP ${engine.status}`;
      return null;
    },
  },
  {
    name: "backend",
    label: "백엔드",
    async run() {
      const res = await get(missing("/api/me")("backend"));
      return res.status === 200 ? null : `/api/me HTTP ${res.status}`;
    },
  },
  {
    name: "db",
    label: "DB",
    onlyWithDb: true,
    async run() {
      const res = await get(missing("/api/actuator/health")("db"));
      return res.status === 200 ? null : `/api/actuator/health HTTP ${res.status}`;
    },
  },
];

async function get(path) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
  await res.arrayBuffer();
  return res;
}

/** 세 번 해 보고 셋 다 실패하면 마지막 까닭을, 한 번이라도 되면 null 을 돌려준다. */
async function probe(check) {
  let why = null;
  for (let i = 0; i < TRIES; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, WAIT_MS));
    try {
      why = await check.run();
    } catch (err) {
      why = `요청 실패 (${err.name === "TimeoutError" ? `${TIMEOUT_MS / 1000}초 넘음` : err.message})`;
    }
    if (why === null) return null;
  }
  return why;
}

// --- 이슈 ------------------------------------------------------------------

function gh(...ghArgs) {
  const r = spawnSync("gh", ghArgs, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`gh ${ghArgs[0]} ${ghArgs[1]} 실패: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

const MARK = /<!-- watch:failing=([a-z,]*) -->/;
const mark = (names) => `<!-- watch:failing=${[...names].sort().join(",")} -->`;

const kst = (d = new Date()) =>
  d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) + " (한국 시각)";

function recentDeploys() {
  return REPOS.map((repo) => {
    try {
      const line = gh(
        "api",
        `repos/${repo}/commits/main`,
        "--jq",
        '.sha[0:7] + " · " + .commit.committer.date + " · " + (.commit.message | split("\\n")[0])'
      );
      return `- \`${repo}\` ${line}`;
    } catch {
      return `- \`${repo}\` (못 읽음)`;
    }
  }).join("\n");
}

function describe(failing) {
  return failing.map(([name, why]) => `- **${CHECKS.find((c) => c.name === name).label}**: ${why}`).join("\n");
}

function updateIssues(checked, failing) {
  spawnSync("gh", ["label", "create", LABEL, "--color", "B60205", "--description", "감시(watch.yml)가 연 장애"], {
    stdio: "ignore",
  });
  const open = JSON.parse(gh("issue", "list", "--label", LABEL, "--state", "open", "--limit", "1", "--json", "number,body"));
  const issue = open[0] ?? null;
  const before = new Set(issue ? (issue.body.match(MARK)?.[1] ?? "").split(",").filter(Boolean) : []);

  // 이번에 보지 않은 대상(15분 실행의 DB)은 앞의 상태를 그대로 이어 간다.
  const now = new Set([...before].filter((n) => !checked.includes(n)));
  for (const [name] of failing) now.add(name);

  if (!issue && now.size === 0) return "정상, 열린 장애 없음";

  if (!issue) {
    const title = `장애: ${[...now].map((n) => CHECKS.find((c) => c.name === n).label).join("·")}`;
    const body = [
      `${kst()} 에 감시가 실패를 봤다. ${TRIES}번(30초 간격) 다 실패했다.`,
      "",
      describe(failing),
      "",
      "**최근 배포** (main 의 마지막 커밋)",
      recentDeploys(),
      "",
      "회복하면 감시가 이 이슈에 적고 닫는다.",
      "",
      mark(now),
    ].join("\n");
    gh("issue", "create", "--title", title, "--label", LABEL, "--body", body);
    return `장애 이슈를 열었다: ${title}`;
  }

  const same = now.size === before.size && [...now].every((n) => before.has(n));
  if (now.size === 0) {
    gh("issue", "comment", String(issue.number), "--body", `${kst()} 회복했다. 모든 대상이 정상이다.`);
    gh("issue", "close", String(issue.number));
    return `회복, 이슈 #${issue.number} 를 닫았다`;
  }
  if (!same) {
    gh(
      "issue",
      "comment",
      String(issue.number),
      "--body",
      `${kst()} 실패하는 대상이 바뀌었다.\n\n${describe(failing) || "- (이번에 본 대상은 정상, 보지 않은 대상이 아직 실패 중)"}`
    );
    gh("issue", "edit", String(issue.number), "--body", issue.body.replace(MARK, mark(now)));
    return `이슈 #${issue.number} 에 바뀐 것을 적었다`;
  }
  return `장애가 이어진다, 이슈 #${issue.number} 그대로`;
}

// --- 실행 ------------------------------------------------------------------

const targets = CHECKS.filter((c) => withDb || !c.onlyWithDb);
const results = await Promise.all(targets.map(async (c) => [c.name, await probe(c)]));
for (const [name, why] of results) console.log(`${why === null ? "정상" : "실패"}  ${name}${why ? `  ${why}` : ""}`);

const failing = results.filter(([, why]) => why !== null);
if (withIssues) {
  console.log(updateIssues(targets.map((c) => c.name), failing));
}
