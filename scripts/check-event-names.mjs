// 프론트가 보내는 측정 이벤트 이름이 서버가 받는 목록에 모두 있는지 본다.
//
// 서버(janggi-backend 의 EventName.java)는 모르는 이름을 400 으로 거절하고, 프론트는
// sendBeacon 이라 답을 읽지 않는다. 그래서 둘이 어긋나면 오류 없이 기록만 버려진다.
// 두 목록이 다른 저장소에 있어 손으로 맞춰 왔다.
//
//   node scripts/check-event-names.mjs            서버 main 의 파일을 GitHub 에서 받아 비교
//   node scripts/check-event-names.mjs <경로>      내 컴퓨터의 EventName.java 와 비교
//
// 서버 main 은 푸시하면 바로 배포되므로, 여기서 통과하면 배포된 서버도 그 이름을 받는다.
// 서버에만 있는 이름은 실패로 보지 않는다(서버를 먼저 배포하는 순서가 그 모양이다).

import { readFileSync } from "node:fs";

const SERVER_URL =
  "https://raw.githubusercontent.com/nakyung123/janggi-backend/main/src/main/java/com/nakyung/janggi/event/EventName.java";

function frontNames() {
  const src = readFileSync(new URL("../src/report/events.ts", import.meta.url), "utf8");
  const m = src.match(/type EventName =([^;]*);/);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
}

// APP_OPEN("app_open"), 처럼 생긴 줄에서 따옴표 안의 글자만 뽑는다.
function serverNames(java) {
  return [...java.matchAll(/^\s*[A-Z][A-Z0-9_]*\("([^"]+)"\)/gm)].map((x) => x[1]);
}

async function serverSource(path) {
  if (path) return readFileSync(path, "utf8");
  const res = await fetch(SERVER_URL);
  if (!res.ok) throw new Error(`서버 목록을 받지 못했다: HTTP ${res.status}`);
  return res.text();
}

const front = frontNames();
const server = serverNames(await serverSource(process.argv[2]));

// 하나라도 0개면 읽는 부분이 깨진 것이다. 비교할 것이 없는데 통과시키지 않는다.
if (front.length === 0 || server.length === 0) {
  console.error(`이름을 읽지 못했다: 프론트 ${front.length}개, 서버 ${server.length}개`);
  process.exit(1);
}

const missing = front.filter((n) => !server.includes(n));
const serverOnly = server.filter((n) => !front.includes(n));
console.log(`프론트 ${front.length}개, 서버 ${server.length}개`);
if (serverOnly.length) console.log(`서버에만 있는 이름(문제 아님): ${serverOnly.join(", ")}`);

if (missing.length) {
  console.error(`서버가 모르는 이름: ${missing.join(", ")}`);
  console.error("서버(janggi-backend)의 EventName.java 에 먼저 더하고 배포한다. 그 전에 보내면 버려진다.");
  process.exit(1);
}
console.log("프론트가 보내는 이름은 모두 서버 목록에 있다.");
