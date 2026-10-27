// E2E 가 쓰는 포트 묶음. 여러 작업 폴더에서 E2E 를 동시에 돌릴 때 서로 부딪치지 않게 한다.
//
//   E2E_SLOT=1 npx playwright test
//
// E2E_SLOT 을 안 주면 0 이고 지금까지의 포트 그대로다(CI 도 이 값). 묶음 번호만큼 모든 포트에 더한다.
//
//   묶음   미리보기  가짜 구글  백엔드  Postgres  DB 컨테이너
//   0      4173      9400       8080    55432     janggi-e2e-db
//   1      4174      9401       8081    55433     janggi-e2e-db-1
//
// 작업 폴더가 다르면 빌드 결과(dist/)·시험 기록(test-results/)도 따로라 포트만 나누면 된다.
// 같은 폴더에서 두 번 동시에 돌리면 dist/ 를 서로 덮어쓴다.
//
// 설정 파일(playwright*.config.ts)과 시험 파일(e2e/*.spec.ts)이 같이 읽는다. 시험 파일은
// 작업 프로세스에서 돌지만 환경 변수를 물려받아 같은 값을 얻는다.

const raw = process.env.E2E_SLOT ?? "0";
const slot = Number(raw);
if (!Number.isInteger(slot) || slot < 0 || slot > 9) {
  throw new Error(`E2E_SLOT 은 0~9 의 정수여야 합니다: "${raw}"`);
}

export const ports = {
  preview: 4173 + slot,
  fakeGoogle: 9400 + slot,
  backend: 8080 + slot,
  db: 55432 + slot,
};

export const dbContainer = slot === 0 ? "janggi-e2e-db" : `janggi-e2e-db-${slot}`;

export const previewURL = `http://localhost:${ports.preview}`;
export const fakeGoogleURL = `http://localhost:${ports.fakeGoogle}`;

/**
 * 배포용으로 빌드해 미리보기로 띄우는 명령. /api 되돌림이 이 묶음의 백엔드로 가도록
 * BACKEND_PORT 를 같이 준다(vite.config.ts).
 */
export const previewServer = {
  command: `npx vite build && npx vite preview --port ${ports.preview} --strictPort`,
  url: previewURL,
  env: { BACKEND_PORT: String(ports.backend) },
};
