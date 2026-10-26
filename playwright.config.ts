// E2E 설정. 배포용으로 빌드한 앱을 미리보기 서버로 띄우고 진짜 엔진으로 돌린다.
//
//   npx playwright test        빌드 → 미리보기(4173) → 테스트
//
// 미리보기는 vite.config.ts 의 preview 헤더(COOP·COEP·CSP)를 그대로 건다. 그래서 엔진이
// 배포본과 같은 조건에서 뜬다. /api 는 localhost:8080 으로 넘어가는데 E2E 에서는 띄우지
// 않는다. 로그인·기보 올리기는 이 E2E 의 범위가 아니다(운영 DB 에 쓰기 때문).
//
// 엔진 신경망(public/engine)이 있어야 한다. 없으면 npm run fetch-engine 으로 받는다.
//
// 이 파일과 e2e/ 는 tsc -b 에 넣지 않았다. 넣으면 Node 타입이 src 로 섞여 setTimeout 의
// 반환형이 바뀐다(vite.config.ts 의 폴더주소 주석). Playwright 가 실행할 때 직접 읽는다.

import { defineConfig, devices } from "@playwright/test";
import type { IsolationOption } from "./e2e/app-page";

const CI = !!process.env.CI;

// 사용자의 68% 가 폰이고, 사용자 폰 폭이 320 이다.
const phone320 = { ...devices["Desktop Chrome"], viewport: { width: 320, height: 720 }, hasTouch: true };

export default defineConfig<IsolationOption>({
  testDir: "e2e",
  // 로그인·기보 올리기 E2E 는 백엔드·DB·가짜 구글이 있어야 해서 따로 돈다(playwright.server.config.ts).
  testIgnore: "server-flow.spec.ts",
  // 엔진이 수를 두고 복기를 도는 시간까지 넣는다.
  timeout: 120_000,
  // CI 에서 한 번 다시 돈다. 다시 돌아 통과한 것은 보고서에 flaky 로 남는다(간헐 실패).
  retries: CI ? 1 : 0,
  workers: 1,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "폰 320", use: { ...phone320, isolated: true } },
    // 안드로이드 앱 안 브라우저처럼 격리가 안 되는 조건. 단일 스레드 엔진이 뜬다(e2e/app-page.ts).
    { name: "폰 320 · 격리 없음", use: { ...phone320, isolated: false } },
  ],
  webServer: {
    command: "npx vite build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    // 이미 떠 있는 서버를 쓰지 않는다. 쓰게 두었더니 윈도우에서 꺼지지 않고 남은 옛
    // 미리보기 서버를 몰래 써서, 헤더를 바꿔도 반영되지 않은 채 통과했다. 남은 서버가
    // 있으면 --strictPort 때문에 "포트 사용 중" 으로 멈춘다.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
