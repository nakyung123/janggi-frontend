// 내 실수 문제: 진짜 엔진으로 한 판을 두고 복기한 뒤, 내 큰 실수 자리를 문제로 다시 푼다.
//
// 단위 테스트(src/components/mistakes/mistakes.test.tsx)는 가짜 엔진이다. 진짜 엔진이 복기에서 내 수를
// 큰 실수로 매기고, 이 화면이 그 자리의 합법수를 받아 판을 열고, 내가 둔 수를 시간 안에 재는지는 여기서 본다.
//
// 큰 실수는 첫 수 한수쉼으로 만든다. 시작 국면에서 초의 첫 수 가운데 복기 '빠름'(10만 노드)이 큰 실수로
// 매기는 수는 한수쉼 하나뿐이었다(2026-11-09 엔진 1.1.12 로 첫 수를 모두 잼: 한수쉼 47%p, 나머지는 6%p
// 아래). 한이 따라 쉬면 점수(덤)로 한이 이긴다.
//
// AI 의 수는 앱이 저장한 복기에서 읽는다. 엔진이 고르는 수가 바뀌어도 이 시험은 고치지 않는다.
//
// Given 폰 폭 320, 배포용 빌드, 진짜 엔진, 초를 잡은 새 판
// When  첫 수로 한수쉼을 두고, 판이 끝나지 않았으면 기권한다   Then 결과 창에서 기보를 연다
// When  '빠름' 으로 복기한다                                    Then 복기가 끝난다
// When  ☰ 메뉴에서 내 실수 문제를 열고 1번째 수를 연다          Then "그때 둔 한수쉼은 큰 실수였습니다." 가 선다
// When  복기의 AI 의 수를 둔다                                  Then "맞았습니다. AI의 수와 같습니다."
// When  다시 풀기 뒤 다른 졸 수를 둔다                          Then AI 가 그 수를 재서 판정이 선다
// 내내: 잡히지 않은 스크립트 오류가 없고, 가로 스크롤이 없다.

import { expect, type Page } from "@playwright/test";
import { splitMove, toJanggiCoord } from "../src/janggi/notation";
import { AppPage, ENGINE_WAIT, test } from "./app-page";

/** 판 칸을 화면 안으로 들인 뒤 누른다(폰은 쪽이 구른다). */
async function 둔다(page: Page, app: AppPage, move: string) {
  const { from, to } = splitMove(move);
  for (const square of [from, to]) {
    const coord = toJanggiCoord(square);
    await page
      .getByRole("grid", { name: "장기판" })
      .getByRole("gridcell", { name: new RegExp(`^${coord}( |$)`) })
      .scrollIntoViewIfNeeded();
    await app.tapAt(coord);
  }
}

/**
 * 판 아래 알림 줄. role="status" 는 쪽에 둘 있어(App 의 화면 읽기 알림) 이름 없이는 가려지지 않는다.
 * 그리는 데 쓰는 클래스로 찾는다(app-page.ts 의 aiArrow 와 같다).
 */
const 알림 = (page: Page) => page.locator("p.mate-note");

test("한 판을 두고 복기한 뒤 내 큰 실수 자리를 문제로 푼다", async ({ page }) => {
  const app = new AppPage(page);

  await test.step("첫 수로 한수쉼을 두고 판을 끝내 기보를 연다", async () => {
    await app.open();
    await app.waitMyTurn();
    await app.pass.click();
    // 엔진이 두면 내 차례, 엔진도 쉬면 판이 끝나 결과 창이 뜬다.
    await expect
      .poll(async () => (await app.result.isVisible()) || (await app.pass.isEnabled()), { timeout: ENGINE_WAIT })
      .toBe(true);
    if (await app.result.isVisible()) await app.result.getByRole("button", { name: "기보 보기" }).click();
    else await app.resignAndOpenRecord();
  });

  await test.step("빠름으로 복기한다", async () => {
    await app.reviewDepth("빠름").click();
    await app.startReview.click();
    await expect(app.reviewAgain, "복기가 끝난다").toBeVisible({ timeout: ENGINE_WAIT });
  });

  const best = await page.evaluate(() => {
    const games = JSON.parse(localStorage.getItem("janggi:games") ?? "[]");
    return games[0].reviewed[0] as { best: string; grade: string; played: string };
  });
  expect(best.grade, "첫 수 한수쉼이 큰 실수로 매겨졌다").toBe("blunder");

  await test.step("내 실수 문제에서 그 자리를 연다", async () => {
    await app.openScreen("내 실수 문제");
    await expect(page.getByRole("heading", { level: 2, name: "내 실수 문제" })).toBeVisible();
    await app.noHorizontalScroll();
    await page.getByRole("button", { name: "1번째 수", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "1번째 수" })).toBeVisible();
    await expect(알림(page)).toHaveText(/^그때 둔 .+ 큰 실수였습니다\. 더 나은 수를 찾아보세요\.$/, { timeout: ENGINE_WAIT });
    await app.noHorizontalScroll();
  });

  await test.step("복기의 AI 의 수를 두면 맞았다", async () => {
    await 둔다(page, app, best.best);
    await expect(알림(page)).toHaveText("맞았습니다. AI의 수와 같습니다.");
    // toBeVisible 로 보지 않는다. 가로·세로로 곧은 수는 선의 상자 폭이나 높이가 0 이라 Playwright 가
    // "보이지 않음" 으로 읽는다(2026-11-09 격리 없음 쪽에서 i4h4 화살표가 캡처에는 보이는데 실패했다).
    await expect(app.aiArrow).toBeAttached();
    await app.noHorizontalScroll();
  });

  await test.step("다시 풀어 다른 졸 수를 두면 AI 가 재서 판정한다", async () => {
    await page.getByRole("button", { name: "다시 풀기" }).click();
    await expect(알림(page)).toHaveText(/큰 실수였습니다/);
    // 초의 졸 수 가운데 AI 의 수가 아닌 것. 시작 국면에서 졸은 모두 앞이나 옆으로 갈 수 있다.
    const other = ["c4c5", "g4g5", "e4e5"].find((m) => m !== best.best)!;
    await 둔다(page, app, other);
    await expect(알림(page)).toHaveText(/^(맞았습니다\. 좋은 수입니다|아쉬운 수입니다|큰 실수입니다)\./, {
      timeout: ENGINE_WAIT,
    });
    await expect(page.getByRole("button", { name: "기보에서 보기" })).toBeVisible();
    await app.noHorizontalScroll();
  });

  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
});
