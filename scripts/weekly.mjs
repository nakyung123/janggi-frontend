// 주간 지표. 최근 7일과 그 앞 7일을 나란히 찍는다.
//
//   node scripts/weekly.mjs           # 터미널용 표
//   node scripts/weekly.mjs --slack   # Slack 에 올릴 짧은 요약(.github/workflows/weekly-report.yml 이 쓴다)
//
// 운영 통계 API(백엔드 /stats, 사이트의 /api 로 부른다)를 읽기만 한다. 토큰은 STATS_TOKEN
// 환경 변수에서 읽고, 없으면 gcloud 로 Secret Manager(janggi-stats-token)에서 꺼낸다.
// 토큰은 찍지 않는다.
//
// **앞 주는 14일치에서 7일치를 뺀 값이다.** API 가 "지금부터 며칠 전까지" 만 받는다. 방문과
// 깔때기는 방문 단위로 세므로 뺄 수 있다(두 주에 걸친 방문은 이번 주에만 들어간다). 엔진
// 뜨는 시간의 중앙값은 뺄 수 없어 이번 주 것만 찍는다.
//
// **방문은 사람 수가 아니다.** 방문 번호는 쪽을 열 때마다 새로 만든다(src/report/events.ts).
// 새로고침도 방문 하나가 늘어난다.

import { spawnSync } from "node:child_process";

const BASE = "https://janggi-ai.vercel.app/api";
const SECRET = "janggi-stats-token";

/** 깔때기 순서(events.ts 머리 주석). 비율의 분모는 앱 열기다. */
const STEPS = [
  ["app_open", "앱 열기"],
  ["engine_ready", "엔진 준비"],
  ["first_move", "첫 수"],
  ["game_end", "대국 끝"],
  ["game_start", "한 판 더"],
  ["review_open", "복기"],
];

/**
 * 까닭을 말하고 멈춘다. process.exit() 로 바로 끝내지 않는다 - 응답을 다 읽기 전에 끝내면
 * 윈도우의 Node 24 가 UV_HANDLE_CLOSING 단언으로 죽고 종료 코드가 127 이 된다(겪었다).
 */
class Stop extends Error {}
function fail(message) {
  throw new Stop(message);
}

function token() {
  if (process.env.STATS_TOKEN) return process.env.STATS_TOKEN.trim();
  // 윈도우의 gcloud 는 gcloud.cmd 라 셸을 거쳐야 찾는다. 명령은 고정 문자열이다.
  const r = spawnSync(`gcloud secrets versions access latest --secret=${SECRET}`, { encoding: "utf8", shell: true });
  // gcloud 의 오류 글은 옮기지 않는다. 윈도우에서는 시스템 코드 페이지로 와서 깨진다.
  if (r.status !== 0 || !r.stdout.trim()) {
    fail(`STATS_TOKEN 이 없고 gcloud 로도 토큰을 못 읽었다(종료 코드 ${r.status}). gcloud 로그인을 확인한다.`);
  }
  return r.stdout.trim();
}

async function stats(days, key) {
  let res;
  try {
    res = await fetch(`${BASE}/stats?days=${days}`, {
      headers: { "X-Stats-Token": key },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    fail(`통계 API 에 닿지 못했다 (${err.message})`);
  }
  // 통계 API 는 토큰이 틀려도 없는 주소처럼 404 를 준다(백엔드 TokenFilter).
  if (res.status === 404) fail("토큰이 틀렸다(통계 API 는 토큰이 틀리면 404 를 준다).");
  if (res.status === 429) fail("요청 제한(분당 30번)에 걸렸다. 1분 뒤 다시 돌린다.");
  if (res.status !== 200) fail(`통계 API HTTP ${res.status}`);
  return res.json();
}

const kst = (iso) =>
  new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(5, 16).replace("T", " ");

function change(now, before) {
  if (before === 0) return now === 0 ? "같음" : "앞 주 0";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

const pct = (n, d) => (d === 0 ? "-" : `${Math.round((n / d) * 100)}%`);
const sec = (ms) => (ms == null ? "-" : `${(ms / 1000).toFixed(1)}초`);
/** 한글은 터미널에서 두 칸을 차지한다. 글자 수로 채우면 열이 어긋난다. */
const width = (s) => [...s].reduce((n, c) => n + (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - width(String(s))));

function sessionsOf(s, name) {
  return s.funnel.find((f) => f.name === name)?.sessions ?? 0;
}

/**
 * 바깥에서 온 글자를 Slack 글에 넣을 수 있게 다듬는다. "들어온 곳" 이름표는 측정 이벤트의
 * ref 를 그대로 쓴 값이고, 측정 주소는 로그인 없이 누구나 부를 수 있다. 다듬지 않으면 꾸민
 * 값이 채널 전체 알림(<!channel>), 보이는 글과 다른 링크, 가짜 굵은 줄이 되어 올라간다.
 * Slack 문서대로 & < > 를 바꾸고, 줄바꿈·서식 글자(* _ ~ `)를 지우고, 길이를 자른다.
 */
function slackSafe(s, max = 40) {
  const flat = String(s).replace(/[\u0000-\u001f\u007f*_~`]/g, " ").replace(/\s+/g, " ").trim();
  const cut = [...flat].length > max ? [...flat].slice(0, max).join("") + "…" : flat;
  return cut.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Slack 용 요약. 표는 Slack 글꼴에서 열이 어긋나 읽기 어려워서, 사용자가 볼 숫자만 줄로 쓴다.
 * 표본이 0 이면 비율을 0% 로 쓰지 않고 "-" 로 둔다(pct). 깔때기 숫자는 판 수가 아니라 그 단계까지
 * 간 방문 수다(한 방문에서 여러 판을 둬도 하나).
 */
function slackText(week, prevSessions, prev) {
  const day = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(5).replace("-", "/");
  const moved = sessionsOf(week, "first_move");
  const e = week.engine;
  const refs = week.referrers.slice(0, 3).map((r) => `${slackSafe(r.label)} ${r.sessions}`).join(" · ");
  return [
    `:bar_chart: *[장기] 주간 지표*  ${day(week.from)} ~ ${day(week.to)}`,
    `• 방문 *${week.sessions}*  (앞 주 ${prevSessions}, ${change(week.sessions, prevSessions)})`,
    `• 첫 수까지 둔 비율 *${pct(moved, week.sessions)}*  (앞 주 ${pct(prev("first_move"), prevSessions)})`,
    `• 한 판 끝까지 둔 방문 *${sessionsOf(week, "game_end")}* · 복기를 연 방문 *${sessionsOf(week, "review_open")}*`,
    `• 엔진 실패 *${sessionsOf(week, "engine_failed")}* · 엔진 뜨는 시간(중앙) *${e.n === 0 ? "표본 없음" : sec(e.p50)}*`,
    `• 많이 들어온 곳: ${refs || "없음"}`,
    "_방문은 쪽을 연 횟수예요(사람 수 아님). 자세한 표: node scripts/weekly.mjs_",
  ].join("\n");
}

async function main() {
  const key = token();
  const week = await stats(7, key);
  const both = await stats(14, key);

  const prevSessions = both.sessions - week.sessions;
  const prev = (name) => sessionsOf(both, name) - sessionsOf(week, name);

  if (process.argv.includes("--slack")) {
    console.log(slackText(week, prevSessions, prev));
    return;
  }

  const out = [];
  out.push(`최근 7일 ${kst(week.from)} ~ ${kst(week.to)} (한국 시각) vs 그 앞 7일`);
  out.push("");
  out.push(`${pad("방문", 10)}${pad(week.sessions, 6)}앞 주 ${prevSessions} (${change(week.sessions, prevSessions)})`);
  for (const [name, label] of STEPS.slice(1)) {
    const now = sessionsOf(week, name);
    const before = prev(name);
    out.push(
      `${pad(label, 10)}${pad(now, 6)}${pad(pct(now, week.sessions), 6)}앞 주 ${before} ${pct(before, prevSessions)}`
    );
  }
  const failed = sessionsOf(week, "engine_failed");
  out.push(`${pad("엔진 실패", 10)}${pad(failed, 6)}${pad(pct(failed, week.sessions), 6)}앞 주 ${prev("engine_failed")}`);
  out.push("");

  const e = week.engine;
  out.push(
    e.n === 0
      ? "엔진 뜨는 시간  표본 없음"
      : `엔진 뜨는 시간  중앙 ${sec(e.p50)}, 열에 아홉 ${sec(e.p90)}, 가장 느림 ${sec(e.worst)} (n=${e.n})`
  );
  out.push("");

  out.push(`날짜별 방문  ${week.daily.map((d) => `${d.day.slice(5)} ${d.sessions}`).join(" · ")}`);
  out.push("            (기간이 지금 시각에서 7일 전까지라, 맨 앞날과 오늘은 하루 전체가 아닐 수 있다)");
  out.push("");

  const refs = week.referrers;
  const topRefs = refs.slice(0, 5);
  const restRefs = refs.slice(5).reduce((n, r) => n + r.sessions, 0);
  out.push(
    `들어온 곳  ${topRefs.map((r) => `${r.label} ${r.sessions}`).join(" · ")}${restRefs ? ` · 그 밖 ${restRefs}` : ""}`
  );
  out.push("");

  out.push("기기 (방문 · 엔진 준비 · 첫 수)");
  for (const kind of ["브라우저", "OS", "인앱"]) {
    const rows = week.devices.filter((d) => d.kind === kind).sort((a, b) => b.sessions - a.sessions);
    const shown = rows.slice(0, 6);
    const rest = rows.length - shown.length;
    out.push(
      `  ${pad(kind, 10)}${shown.map((d) => `${d.label} ${d.sessions}·${d.engine}·${d.moved}`).join("  ")}${rest > 0 ? `  그 밖 ${rest}줄` : ""}`
    );
  }
  out.push("");
  out.push("오늘과 어제 숫자는 폰 이벤트가 늦게 들어와 바뀔 수 있다. 방문은 쪽을 연 횟수라 사람 수가 아니다.");

  console.log(out.join("\n"));
}

try {
  await main();
} catch (err) {
  if (!(err instanceof Stop)) throw err;
  console.error(`실패: ${err.message}`);
  process.exitCode = 1;
}
