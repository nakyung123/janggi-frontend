// 응답 헤더가 배포본·미리보기·개발 서버에서 같은지, 깨지면 안 되는 값이 그대로인지 본다.
//
// 같은 헤더를 세 곳에 손으로 맞춰 왔다. vercel.json(배포본), vite.config.ts 의
// preview(미리보기)와 server(개발 서버). 한쪽만 바꾸면 로컬에서 본 것이 배포본의 증거가
// 되지 못한다. 그리고 격리 헤더(COOP·COEP)가 빠지면 엔진이 안 뜨는데, 세 곳을 같이
// 바꾸면 비교만으로는 못 잡는다. 그래서 그 값은 따로 적어 두고 본다.
//
//   node scripts/check-headers.mjs                              저장소의 두 파일
//   node scripts/check-headers.mjs <vercel.json> <vite.config.ts>   다른 경로의 파일
//
// vite.config.ts 는 Vite 의 설정 읽기 함수로 읽는다. 파일을 글자로 뜯지 않아서, 값을
// 상수로 나누거나 이어 붙여도 Vite 가 실제로 쓰는 값을 본다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";

const VERCEL = process.argv[2] ?? fileURLToPath(new URL("../vercel.json", import.meta.url));
const VITE = process.argv[3] ?? fileURLToPath(new URL("../vite.config.ts", import.meta.url));

// 세 곳이 함께 바뀌어도 잡는 값. CLAUDE.md "하지 말 것" 에 적힌 것과 같다.
const MUST = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
};
const MUST_CSP = { "connect-src": "'self'" };

// 헤더 이름은 대소문자를 가리지 않으므로 소문자로 맞춘다.
function lower(obj) {
  return Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
}

function vercelHeaders() {
  const json = JSON.parse(readFileSync(VERCEL, "utf8"));
  const all = (json.headers ?? []).find((h) => h.source === "/(.*)");
  return lower(Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value])));
}

async function viteHeaders(env, side) {
  const loaded = await loadConfigFromFile(env, VITE, undefined, "silent");
  return lower(loaded?.config?.[side]?.headers);
}

// "default-src 'self'; connect-src 'self'" 를 { "default-src": "'self'", ... } 로.
function cspDirectives(csp) {
  const out = {};
  for (const part of (csp ?? "").split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name.toLowerCase()] = values.join(" ");
  }
  return out;
}

// 개발 서버는 script-src 에 표식('nonce-...') 하나를 더 연다(vite.config.ts 의 DEV_NONCE).
// 그 표식만 빼면 미리보기와 같아야 한다.
function withoutNonce(csp) {
  return Object.entries(cspDirectives(csp))
    .map(([name, value]) =>
      name === "script-src"
        ? [name, value.split(" ").filter((t) => !t.startsWith("'nonce-")).join(" ")]
        : [name, value],
    )
    .map(([name, value]) => `${name} ${value}`)
    .join("; ");
}

function diff(label, a, b) {
  const problems = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[key] === undefined) problems.push(`${label}: ${key} 가 앞쪽에 없다`);
    else if (b[key] === undefined) problems.push(`${label}: ${key} 가 뒤쪽에 없다`);
    else if (a[key] !== b[key]) problems.push(`${label}: ${key} 가 다르다\n    앞 ${a[key]}\n    뒤 ${b[key]}`);
  }
  return problems;
}

const deploy = vercelHeaders();
const preview = await viteHeaders({ command: "serve", mode: "production", isPreview: true }, "preview");
const dev = await viteHeaders({ command: "serve", mode: "development", isPreview: false }, "server");

const counts = `배포본 ${Object.keys(deploy).length}개, 미리보기 ${Object.keys(preview).length}개, 개발 서버 ${Object.keys(dev).length}개`;

// 하나라도 0개면 읽는 부분이 깨진 것이다. 비교할 것이 없는데 통과시키지 않는다.
if (!Object.keys(deploy).length || !Object.keys(preview).length || !Object.keys(dev).length) {
  console.error(`헤더를 읽지 못했다: ${counts}`);
  process.exit(1);
}
console.log(counts);

const problems = [
  ...diff("배포본(앞)과 미리보기(뒤)", deploy, preview),
  ...diff(
    "미리보기(앞)와 개발 서버(뒤), 표식 뺌",
    { ...preview, "content-security-policy": withoutNonce(preview["content-security-policy"]) },
    { ...dev, "content-security-policy": withoutNonce(dev["content-security-policy"]) },
  ),
];

for (const [where, headers] of [["배포본", deploy], ["미리보기", preview], ["개발 서버", dev]]) {
  for (const [key, want] of Object.entries(MUST)) {
    if (headers[key] !== want) problems.push(`${where}: ${key} 는 ${want} 여야 한다 (지금 ${headers[key] ?? "없음"})`);
  }
  const csp = cspDirectives(headers["content-security-policy"]);
  for (const [name, want] of Object.entries(MUST_CSP)) {
    if (csp[name] !== want) problems.push(`${where}: CSP ${name} 는 ${want} 여야 한다 (지금 ${csp[name] ?? "없음"})`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(p);
  console.error("vercel.json 과 vite.config.ts 를 같은 값으로 맞춘다. 격리 헤더가 빠지면 엔진이 안 뜬다.");
  process.exit(1);
}
console.log("세 곳의 헤더가 같고, 격리 헤더와 connect-src 'self' 가 그대로다.");
