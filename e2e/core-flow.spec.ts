// 핵심 흐름: 진짜 엔진으로 한 판을 두고 복기까지 간다.
//
// 단위 테스트는 엔진을 가짜로 바꿔 끼운다(src/test/fakeEngine.ts). 진짜 엔진(WASM)이
// 브라우저에서 뜨고 수를 두는지는 여기서만 본다. 엔진이 안 뜨면 앱을 쓸 수 없다.
//
// Given 폰 폭 320, 배포용 빌드, 진짜 엔진
// When  한을 잡는다          Then 엔진(초)이 첫 수를 두고 내 차례가 된다
// When  한수쉼을 한다        Then 엔진이 다시 두고 내 차례가 된다
// When  기권한다             Then 결과 창이 뜬다
// When  기보를 보고 복기한다 Then 복기가 끝나 수마다 설명이 붙고, 수는 3개다
// 내내: 교차 출처 격리가 켜져 있고, 잡히지 않은 스크립트 오류가 없고, 가로 스크롤이 없다.

import { expect, test } from "@playwright/test";
import { AppPage, ENGINE_WAIT } from "./app-page";

test("한 판을 두고 기권한 뒤 복기까지 간다", async ({ page }) => {
  const app = new AppPage(page);

  await test.step("첫 화면에서 엔진이 준비된다", async () => {
    await app.open();
    // 엔진이 멀티스레드로 돌려면 SharedArrayBuffer 가 필요하고, 그건 격리 헤더가 있어야 열린다.
    expect(await page.evaluate(() => crossOriginIsolated), "교차 출처 격리").toBe(true);
    await app.noHorizontalScroll();
  });

  await test.step("한을 잡으면 엔진(초)이 먼저 둔다", async () => {
    await app.side("한").click();
    await expect(app.side("한")).toHaveAttribute("aria-pressed", "true");
    await app.waitMyTurn();
    await expect(app.undo, "수가 하나 생겨 무를 수 있다").toBeEnabled();
  });

  await test.step("한수쉼을 하면 엔진이 다시 둔다", async () => {
    await app.pass.click();
    await app.waitMyTurn();
  });

  await test.step("기권하면 결과 창이 뜬다", async () => {
    await app.resign.click();
    await expect(app.confirm).toBeVisible();
    await app.confirm.getByRole("button", { name: "기권", exact: true }).click();
    await expect(app.result).toBeVisible();
  });

  await test.step("기보를 열어 복기하면 수마다 설명이 붙는다", async () => {
    await app.result.getByRole("button", { name: "기보 보기" }).click();
    await page.getByRole("button", { name: "빠름", exact: true }).click();
    await page.getByRole("button", { name: "복기 시작" }).click();
    await expect(page.getByRole("button", { name: "다시 복기" }), "복기가 끝난다").toBeVisible({
      timeout: ENGINE_WAIT,
    });
    // 엔진의 수, 나의 한수쉼, 엔진의 수
    await expect(page.getByText("3/3수")).toBeVisible();
    await app.noHorizontalScroll();
  });

  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
});
