// 시간 도전 - 문제 순서, 남은 시간, 최고 기록의 모양
//
// 시계와 저장은 훅(hooks/useTimed.test.tsx)이 본다. 여기는 계산만.

import { describe, expect, it } from "vitest";
import { MATES } from "./mate";
import {
  NO_TIMED,
  TIMED_RULE,
  bestOf,
  clockText,
  deckOf,
  isTimedRecord,
  remainingMs,
  withBest,
} from "./timed";

/** 정해진 수를 돌려 가며 내는 가짜 난수. */
const 난수 = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("규칙", () => {
  it("3분, 세 번 놓치면 끝, 규칙 id 는 180s-3miss", () => {
    expect(TIMED_RULE).toEqual({ id: "180s-3miss", limitMs: 180_000, misses: 3 });
  });
});

describe("문제 순서", () => {
  it("모든 문제가 한 번씩, 1수 → 2수 → 3수 차례로 선다", () => {
    const deck = deckOf(MATES, Math.random);
    expect(deck).toHaveLength(MATES.length);
    expect(new Set(deck.map((p) => p.id)).size).toBe(MATES.length);
    expect(deck.map((p) => p.n)).toEqual([...MATES.map((p) => p.n)].sort((a, b) => a - b));
  });

  it("같은 난수면 같은 순서, 다른 난수면 묶음 안의 순서가 다르다", () => {
    const a = deckOf(MATES, 난수(0.1, 0.7, 0.3));
    expect(deckOf(MATES, 난수(0.1, 0.7, 0.3))).toEqual(a);
    expect(deckOf(MATES, 난수(0.9, 0.2)).map((p) => p.id)).not.toEqual(a.map((p) => p.id));
  });

  it("난수가 늘 0 이면 정해진 순서가 나온다(E2E 가 이 순서를 다시 계산한다)", () => {
    const list = [1, 2, 3, 4].map((i) => ({ n: 1, id: `p${i}` }));
    // 피셔-예이츠: i=3 ↔ 0, i=2 ↔ 0, i=1 ↔ 0
    expect(deckOf(list, () => 0).map((p) => p.id)).toEqual(["p2", "p3", "p4", "p1"]);
  });

  it("문제 목록을 바꾸지 않는다", () => {
    const before = MATES.map((p) => p.id);
    deckOf(MATES, Math.random);
    expect(MATES.map((p) => p.id)).toEqual(before);
  });
});

describe("남은 시간", () => {
  it("시작 시각과의 차이로 센다", () => {
    expect(remainingMs(1000, 1000)).toBe(180_000);
    expect(remainingMs(1000, 61_000)).toBe(120_000);
    expect(remainingMs(1000, 181_000)).toBe(0);
  });

  it("다 쓴 뒤에도 0 아래로 내려가지 않고, 기기 시계가 뒤로 가도 3분보다 늘지 않는다", () => {
    expect(remainingMs(1000, 500_000)).toBe(0);
    expect(remainingMs(10_000, 5_000)).toBe(180_000);
  });

  it("글은 분:초, 초는 올림", () => {
    expect(clockText(180_000)).toBe("3:00");
    expect(clockText(161_000)).toBe("2:41");
    expect(clockText(160_001)).toBe("2:41");
    expect(clockText(9_000)).toBe("0:09");
    expect(clockText(400)).toBe("0:01");
    expect(clockText(0)).toBe("0:00");
  });
});

describe("최고 기록", () => {
  it("모양: best 가 규칙 id → 0 이상 정수", () => {
    expect(isTimedRecord({ best: {} })).toBe(true);
    expect(isTimedRecord({ best: { "180s-3miss": 12, "300s-3miss": 0 } })).toBe(true);
  });

  it("깨진 값은 받지 않는다", () => {
    for (const bad of [
      null,
      12,
      "12",
      [],
      {},
      { best: null },
      { best: [] },
      { best: 12 },
      { best: { "180s-3miss": -1 } },
      { best: { "180s-3miss": 1.5 } },
      { best: { "180s-3miss": "12" } },
      { best: { "180s-3miss": Number.NaN } },
      { best: { a: 3, b: null } },
    ]) {
      expect(isTimedRecord(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("지금 규칙의 기록만 읽는다. 없으면 null", () => {
    expect(bestOf(NO_TIMED)).toBeNull();
    expect(bestOf({ best: { "300s-3miss": 20 } })).toBeNull();
    expect(bestOf({ best: { "180s-3miss": 0 } })).toBe(0);
    expect(bestOf({ best: { "180s-3miss": 7 } })).toBe(7);
  });

  it("더 많이 풀었을 때만 바뀌고, 다른 규칙의 칸은 그대로 둔다", () => {
    const record = { best: { "180s-3miss": 7, "300s-3miss": 20 } };
    expect(withBest(record, 9)).toEqual({ best: { "180s-3miss": 9, "300s-3miss": 20 } });
    expect(withBest(record, 7)).toBe(record);
    expect(withBest(record, 3)).toBe(record);
  });

  it("기록이 없을 때 0개는 남기지 않고, 1개부터 남긴다", () => {
    expect(withBest(NO_TIMED, 0)).toBe(NO_TIMED);
    expect(withBest(NO_TIMED, 1)).toEqual({ best: { "180s-3miss": 1 } });
  });
});
