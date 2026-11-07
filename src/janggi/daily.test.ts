// 오늘의 문제 - 한국 날짜마다 문제 하나, 한국 자정에 바뀌고, 한 바퀴 안에서 겹치지 않는다
//
// 날짜는 인자로 넘긴다. 시각은 UTC 로 적는다 - 한국 0시는 전날 UTC 15시다.

import { describe, expect, it } from "vitest";
import { DAILY_START_DAY, dailyOf, dailyOrder, koreanDateLabel, koreanDay } from "./daily";
import { MATES } from "./mate";

/** 한국 시각 y-m-d h:mi 를 ms 로. */
const 한국 = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h - 9, mi);

describe("한국 날짜", () => {
  it("기준일 2026-11-07 의 날 번호가 DAILY_START_DAY 다", () => {
    expect(koreanDay(한국(2026, 11, 7))).toBe(DAILY_START_DAY);
    expect(koreanDay(한국(2026, 11, 7, 23, 59))).toBe(DAILY_START_DAY);
    expect(koreanDay(한국(2026, 11, 8))).toBe(DAILY_START_DAY + 1);
  });

  it("한국 자정(UTC 15시)에 날이 바뀐다 - UTC 날짜가 아니다", () => {
    expect(koreanDay(Date.UTC(2026, 10, 7, 14, 59, 59, 999))).toBe(DAILY_START_DAY);
    expect(koreanDay(Date.UTC(2026, 10, 7, 15, 0))).toBe(DAILY_START_DAY + 1);
  });

  it("날짜 글은 한국 날짜다", () => {
    expect(koreanDateLabel(한국(2026, 11, 7))).toBe("11월 7일");
    expect(koreanDateLabel(Date.UTC(2026, 10, 7, 15, 0))).toBe("11월 8일");
    expect(koreanDateLabel(한국(2027, 1, 1))).toBe("1월 1일");
  });
});

describe("오늘의 문제", () => {
  it("같은 한국 날짜에는 0시부터 23시 59분까지 같은 문제다", () => {
    const 아침 = dailyOf(MATES, 한국(2026, 11, 20));
    expect(dailyOf(MATES, 한국(2026, 11, 20, 12))).toBe(아침);
    expect(dailyOf(MATES, 한국(2026, 11, 20, 23, 59))).toBe(아침);
  });

  it("기준일은 id 순서의 첫 문제이고, 다음 날은 그다음 문제다", () => {
    const order = dailyOrder(MATES);
    expect(dailyOf(MATES, 한국(2026, 11, 7))).toBe(order[0]);
    expect(dailyOf(MATES, 한국(2026, 11, 8))).toBe(order[1]);
    expect(order.map((p) => p.id)).toEqual(MATES.map((p) => p.id).sort());
  });

  it("연속한 문제 수만큼의 날에는 모든 문제가 한 번씩 나온다(어느 날에서 시작해도)", () => {
    for (const start of [한국(2026, 11, 7), 한국(2026, 12, 25), 한국(2025, 3, 1)]) {
      const ids = Array.from({ length: MATES.length }, (_, i) => dailyOf(MATES, start + i * 86_400_000).id);
      expect(new Set(ids).size).toBe(MATES.length);
    }
  });

  it("한 바퀴 뒤에는 같은 순서로 다시 돈다", () => {
    const 첫날 = 한국(2026, 11, 7);
    for (let i = 0; i < MATES.length; i++) {
      const day = 첫날 + i * 86_400_000;
      expect(dailyOf(MATES, day + MATES.length * 86_400_000)).toBe(dailyOf(MATES, day));
    }
  });

  it("기준일 전 날짜도 문제가 나온다(나머지가 음수가 되지 않는다)", () => {
    const order = dailyOrder(MATES);
    expect(dailyOf(MATES, 한국(2026, 11, 6))).toBe(order[order.length - 1]);
    expect(dailyOf(MATES, 한국(2020, 1, 1))).toBeDefined();
  });

  it("문제 목록을 인자로 받아, 순서는 목록의 순서가 아니라 id 순서다", () => {
    const list = [{ id: "c" }, { id: "a" }, { id: "b" }];
    expect([0, 1, 2, 3].map((i) => dailyOf(list, 한국(2026, 11, 7 + i)).id)).toEqual(["a", "b", "c", "a"]);
  });
});
