// 끝내기: 목록에서 국면을 골라 진짜 엔진(AI)과 이어 두고, 끝나면 결과와 [다시 하기]가 선다.
//
// 단위 테스트(src/App.test.tsx "끝내기")는 가짜 엔진이다. 진짜 엔진이 끝내기 국면(시작 FEN 이 처음
// 차림이 아닌 판, 현대 규칙)을 받아 합법수·AI 의 수·힌트를 내는지, 320 폭에서 목록·판 조작 줄·결과가
// 넘치지 않는지는 여기서 본다. 격리 없는 브라우저(단일 스레드 엔진)에서도 돈다(playwright.config.ts).
//
// Given 폰 폭 320, 배포용 빌드
// When  ☰ 메뉴를 연다                            Then 연습 아래 끝내기·국면 연습이 선다
// When  끝내기 첫 국면을 열고 힌트의 수를 따라 둔다  Then AI 가 응수하고, 판이 끝나면 결과 줄과 [다시 하기]
// When  [다시 하기]                               Then 시작 국면이 다시 선다
// 내내: 잡히지 않은 스크립트 오류가 없고, 가로 스크롤이 없다.
//
// 힌트를 따라 두므로 이 판은 깬 국면으로 남지 않는다(힌트를 쓴 판). 이뤘는지는 엔진 세기에 달려서 여기서
// 따지지 않는다 - 결과 줄이 서는지만 본다. 데이터의 국면이 이룰 수 있는지는 scripts/endgame-data.mjs 가 봤다.

import { expect, type Page } from "@playwright/test";
import { AppPage, ENGINE_WAIT, test } from "./app-page";
import { parseFen } from "../src/janggi/board";
import { readFileSync } from "node:fs";
import type { EndgamePosition } from "../src/janggi/endgame";

/*
 * 데이터는 파일로 읽는다. Node 는 JSON 을 모듈로 들이려면 표시(with { type: "json" })를 요구하는데,
 * src/janggi/endgame.ts 는 앱 번들(Vite)이 읽는 대로 표시 없이 들인다.
 */
const ENDGAMES: EndgamePosition[] = JSON.parse(readFileSync(new URL("../src/janggi/endgames.json", import.meta.url), "utf8"));

const 결과 = (page: Page) => page.getByText(/^목표를 (이뤘습니다|이루지 못했습니다)\.$/);

/** 판에 선 기물 자리(칸 이름 "43 한 병" 의 좌표들). 시작 국면과 맞는지 볼 때 쓴다. */
async function 기물수(page: Page): Promise<number> {
  return page.getByRole("grid", { name: "장기판" }).getByRole("gridcell", { name: / (초|한) / }).count();
}

test("끝내기 국면을 골라 AI 와 이어 두고, 끝나면 결과와 다시 하기가 선다", async ({ page }) => {
  test.setTimeout(240_000);
  const app = new AppPage(page);
  const first = ENDGAMES.filter((p) => p.group === "endgame")[0];

  await test.step("☰ 메뉴의 연습 아래 끝내기·국면 연습이 선다", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "메뉴 열기" }).click();
    const nav = page.getByRole("dialog", { name: "메뉴" }).getByRole("navigation", { name: "모드" });
    await expect(nav.getByRole("button", { name: "끝내기", exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "국면 연습", exact: true })).toBeVisible();
    await nav.getByRole("button", { name: "끝내기", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "끝내기" })).toBeVisible();
    await expect(page.getByText("규칙은 현대(빅장 없음)입니다.", { exact: false })).toBeVisible();
    await app.noHorizontalScroll();
  });

  await test.step("첫 국면을 열고 힌트의 수를 따라 두면 AI 가 응수하고, 끝나면 결과가 선다", async () => {
    await page.getByRole("button", { name: /^1번 / }).click();
    await expect(page.getByText(/외통을 거세요\.|버티세요\./)).toBeVisible();
    await app.noHorizontalScroll();

    let mine = 0;
    while (!(await 결과(page).isVisible())) {
      // 내 차례에 합법수가 오면 힌트가 켜진다. AI 가 생각 중이거나 판이 끝나면 꺼져 있다.
      await expect(app.hint.or(결과(page)).first()).toBeVisible();
      await expect(async () => {
        expect((await app.hint.isEnabled()) || (await 결과(page).isVisible())).toBe(true);
      }).toPass({ timeout: ENGINE_WAIT });
      if (await 결과(page).isVisible()) break;

      await app.hint.click();
      await expect(app.hintNote).toBeVisible({ timeout: ENGINE_WAIT });
      const note = (await app.hintNote.textContent()) ?? "";
      if (note.endsWith("한수쉼")) await app.pass.click();
      else {
        const m = note.match(/(\d{2})\D+(\d{2})$/);
        expect(m, `힌트 글에서 수를 읽는다: ${note}`).not.toBeNull();
        await app.tapAt(m![1]);
        await app.tapAt(m![2]);
      }
      mine++;
      if (mine === 1) {
        // 첫 수 뒤 AI 가 생각하고 응수한다.
        await expect(page.getByText("AI가 생각 중…").or(결과(page)).first()).toBeVisible();
      }
      expect(mine, "목표 수를 넘겨 두지 않는다").toBeLessThanOrEqual(first.goal.n);
    }
    await expect(page.getByRole("button", { name: "다시 하기" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await app.noHorizontalScroll();
  });

  await test.step("다시 하기를 누르면 시작 국면이 다시 선다", async () => {
    await page.getByRole("button", { name: "다시 하기" }).click();
    await expect(결과(page)).toHaveCount(0);
    expect(await 기물수(page)).toBe(Object.keys(parseFen(first.fen).board).length);
    await expect(app.hint).toBeEnabled({ timeout: ENGINE_WAIT });
  });

  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
});
