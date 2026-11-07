// 배우기: 메뉴에서 기물 화면을 열고 기물 하나를 옮긴다. 포진·읽을거리 화면도 연다(파일 아래쪽).
//
// 기물 화면은 엔진을 쓰지 않는다(갈 곳은 src/janggi/moves.ts 가 센다). 그래서 엔진이 뜨기를
// 기다리지 않고 바로 메뉴를 연다. 단위 테스트(src/components/learn/learn.test.tsx)는 jsdom 이라
// CSS 를 읽지 않는다 - 배포용 빌드의 진짜 화면에서 메뉴가 열리고, 판이 눌리고, 320 폭에서
// 넘치지 않는지는 여기서 본다.
//
// Given 폰 폭 320, 배포용 빌드
// When  ☰ 메뉴에서 기물을 연다   Then 기물 화면이 서고, 첫 기물(궁)이 판에 놓여 갈 곳이 찍힌다
// When  차를 고르고 점(45)을 누른다 Then 차가 45 로 가고 처음 자리(65)는 빈다
// 내내: 잡히지 않은 스크립트 오류가 없고, 가로 스크롤이 없다.

import { expect } from "@playwright/test";
import { AppPage, test } from "./app-page";

test("메뉴에서 기물 화면을 열고 차를 한 번 옮긴다", async ({ page }) => {
  const app = new AppPage(page);

  await test.step("☰ 메뉴에서 기물 화면을 연다", async () => {
    await page.goto("/");
    await app.openScreen("기물");
    await expect(page.getByRole("heading", { level: 2, name: "기물" })).toBeVisible();
    await expect(app.cell("95 초 궁"), "첫 기물인 궁이 궁성 가운데에 놓인다").toBeVisible();
    await app.noHorizontalScroll();
  });

  await test.step("차를 고르고 점을 누르면 그리로 옮겨진다", async () => {
    await page.getByRole("group", { name: "기물" }).getByRole("button", { name: "차", exact: true }).click();
    await expect(app.cell("65 초 차")).toBeVisible();
    // 폰은 쪽이 구른다. 누를 교차점을 화면 안으로 들인다(누르는 것은 사람과 같은 자리다).
    await app.cell("45").scrollIntoViewIfNeeded();
    await app.tap("45");
    await expect(app.cell("45 초 차"), "차가 45 에 놓인다").toBeVisible();
    await expect(app.cell("65"), "처음 자리는 빈다").toBeVisible();
    await app.noHorizontalScroll();
  });

  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
});

// 포진: 메뉴에서 열고 양귀상을 처음부터 끝까지 한 수씩 넘긴다.
//
// Given 폰 폭 320, 배포용 빌드
// When  ☰ 메뉴에서 포진을 연다           Then 첫 포진(귀마)의 완성 모양이 선다(86 에 초 마)
// When  양귀상을 고르고 처음으로 간다      Then 처음 차림(84·86 이 빔)
// When  다음을 다섯 번 누른다             Then 84·86 에 초 상이 서고 "완성" 이 붙는다
// 내내: 잡히지 않은 스크립트 오류가 없고, 가로 스크롤이 없다.
test("메뉴에서 포진 화면을 열고 양귀상의 모양 만드는 수를 끝까지 넘긴다", async ({ page }) => {
  const app = new AppPage(page);

  await test.step("☰ 메뉴에서 포진 화면을 연다", async () => {
    await page.goto("/");
    await app.openScreen("포진");
    await expect(page.getByRole("heading", { level: 2, name: "포진" })).toBeVisible();
    await expect(app.cell("86 초 마"), "귀마(마상마상)의 마가 귀에 서 있다").toBeVisible();
    await app.noHorizontalScroll();
  });

  await test.step("양귀상을 처음부터 끝까지 넘긴다", async () => {
    await page.getByRole("group", { name: "포진" }).getByRole("button", { name: "양귀상" }).click();
    await page.getByRole("button", { name: "처음으로" }).click();
    await expect(page.getByText("0/5 · 처음 차림")).toBeVisible();
    await expect(app.cell("84")).toBeVisible();
    await expect(app.cell("86")).toBeVisible();
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByText("5/5 · 07상84 · 완성")).toBeVisible();
    await expect(app.cell("84 초 상")).toBeVisible();
    await expect(app.cell("86 초 상")).toBeVisible();
    await expect(page.getByRole("button", { name: "다음", exact: true })).toBeDisabled();
    await app.noHorizontalScroll();
  });

  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
});

// 읽을거리: 메뉴에서 열고 글 둘을 차례로 열었다 닫는다.
//
// Given 폰 폭 320, 배포용 빌드
// When  ☰ 메뉴에서 읽을거리를 연다       Then 글 제목 둘이 선다
// When  글을 열고 목록으로 돌아온다        Then 글 제목이 서고, 돌아오면 목록이 선다(글마다)
// 내내: 잡히지 않은 스크립트 오류가 없고, 가로 스크롤이 없다.
test("메뉴에서 읽을거리를 열고 글 둘을 읽는다", async ({ page }) => {
  const app = new AppPage(page);
  await page.goto("/");
  await app.openScreen("읽을거리");
  await expect(page.getByRole("heading", { level: 2, name: "읽을거리" })).toBeVisible();
  for (const title of ["상차림 넷은 무엇이 다른가요", "졸은 둘씩 붙여 둡니다"]) {
    await page.getByRole("button", { name: title }).click();
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    await app.noHorizontalScroll();
    await page.getByRole("button", { name: "목록으로" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "읽을거리" })).toBeVisible();
  }
  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
});
