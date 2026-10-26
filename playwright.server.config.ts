// 로그인·기보 올리기 E2E 설정. 운영에 닿지 않게 전부 이 컴퓨터(또는 CI)에서 띄웠다가 끈다.
//
//   npx playwright test -c playwright.server.config.ts
//
//   브라우저 → 프론트 미리보기(4173) → /api → 백엔드 jar(8080) → Postgres(Docker, 55432)
//                   └──── 가짜 구글(9400) ←───────┘
//
// 필요한 것: Docker, Java 21, 빌드한 백엔드 jar(janggi-events 에서 ./gradlew bootJar).
// jar 는 옆 폴더(../janggi-events/build/libs)에서 찾는다. 다른 곳이면 BACKEND_JAR 로 준다.
// CI 는 Postgres 를 서비스로 띄우므로 E2E_DB_READY=1 을 주면 Docker 로 띄우지 않는다.
//
// 진짜 구글은 자동으로 움직이는 브라우저의 로그인을 막는다. 그래서 구글만 가짜(e2e/fake-google.mjs)다.
// 백엔드 코드는 그대로이고, 구글 주소·돌아올 주소·DB 만 환경 변수로 바꾼다.
//
// 로컬에서 끝난 뒤 DB 컨테이너가 남을 수 있다(윈도우에서 Playwright 가 docker 명령을 강제로
// 끄면 컨테이너는 남는다). 다음 실행이 시작할 때 지우고 새로 띄운다.

import { defineConfig, devices } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const CI = !!process.env.CI;

const FAKE_GOOGLE = "http://localhost:9400";
const DB_PORT = 55432;

function backendJar(): string {
  if (process.env.BACKEND_JAR) return process.env.BACKEND_JAR;
  const dir = join("..", "janggi-events", "build", "libs");
  const jar = readdirSync(dir).find((f) => /^janggi-backend-.*\.jar$/.test(f) && !f.includes("plain"));
  if (!jar) throw new Error(`백엔드 jar 가 없습니다: ${dir}. janggi-events 에서 ./gradlew bootJar 를 돌리세요.`);
  return join(dir, jar);
}

/** 백엔드가 받는 설정. 값은 이 실행에서만 쓰는 시험용이다. 운영 값이 아니다. */
const backendEnv = {
  PORT: "8080",
  SPRING_DATASOURCE_URL: `jdbc:postgresql://localhost:${DB_PORT}/e2e`,
  SPRING_DATASOURCE_USERNAME: "postgres",
  SPRING_DATASOURCE_PASSWORD: "e2e",
  GOOGLE_CLIENT_ID: "e2e-client",
  GOOGLE_CLIENT_SECRET: "e2e-secret",
  JANGGI_TOKEN_SECRET: randomBytes(32).toString("hex"),
  SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_GOOGLE_ISSUER_URI: FAKE_GOOGLE,
  SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_REDIRECT_URI:
    "http://localhost:4173/api/login/oauth2/code/google",
};

const DB_CONTAINER = "janggi-e2e-db";
const useDockerDb = !process.env.E2E_DB_READY;

/*
 * 지난 실행이 남긴 DB 컨테이너를 지운다. 명령 한 줄에 "지우고 띄우기" 를 묶으면 윈도우 cmd 와
 * 리눅스 sh 가 || · && 를 다르게 읽어서 여기서 따로 한다.
 *
 * 이 파일은 테스트를 돌리는 작업 프로세스에서도 다시 읽힌다. 거기서 지우면 시험 도중에 DB 가
 * 사라지므로 맨 처음 프로세스(TEST_WORKER_INDEX 가 없다)에서만 지운다.
 */
if (useDockerDb && process.env.TEST_WORKER_INDEX === undefined) {
  spawnSync("docker", ["rm", "-f", DB_CONTAINER], { stdio: "ignore" });
  // 윈도우의 Docker 는 컨테이너를 지우고도 포트를 0.7초쯤 더 쥔다(쟀다). 그사이 Playwright 가
  // "포트를 이미 쓰고 있다" 며 멈춘다. 이 파일은 동기로 읽히므로 Node 를 하나 띄워 풀릴 때까지 기다린다.
  spawnSync(
    process.execPath,
    [
      "-e",
      `const net=require("net"),end=Date.now()+15000;
       (function check(){const s=net.connect(${DB_PORT},"127.0.0.1");
         s.once("connect",()=>{s.destroy();if(Date.now()<end)setTimeout(check,100)});
         s.once("error",()=>{});})();`,
    ],
    { stdio: "ignore" }
  );
}

const db = {
  command:
    `docker run --rm --name ${DB_CONTAINER} -p ${DB_PORT}:5432 ` +
    "-e POSTGRES_PASSWORD=e2e -e POSTGRES_DB=e2e postgres:18-alpine",
  port: DB_PORT,
  reuseExistingServer: false,
  timeout: 120_000,
};

export default defineConfig({
  testDir: "e2e",
  testMatch: "server-flow.spec.ts",
  timeout: 180_000,
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
    {
      name: "폰 320 · 서버",
      use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 720 }, hasTouch: true },
    },
  ],
  webServer: [
    ...(useDockerDb ? [db] : []),
    {
      command: "node e2e/fake-google.mjs 9400",
      url: `${FAKE_GOOGLE}/.well-known/openid-configuration`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // 백엔드는 처음 연결할 때 Flyway 로 표를 만든다. DB 가 뜰 때까지 연결을 기다린다(Hikari 30초).
      command: `java -jar "${backendJar()}"`,
      url: "http://localhost:8080/actuator/health",
      env: backendEnv,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: "npx vite build && npx vite preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
