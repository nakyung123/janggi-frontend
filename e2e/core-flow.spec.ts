// 핵심 흐름: 진짜 엔진으로 한 판을 두고 복기까지 간다.
//
// 단위 테스트는 엔진을 가짜로 바꿔 끼운다(src/test/fakeEngine.ts). 진짜 엔진(WASM)이
// 브라우저에서 뜨고 수를 두는지는 여기서만 본다. 엔진이 안 뜨면 앱을 쓸 수 없다.
//
// 두 프로젝트로 돈다(playwright.config.ts). 격리가 되면 스레드를 쓰는 엔진, 안 되면 단일
// 스레드 엔진이 뜬다. 어느 쪽이든 같은 흐름이 되어야 한다.
//
// Given 폰 폭 320, 배포용 빌드, 진짜 엔진
// When  한을 잡는다          Then 엔진(초)이 첫 수를 두고 내 차례가 된다
// When  병(43)을 53 으로     Then 병이 옮겨지고, 엔진이 다시 두고 내 차례가 된다
// When  한수쉼을 한다        Then 엔진이 다시 두고 내 차례가 된다
// When  기권한다             Then 결과 창이 뜬다
// When  기보를 보고 복기한다 Then 복기가 끝나 수마다 설명이 붙고, 수는 5개다
// 내내: 격리 여부가 프로젝트와 같고, 잡히지 않은 스크립트 오류가 없고, 가로 스크롤이 없다.

import { expect } from "@playwright/test";
import { AppPage, ENGINE_WAIT, test } from "./app-page";

test("한 판을 두고 기권한 뒤 복기까지 간다", async ({ page, isolated }) => {
  const app = new AppPage(page);

  await test.step("첫 화면에서 엔진이 준비된다", async () => {
    await app.open();
    // 스레드를 쓰는 엔진에는 SharedArrayBuffer 가 필요하고, 그건 격리가 돼야 생긴다.
    expect(await page.evaluate(() => crossOriginIsolated), "교차 출처 격리").toBe(isolated);
    expect(await page.evaluate(() => typeof SharedArrayBuffer !== "undefined"), "SharedArrayBuffer").toBe(
      isolated
    );
    await app.noHorizontalScroll();
  });

  await test.step("한을 잡으면 엔진(초)이 먼저 둔다", async () => {
    await app.side("한").click();
    await expect(app.side("한")).toHaveAttribute("aria-pressed", "true");
    await app.waitMyTurn();
    await expect(app.undo, "수가 하나 생겨 무를 수 있다").toBeEnabled();
  });

  await test.step("병을 한 칸 올리면 엔진이 다시 둔다", async () => {
    await app.tap("43 한 병");
    await app.tap("53");
    await expect(app.cell("53 한 병"), "병이 53 에 놓인다").toBeVisible();
    await expect(app.cell("43"), "43 은 비었다").toBeVisible();
    await app.waitMyTurn();
  });

  await test.step("한수쉼을 하면 엔진이 다시 둔다", async () => {
    await app.pass.click();
    await app.waitMyTurn();
  });

  await test.step("기권하면 결과 창이 뜨고 기보를 연다", async () => {
    await app.resignAndOpenRecord();
  });

  await test.step("복기하면 수마다 설명이 붙는다", async () => {
    await app.reviewDepth("빠름").click();
    await app.startReview.click();
    await expect(app.reviewAgain, "복기가 끝난다").toBeVisible({ timeout: ENGINE_WAIT });
    // 엔진의 수, 나의 병, 엔진의 수, 나의 한수쉼, 엔진의 수
    await expect(page.getByText("5/5수")).toBeVisible();
    await app.noHorizontalScroll();
  });

  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
});

// 엔진이 한 국면을 오래 보는 중에 멈춘다.
//
// 단일 스레드 엔진은 생각하는 중에 stop 을 받지 못해서, 앱이 엔진을 새로 띄워 끊는다
// (src/engine/engine.ts 의 interrupt). 새로 띄운 엔진에 설정과 신경망이 다시 들어가야
// 다음 복기가 된다.
//
// Given 엔진이 한 수를 두고 기권한 기보
// When  "정밀" 복기를 시작하고 1.5초 뒤 중단한다 (한 국면에 200만 노드라 아직 보는 중이다)
// Then  3초 안에 "복기 시작" 이 다시 선다
// When  "빠름" 으로 다시 복기한다
// Then  복기가 끝난다
test("정밀 복기를 중단하면 곧 멈추고, 다시 복기할 수 있다", async ({ page }) => {
  const app = new AppPage(page);
  await app.open();
  await app.side("한").click();
  await app.waitMyTurn();
  await app.resignAndOpenRecord();

  await test.step("정밀 복기 중에 중단하면 3초 안에 멈춘다", async () => {
    await app.reviewDepth("정밀").click();
    await app.startReview.click();
    await expect(app.stopReview).toBeVisible();
    // 엔진이 국면을 보는 도중에 누르려고 기다린다. 화면에는 이 순간을 알리는 표시가 없다.
    await page.waitForTimeout(1_500);
    await app.stopReview.click();
    await expect(app.startReview, "복기 시작이 다시 선다").toBeVisible({ timeout: 3_000 });
  });

  await test.step("다시 복기하면 끝난다", async () => {
    await app.reviewDepth("빠름").click();
    await app.startReview.click();
    await expect(app.reviewAgain, "복기가 끝난다").toBeVisible({ timeout: ENGINE_WAIT });
  });

  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
});
