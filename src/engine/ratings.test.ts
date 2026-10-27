// 급수 기준 점수
//
// 사다리를 만들 때 잰 레이팅(docs/DECISIONS.md "27칸 급수의 간격")과 같은 값이 나오는지,
// 그리고 급수 표(levels.ts)와 어긋나지 않는지 붙잡아 둔다.

import { describe, expect, it } from "vitest";
import { DEFAULT_LEVEL_ID, LEVELS } from "./levels";
import { nearestLevelId, ratingOf, START_RATING } from "./ratings";

const r = (id: string) => ratingOf(id) as number;

describe("급수 기준 점수", () => {
  it("27칸 모두 점수가 있고, 위 급수일수록 높다", () => {
    const values = LEVELS.map((l) => ratingOf(l.id));
    expect(values.every((v) => typeof v === "number")).toBe(true);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });

  it("사다리 기록의 값과 같다 - 18급 -13, 12급 316, 1급 920, 1단 1085, 9단 2883", () => {
    expect(Math.round(r("k18"))).toBe(-13);
    expect(Math.round(r("k12"))).toBe(316);
    expect(Math.round(r("k1"))).toBe(920);
    expect(Math.round(r("d1"))).toBe(1085);
    expect(Math.round(r("d5"))).toBe(1984);
    expect(Math.round(r("d9"))).toBe(2883);
  });

  it("급 한 칸은 55점쯤, 단 한 칸은 225점쯤이다", () => {
    expect(r("k17") - r("k18")).toBeCloseTo(54.9, 1);
    expect(r("k1") - r("k2")).toBeCloseTo(54.9, 1);
    expect(r("d2") - r("d1")).toBeCloseTo(224.7, 1);
    expect(r("d9") - r("d8")).toBeCloseTo(224.7, 1);
  });

  it("급수 표의 노드 수를 같은 곡선에 넣어도 20점 안에서 맞는다", () => {
    // 표의 노드 수는 배치한 값을 보기 좋게 반올림한 것이라 조금 어긋난다(5단이 가장 크다, 17점).
    const curve = (t: number) => -13 + 2_896 * t * t;
    const t = (nodes: number) => Math.log(nodes / 1_500) / Math.log(5_000_000 / 1_500);
    for (const l of LEVELS) {
      expect(Math.abs(curve(t(l.nodes)) - r(l.id))).toBeLessThan(20);
    }
  });

  it("모르는 급수는 null 이다 - 0점으로 채우지 않는다", () => {
    expect(ratingOf("")).toBeNull();
    expect(ratingOf("k19")).toBeNull();
    expect(ratingOf("12급")).toBeNull();
  });

  it("처음 점수는 처음 켰을 때의 상대(12급)의 점수다", () => {
    expect(DEFAULT_LEVEL_ID).toBe("k12");
    expect(START_RATING).toBe(r("k12"));
  });
});

describe("가장 가까운 급수", () => {
  it("기준 점수 그대로면 그 급수다", () => {
    for (const l of LEVELS) expect(nearestLevelId(r(l.id))).toBe(l.id);
  });

  it("두 급수 사이면 가까운 쪽이다", () => {
    expect(nearestLevelId(r("k12") + 20)).toBe("k12");
    expect(nearestLevelId(r("k11") - 20)).toBe("k11");
  });

  it("표 밖이면 양 끝이다", () => {
    expect(nearestLevelId(-1_000)).toBe("k18");
    expect(nearestLevelId(10_000)).toBe("d9");
  });
});
