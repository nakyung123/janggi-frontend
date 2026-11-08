// 오늘의 문제: 메뉴에서 열면 오늘(한국 날짜)의 문제가 서고, 풀면 외통 문제 목록에도 "풂" 이 선다.
//
// 오늘의 문제 화면은 엔진을 쓰지 않는다. 그래서 엔진이 뜨기를 기다리지 않고 바로 메뉴를 연다. 날짜를
// 바꿔 보는 시험(자정에 바뀜, 42일 겹침 없음)은 vitest 가 한다(src/janggi/daily.test.ts, 화면은
// src/components/mate/daily.test.tsx). 여기서는 가짜 시계(page.clock)를 쓰지 않는다 - 앱 전체의 시간을
// 멈추면 엔진 로딩까지 선다. 대신 진짜 날짜로 오늘의 문제를 Node 에서 같은 함수로 계산한다.
//
// 브라우저 시간대를 한국과 다른 두 곳으로 두고 같은 시험을 돌린다. 기기 시간대를 보면 틀리는지 보려는
// 것이다. 호놀룰루(한국 -19시간)는 한국 0~19시에, 키리티마티(한국 +5시간)는 한국 19~24시에 한국과
// 날짜가 달라서, 언제 돌려도 둘 중 하나는 날짜가 다른 기기다(Node 는 시간대와 상관없이 한국 날짜로 센다).
//
// Given 폰 폭 320, 배포용 빌드, 빈 브라우저 저장소, 브라우저 시간대 호놀룰루 / 키리티마티
// When  ☰ 메뉴에서 오늘의 문제를 연다      Then 오늘(한국) 날짜와 그날의 문제가 선다
// When  정답을 끝까지 둔다                 Then "외통입니다. 풀었습니다." 와 "내일 새 문제가 나옵니다." 가 선다
// When  외통 문제 목록을 연다              Then 그 문제의 줄에 "풂" 이 선다
// When  오늘의 문제를 다시 연다            Then "푼 문제입니다" 가 선다
// 내내: 잡히지 않은 스크립트 오류가 없고, 가로 스크롤이 없다.

import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { dailyOf, koreanDateLabel } from "../src/janggi/daily";
import type { MatePuzzle } from "../src/janggi/mate";
import { splitMove, toJanggiCoord } from "../src/janggi/notation";
import { AppPage, test } from "./app-page";

// src/janggi/mate.ts 를 가져오지 않고 데이터 파일을 직접 읽는다(e2e/mate.spec.ts 와 같은 까닭).
const MATES: MatePuzzle[] = JSON.parse(readFileSync(new URL("../src/janggi/mates.json", import.meta.url), "utf8"));

/** 교차점 둘을 눌러 수를 둔다. 폰은 쪽이 구르므로 누를 자리를 화면 안으로 들인다. */
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

for (const timezoneId of ["Pacific/Honolulu", "Pacific/Kiritimati"]) {
  test.describe(`기기 시간대 ${timezoneId}`, () => {
    test.use({ timezoneId });
    test("오늘의 문제를 풀면 외통 문제 목록에도 푼 표시가 서고, 다시 열면 푼 문제라고 한다", 오늘의문제);
  });
}

async function 오늘의문제({ page }: { page: Page }) {
  const app = new AppPage(page);
  // 열기 전과 연 뒤를 같이 센다. 그사이 한국 자정을 넘으면 둘 중 하나가 화면의 문제다.
  const 전 = Date.now();
  await page.goto("/");
  await app.openScreen("오늘의 문제");
  const 후 = Date.now();
  const 후보 = [전, 후].map((t) => ({ p: dailyOf(MATES, t), label: koreanDateLabel(t) }));

  let p: MatePuzzle = 후보[0].p;
  await test.step("오늘(한국) 날짜와 그날의 문제가 선다", async () => {
    await expect(page.getByRole("heading", { level: 2, name: "오늘의 문제" })).toBeVisible();
    const 줄 = await page.getByText(/^\d+월 \d+일 · \d수 외통 · /).textContent();
    const 맞는 = 후보.find((c) => 줄!.startsWith(`${c.label} · ${c.p.n}수 외통 · `));
    expect(맞는, `머리 줄 "${줄}" 이 한국 날짜의 문제다`).toBeDefined();
    p = 맞는!.p;
    await expect(page.getByText(`${p.n}수 안에 외통을 거세요.`)).toBeVisible();
    await app.noHorizontalScroll();
  });

  await test.step("정답을 끝까지 두면 풀린다", async () => {
    for (let step = 0; step < p.n; step++) {
      await 둔다(page, app, p.line[step * 2]);
      if (step < p.n - 1) await expect(page.getByText(/받았습니다\. 다음 수를 찾으세요\.$/)).toBeVisible();
    }
    await expect(page.getByText("외통입니다. 풀었습니다.")).toBeVisible();
    await expect(page.getByText("내일 새 문제가 나옵니다.")).toBeVisible();
    await app.noHorizontalScroll();
  });

  await test.step("외통 문제 목록의 그 줄에 푼 표시가 선다", async () => {
    await app.openScreen("외통 문제");
    const no = MATES.filter((q) => q.n === p.n).indexOf(p) + 1;
    const 줄 = page.getByRole("region", { name: `${p.n}수 외통` }).getByRole("button", { name: new RegExp(`^${no}번(,|$)`) });
    await expect(줄).toHaveAccessibleName(new RegExp(`^${no}번, 풂`));
  });

  await test.step("오늘의 문제를 다시 열면 푼 문제라고 한다", async () => {
    await app.openScreen("오늘의 문제");
    await expect(page.getByText("푼 문제입니다")).toBeVisible();
    await app.noHorizontalScroll();
  });

  expect(app.errors, "잡히지 않은 스크립트 오류").toEqual([]);
}
