// 분석판: 국면을 만들어 두어 보고, 진짜 엔진이 형세·추천 수를 보이며, 외통 국면을 끝난 판으로 적는다.
//
// 단위 테스트(src/App.test.tsx "분석판")는 가짜 엔진이다. 진짜 엔진이 분석판의 국면(시작 FEN 이 처음
// 차림이 아닌 판)을 받아 합법수와 추천 수(MultiPV 3)를 내는지, 320 폭에서 기물 칸·조작 줄이 넘치지
// 않는지는 여기서 본다. 격리 없는 브라우저(단일 스레드 엔진)에서도 돈다(playwright.config.ts).
//
// Given 폰 폭 320, 배포용 빌드
// When  ☰ 메뉴에서 분석판을 연다              Then 처음 차림의 추천 수가 선다
// When  빈 판에 초 궁·한 궁·초 차를 놓는다     Then 승률·추천 수와 판의 화살표가 선다(궁성 밖 궁은 안 놓인다)
// When  두어 보기에서 초 차, 한 궁을 둔다      Then 두 쪽 다 엔진의 합법수로 둬진다
// When  한 궁이 외통인 국면을 만들고 둬 본다   Then 상태 줄이 외통을 적는다
// 내내: 잡히지 않은 스크립트 오류가 없고, 가로 스크롤이 없다.

import { expect, type Page } from "@playwright/test";
import { AppPage, ENGINE_WAIT, test } from "./app-page";

const 단추 = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const 추천수 = (page: Page) => page.locator(".analysis-lines li");

/** 기보 좌표("95")의 교차점을 누른다. 폰은 쪽이 구르므로 먼저 화면 안으로 들인다. */
async function 누름(page: Page, app: AppPage, coord: string) {
  const cell = page
    .getByRole("grid", { name: "장기판" })
    .getByRole("gridcell", { name: new RegExp(`^${coord}( |$)`) });
  await cell.scrollIntoViewIfNeeded();
  await app.tapAt(coord);
}

/**
 * 둘 차례인 쪽의 기물을 집을 수 있을 때까지 기다린다. 수를 둔 직후에는 엔진이 새 국면의 합법수를
 * 알려 주기 전이라 기물이 집히지 않는다(사람에게도 같다). 단일 스레드 엔진은 엔진을 새로 띄워
 * 탐색을 끊으므로 조금 더 걸린다.
 */
async function 둘수있음(page: Page, coord: string) {
  await expect(page.locator(".piece:not(.fixed)").first()).toBeVisible({ timeout: ENGINE_WAIT });
  await expect(page.getByRole("gridcell", { name: new RegExp(`^${coord} `) })).toHaveCount(1);
}

/** 기물 칸에서 쪽과 기물을 고르고 그 자리에 놓는다. */
async function 놓기(page: Page, app: AppPage, side: "초" | "한", piece: string, coord: string) {
  await 단추(page, `${side} 기물`).click();
  await 단추(page, piece).click();
  await 누름(page, app, coord);
}

test("분석판에서 국면을 만들어 두어 보고, AI 가 형세와 추천 수를 보인다", async ({ page }) => {
  const app = new AppPage(page);

  await test.step("☰ 메뉴에서 분석판을 열면 처음 차림의 추천 수가 선다", async () => {
    await page.goto("/");
    await app.openScreen("분석판");
    await expect(page.getByRole("heading", { level: 2, name: "분석판" })).toBeVisible();
    await expect(추천수(page).first()).toBeVisible({ timeout: ENGINE_WAIT });
    await app.noHorizontalScroll();
  });

  await test.step("빈 판에 궁 둘과 차 하나를 놓으면 AI 가 본다", async () => {
    await 단추(page, "빈 판").click();
    await expect(page.getByText("초의 궁이 없습니다.")).toBeVisible();
    await expect(단추(page, "두어 보기")).toBeDisabled();

    await 놓기(page, app, "초", "궁", "55"); // e5 - 궁성 밖
    await expect(page.getByText("궁은 궁성 안에만 놓을 수 있습니다.")).toBeVisible();
    await 누름(page, app, "95"); // e2
    await 놓기(page, app, "한", "궁", "14"); // d10
    await 놓기(page, app, "초", "차", "01"); // a1

    await expect(page.locator(".analysis-problems")).toHaveCount(0);
    await expect(page.getByText(/^초 \d+%$/).first()).toBeVisible({ timeout: ENGINE_WAIT });
    await expect(추천수(page).first()).toBeVisible();
    await expect(app.aiArrow).toHaveCount(1);
    await app.noHorizontalScroll();
  });

  await test.step("두어 보기에서 초와 한이 차례로 둔다", async () => {
    await 단추(page, "두어 보기").click();
    await 둘수있음(page, "01");
    await 누름(page, app, "01");
    await 누름(page, app, "91"); // 차 a1 → a2
    await expect(page.locator(".analysis-state")).toHaveText("한 차례");
    await 둘수있음(page, "14");
    await 누름(page, app, "14");
    await 누름(page, app, "15"); // 궁 d10 → e10
    await expect(page.locator(".analysis-state")).toHaveText(/^초 차례/);
    await expect(app.cell("15 한 궁")).toHaveCount(1);
    await app.noHorizontalScroll();
  });

  await test.step("한 궁이 외통인 국면을 만들면 두어 보기가 외통을 적는다", async () => {
    await 단추(page, "국면 만들기").click();
    await 단추(page, "빈 판").click();
    await 놓기(page, app, "한", "궁", "14"); // d10
    await 놓기(page, app, "초", "차", "64"); // d5
    await 누름(page, app, "65"); // e5
    await 놓기(page, app, "초", "궁", "06"); // f1
    await page.getByRole("group", { name: "둘 차례" }).getByRole("button", { name: "한" }).click();
    await expect(page.locator(".analysis-problems")).toHaveCount(0);

    await 단추(page, "두어 보기").click();
    await expect(page.locator(".analysis-state")).toHaveText("외통 - 초가 이겼습니다.", { timeout: ENGINE_WAIT });
    await expect(app.aiArrow).toHaveCount(0);
    await app.noHorizontalScroll();
  });

  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
});
