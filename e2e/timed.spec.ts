// 시간 도전: 한 판을 시작해 하나 풀고 세 번 놓쳐 끝내면, 푼 개수와 최고 기록이 서고 새로고침 뒤에도 남는다.
//
// 시간 도전 화면은 엔진을 쓰지 않는다. 그래서 엔진이 뜨기를 기다리지 않고 바로 메뉴를 연다.
//
// 시간이 다 되어 끝나는 것은 vitest 가 가짜 시계로 본다(src/hooks/useTimed.test.tsx,
// src/components/mate/timed.test.tsx). 여기서는 가짜 시계(page.clock)를 쓰지 않는다 - 앱 전체의 시간을
// 멈추면 엔진 로딩까지 선다. 판은 세 번 놓쳐서 끝내므로 몇 초면 끝난다. 시계가 실제로 흐르는지만 본다.
//
// 문제 순서는 Math.random 으로 섞는다. 페이지가 뜨기 전에 Math.random 을 0 으로 묶어, 같은 순서를
// Node 에서 같은 함수(deckOf)로 다시 계산한다. 앱의 다른 곳도 Math.random 을 쓰고 이 시험에서도
// 불린다 - 앱을 열 때 만드는 판 id(janggi/archive.ts 의 newGameId, 끝이 "-0" 이 된다), 소리, 측정 세션
// id. 이 시험이 보는 것(문제 순서, 푼 개수, 최고 기록)에는 영향이 없다.
//
// Given 폰 폭 320, 배포용 빌드, 빈 브라우저 저장소, Math.random = 0
// When  ☰ 메뉴에서 시간 도전을 열고 시작한다     Then 남은 시간·푼 문제 0·놓침 0/3 과 첫 문제가 선다
// When  첫 문제를 푼다                           Then 푼 문제 1, 다음 문제
// When  답이 아닌 수를 둔다                      Then 놓침 1/3, "앞 문제를 놓쳤습니다."
// When  넘기기를 두 번 누른다                    Then 끝: 1개 풀었습니다, 세 번 놓쳤습니다, 최고 기록 1개 · 새 기록
// When  새로고침하고 시간 도전을 다시 연다          Then 최고 기록 1개
// 내내: 잡히지 않은 스크립트 오류가 없고, 가로 스크롤이 없다.

import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { parseFen } from "../src/janggi/board";
import type { MatePuzzle } from "../src/janggi/mate";
import { splitMove, toJanggiCoord } from "../src/janggi/notation";
import { SIDE_LABEL, pieceInfo, sideOf } from "../src/janggi/pieces";
import { deckOf } from "../src/janggi/timed";
import { AppPage, test } from "./app-page";

const MATES: MatePuzzle[] = JSON.parse(readFileSync(new URL("../src/janggi/mates.json", import.meta.url), "utf8"));
const 순서 = deckOf(MATES, () => 0);

async function 둔다(page: Page, app: AppPage, move: string) {
  const { from, to } = splitMove(move);
  for (const square of [from, to]) {
    const cell = page
      .getByRole("grid", { name: "장기판" })
      .getByRole("gridcell", { name: new RegExp(`^${toJanggiCoord(square)}( |$)`) });
    await cell.scrollIntoViewIfNeeded();
    await app.tapAt(toJanggiCoord(square));
  }
}

/**
 * 판의 90 교차점 이름이 그 문제의 처음 국면대로인지. 이름은 판이 붙이는 것(좌표 + 진영 + 기물, Board.tsx)과
 * 같은 방식으로 만든다.
 */
async function 문제가(page: Page, p: MatePuzzle) {
  const pos = parseFen(p.fen);
  const 이름 = (square: string) => {
    const piece = pos.board[square];
    const coord = toJanggiCoord(square);
    return piece ? `${coord} ${SIDE_LABEL[sideOf(piece)]} ${pieceInfo(piece).name}` : coord;
  };
  const 칸 = page.getByRole("grid", { name: "장기판" }).locator("[data-square]");
  await expect(칸).toHaveCount(90);
  const 지금 = async () =>
    (await 칸.evaluateAll((els) => els.map((e) => [e.getAttribute("data-square")!, e.getAttribute("aria-label")!]))).map(
      ([square, label]) => label === 이름(square)
    );
  await expect.poll(async () => (await 지금()).every(Boolean)).toBe(true);
}

test("시간 도전 한 판을 끝내면 푼 개수와 최고 기록이 서고, 새로고침 뒤에도 최고 기록이 남는다", async ({ page }) => {
  const app = new AppPage(page);
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  const 시계 = page.getByRole("timer");

  await test.step("☰ 메뉴에서 시간 도전을 열고 시작한다", async () => {
    await page.goto("/");
    await app.openScreen("시간 도전");
    await expect(page.getByRole("heading", { level: 2, name: "시간 도전" })).toBeVisible();
    await expect(page.getByText("아직 기록이 없습니다.")).toBeVisible();
    await app.noHorizontalScroll();

    await page.getByRole("button", { name: "시작" }).click();
    await expect(시계).toHaveText(/^[23]:\d\d$/);
    await expect(page.getByText("푼 문제 0")).toBeVisible();
    await expect(page.getByText("놓침 0/3")).toBeVisible();
    await 문제가(page, 순서[0]);
    await app.noHorizontalScroll();
  });

  await test.step("첫 문제를 풀면 푼 문제가 1 이 되고 다음 문제가 선다. 시계는 흐른다", async () => {
    await 둔다(page, app, 순서[0].line[0]);
    await expect(page.getByText("푼 문제 1")).toBeVisible();
    await expect(page.getByText("1수 안에 외통을 거세요.")).toBeVisible();
    await 문제가(page, 순서[1]);
    await expect(시계).toHaveText(/^2:5\d$/, { timeout: 3_000 });
  });

  await test.step("답이 아닌 수를 두면 그 문제를 놓친다", async () => {
    const p = 순서[1];
    await 둔다(page, app, p.legal[0].find((m) => m !== p.line[0])!);
    await expect(page.getByText("놓침 1/3")).toBeVisible();
    await expect(page.getByText("앞 문제를 놓쳤습니다. 1수 안에 외통을 거세요.")).toBeVisible();
    await app.noHorizontalScroll();
  });

  await test.step("두 번 더 넘기면 끝나고 푼 개수와 최고 기록이 선다", async () => {
    await page.getByRole("button", { name: "넘기기" }).click();
    await expect(page.getByText("놓침 2/3")).toBeVisible();
    await page.getByRole("button", { name: "넘기기" }).click();
    const 결과 = page.getByRole("region", { name: "결과" });
    await expect(결과).toContainText("1개 풀었습니다");
    await expect(결과.getByText("세 번 놓쳤습니다.")).toBeVisible();
    await expect(결과.getByText(/^최고 기록 1개/)).toHaveText("최고 기록 1개 · 새 기록입니다.");
    await app.noHorizontalScroll();
  });

  await test.step("새로고침한 뒤 다시 열어도 최고 기록이 남아 있다", async () => {
    await page.reload();
    await app.openScreen("시간 도전");
    await expect(page.getByText("최고 기록 1개")).toBeVisible();
  });

  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
});
