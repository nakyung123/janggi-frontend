// 혼자 장기: 메뉴에서 열고 쉬움 1번을 풀어, 목록에 푼 표시가 서고 새로고침 뒤에도 남는다.
//
// 혼자 장기 화면은 엔진을 쓰지 않는다(둘 수 있는 수는 규칙 코드가 낸다). 그래서 엔진이 뜨기를
// 기다리지 않고 바로 메뉴를 연다. 단위 테스트(src/components/solo/solo.test.tsx)는 jsdom 이라 CSS 를
// 읽지 않고 브라우저 저장소도 가짜다 - 배포용 빌드의 진짜 화면에서 판이 눌리고, 푼 기록이 진짜
// localStorage 에 남아 새로고침을 넘기고, 320 폭에서 넘치지 않는지는 여기서 본다.
//
// 답은 문제 데이터에서 읽는다. 데이터를 다시 만들어 문제가 바뀌어도 이 시험은 고치지 않는다.
//
// Given 폰 폭 320, 배포용 빌드, 빈 브라우저 저장소
// When  ☰ 메뉴에서 혼자 장기를 열고 쉬움 1번을 연다   Then 규칙 카드와 문제 판이 선다
// When  답대로 잡는 수를 둔다                         Then "하나만 남았습니다. 풀었습니다." 가 선다
// When  목록으로 돌아간다                             Then 1번 줄에 "풂" 이 서고 "1개 풂" 이 된다
// When  새로고침하고 혼자 장기를 다시 연다              Then 1번 줄에 "풂" 이 그대로 있다
// 내내: 잡히지 않은 스크립트 오류가 없고, 가로 스크롤이 없다.

import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import type { SoloPuzzle } from "../src/janggi/solo";
import { splitMove, toJanggiCoord } from "../src/janggi/notation";
import { AppPage, test } from "./app-page";

// src/janggi/solo.ts 를 가져오지 않고 데이터 파일을 직접 읽는다(e2e/mate.spec.ts 와 같은 까닭: Node 의
// ESM 에서 JSON 을 가져오려면 import 속성이 필요하고 앱 코드는 그것을 쓰지 않는다).
const SOLOS: SoloPuzzle[] = JSON.parse(readFileSync(new URL("../src/janggi/solos.json", import.meta.url), "utf8"));
const 첫문제 = SOLOS.find((p) => p.level === 1)!;
const 기물수 = 첫문제.line.length + 1;

const 목록 = (page: Page) => page.getByRole("region", { name: "쉬움" });
const 첫줄 = (page: Page) => 목록(page).getByRole("button", { name: /^1번(,|$)/ });

test("쉬움 1번을 풀면 목록에 푼 표시가 서고 새로고침 뒤에도 남는다", async ({ page }) => {
  const app = new AppPage(page);

  await test.step("☰ 메뉴에서 혼자 장기를 열고 쉬움 1번을 연다", async () => {
    await page.goto("/");
    await app.openScreen("혼자 장기");
    await expect(page.getByRole("heading", { level: 2, name: "혼자 장기" })).toBeVisible();
    await expect(page.getByRole("region", { name: "규칙" })).toBeVisible();
    await expect(첫줄(page)).toHaveAccessibleName(`1번, 기물 ${기물수}개`);
    await app.noHorizontalScroll();

    await 첫줄(page).click();
    await expect(page.getByRole("heading", { level: 2, name: "쉬움 · 1번" })).toBeVisible();
    await expect(page.getByText("상대 편 기물을 잡아 하나만 남기세요.")).toBeVisible();
    await app.noHorizontalScroll();
  });

  await test.step("답대로 잡는 수를 두면 하나만 남아 풀린다", async () => {
    for (const move of 첫문제.line) {
      const { from, to } = splitMove(move);
      // 폰은 쪽이 구른다. 누를 교차점을 화면 안으로 들인다(누르는 것은 사람과 같은 자리다).
      for (const square of [from, to]) {
        const cell = page
          .getByRole("grid", { name: "장기판" })
          .getByRole("gridcell", { name: new RegExp(`^${toJanggiCoord(square)}( |$)`) });
        await cell.scrollIntoViewIfNeeded();
        await app.tapAt(toJanggiCoord(square));
      }
    }
    await expect(page.getByText("하나만 남았습니다. 풀었습니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: "다음 문제" })).toBeVisible();
    await app.noHorizontalScroll();
  });

  await test.step("목록으로 돌아가면 1번에 푼 표시가 선다", async () => {
    await app.backToList.click();
    await expect(첫줄(page)).toHaveAccessibleName(`1번, 풂, 기물 ${기물수}개`);
    await expect(목록(page).getByText("12문제 · 1개 풂")).toBeVisible();
  });

  await test.step("새로고침한 뒤 다시 열어도 푼 표시가 남아 있다", async () => {
    await page.reload();
    await app.openScreen("혼자 장기");
    await expect(첫줄(page)).toHaveAccessibleName(`1번, 풂, 기물 ${기물수}개`);
    await app.noHorizontalScroll();
  });

  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
});
