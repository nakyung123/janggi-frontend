// 로그인·기보 올리기: 둔 판이 서버에 남고, 다른 기기에서 보이고, 남에게는 안 보이고, 탈퇴하면 로그인이 풀린다.
//
// 이 파일만 백엔드·DB·가짜 구글과 함께 돈다(playwright.server.config.ts). 모두 이 컴퓨터(또는
// CI)에서 띄운 것이라 운영 DB 에 닿지 않는다. **구글만 가짜다**(e2e/fake-google.mjs) - 진짜
// 구글은 자동으로 움직이는 브라우저의 로그인을 막는다. 진짜 구글 로그인 화면은 사람이 가끔 본다.
//
// "다른 기기" 는 새 브라우저 문맥이다(기기 저장소·쿠키가 비어 있다). 사람마다 sub 를 새로 만든다.
//
// Given 빈 DB, 가짜 구글
// When  A 로 로그인한다                     Then 로그아웃이 선다(로그인됨)
// When  한 판 두고 기권한다                 Then 목록에 그 판이 있고 "이 기기에만 있음" 이 없다
// When  다른 기기에서 A 로 로그인한다       Then 같은 판이 "다른 기기에서 둔 판" 으로, 같은 수 개수로 보인다
// When  또 다른 기기에서 B 로 로그인한다    Then A 의 판이 보이지 않는다
// When  A 가 탈퇴한다                       Then 그 기기는 로그아웃되고 이미 받은 판은 남는다.
//                                                첫 기기를 다시 열면 그쪽 로그인도 풀려 있다
//
// 서버에서 판이 실제로 지워지는지는 화면으로 가릴 수 없다(로그아웃된 화면과 같다). 그건
// 백엔드 테스트(janggi-events 의 탈퇴·정리 테스트)가 본다.

import { expect, type APIRequestContext, type Browser } from "@playwright/test";
import { AppPage, ENGINE_WAIT, test } from "./app-page";

const FAKE_GOOGLE = "http://localhost:9400";

/** 가짜 구글이 다음 로그인을 이 사람으로 하게 하고, 로그인을 누른다. */
async function signIn(request: APIRequestContext, app: AppPage, sub: string) {
  const res = await request.post(`${FAKE_GOOGLE}/e2e/next-user?sub=${encodeURIComponent(sub)}`);
  expect(res.ok(), "가짜 구글에 다음 사람을 알렸다").toBe(true);
  await app.login.click();
  // 쪽이 구글을 거쳐 돌아오면 엔진을 다시 띄운다. 헤더는 엔진이 뜬 뒤에 선다.
  await expect(app.logout, "로그인되어 로그아웃이 선다").toBeVisible({ timeout: ENGINE_WAIT });
}

/** 새 기기. 저장소와 쿠키가 빈 브라우저 문맥에 같은 폭으로 연다. */
async function newDevice(browser: Browser): Promise<AppPage> {
  const context = await browser.newContext({
    baseURL: "http://localhost:4173",
    viewport: { width: 320, height: 720 },
    hasTouch: true,
  });
  const app = new AppPage(await context.newPage());
  await app.open();
  return app;
}

test("둔 판이 서버에 남고, 다른 기기에서 보이고, 남에게는 안 보이고, 탈퇴하면 로그인이 풀린다", async ({
  page,
  browser,
  request,
}) => {
  const run = Date.now();
  const A = `e2e-a-${run}`;
  const B = `e2e-b-${run}`;
  const app = new AppPage(page);
  let moves = "";

  await test.step("A 로 로그인한다", async () => {
    await app.open();
    await signIn(request, app, A);
  });

  await test.step("한 판 두고 기권하면 서버에 올라간다", async () => {
    await app.side("한").click();
    await app.waitMyTurn();
    await app.resignAndOpenRecord();
    await app.backToList.click();
    await expect(app.gameCards).toHaveCount(1);
    const card = app.gameCards.first();
    await expect(card, "서버에 올라가 '이 기기에만 있음' 이 없다").not.toContainText("이 기기에만 있음");
    moves = (await card.textContent())?.match(/(\d+)수/)?.[1] ?? "";
    expect(moves, "카드에 수 개수가 있다").not.toBe("");
  });

  const second = await newDevice(browser);

  await test.step("다른 기기에서 A 로 로그인하면 같은 판이 보인다", async () => {
    await signIn(request, second, A);
    await second.openGamesTab();
    await expect(second.gameCards).toHaveCount(1);
    const card = second.gameCards.first();
    await expect(card).toContainText("다른 기기에서 둔 판");
    await expect(card).toContainText(`${moves}수`);
    // 열면 서버에서 내용을 받아 온다. 마지막 수에 서서 같은 수 개수를 말한다.
    await card.getByRole("button").click();
    await expect(second.page.getByText(`${moves}/${moves}수`)).toBeVisible();
    await second.backToList.click();
  });

  await test.step("B 로 로그인하면 A 의 판이 보이지 않는다", async () => {
    const third = await newDevice(browser);
    await signIn(request, third, B);
    await third.openGamesTab();
    await expect(third.emptyList).toBeVisible();
    await expect(third.gameCards).toHaveCount(0);
    expect(third.errors, "B 기기의 스크립트 오류").toEqual([]);
  });

  await test.step("A 가 탈퇴하면 이 기기의 판은 남고, 다른 기기의 로그인도 풀린다", async () => {
    await second.withdraw();
    await expect(second.login, "로그인이 다시 선다").toBeVisible();
    // 열어 본 판은 이 기기 목록에 들어왔다(App.tsx 의 openArchived). 묻는 줄의 말대로 남는다.
    await expect(second.gameCards, "이 기기의 기보는 그대로 남는다").toHaveCount(1);

    // 탈퇴는 그 사람의 모든 로그인 쿠키를 무효로 한다. 첫 기기를 다시 열면 로그아웃 상태다.
    await app.open();
    await expect(app.login, "첫 기기의 로그인도 풀렸다").toBeVisible();
  });

  expect(app.errors, "첫 기기의 스크립트 오류").toEqual([]);
  expect(second.errors, "둘째 기기의 스크립트 오류").toEqual([]);
});
