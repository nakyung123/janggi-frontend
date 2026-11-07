// @vitest-environment jsdom
//
// 시간 도전 한 판 - 시작, 풀기·놓치기, 세 가지 끝(시간·놓침·다 지남), 최고 기록 남기기
//
// 가짜 시계(vi.useFakeTimers)는 타이머와 Date.now 를 같이 앞당긴다. 이 훅은 엔진을 쓰지 않아 가짜
// 시계가 무엇을 세우지 않는다. 저장은 jsdom 의 localStorage 에 진짜로 쓴다.

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatePuzzle } from "../janggi/mate";
import { MATES } from "../janggi/mate";
import { TIMED_RULE, deckOf } from "../janggi/timed";
import { REPLY_DELAY_MS } from "./useMateSolve";
import { useTimed } from "./useTimed";

const KEY = "janggi:timed-best";
const 영 = () => 0;
const 순서 = deckOf(MATES, 영);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
// 띄운 훅을 내린다. 남겨 두면 도는 판의 타이머가 다음 시험의 타이머 수에 섞인다.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function 띄운다(list: readonly MatePuzzle[] = MATES) {
  const hook = renderHook(() => useTimed(list, 영));
  return { hook, now: () => hook.result.current };
}

/** 지금 문제를 풀고 다음 문제를 기다린다. */
function 푼다(hook: ReturnType<typeof 띄운다>["hook"]) {
  act(() => hook.result.current.solve(hook.result.current.puzzle!.id));
  act(() => vi.advanceTimersByTime(REPLY_DELAY_MS));
}

const 저장된값 = () => JSON.parse(localStorage.getItem(KEY) ?? "null");

describe("시작 전", () => {
  it("기록이 없으면 최고 기록 없음, 저장된 기록이 있으면 그 값", () => {
    expect(띄운다().now()).toMatchObject({ phase: "ready", best: null, puzzle: null });
    localStorage.setItem(KEY, JSON.stringify({ best: { "180s-3miss": 7 } }));
    expect(띄운다().now().best).toBe(7);
  });

  it("다른 규칙의 기록은 지금 규칙의 최고 기록이 아니다", () => {
    localStorage.setItem(KEY, JSON.stringify({ best: { "300s-3miss": 20 } }));
    expect(띄운다().now().best).toBeNull();
  });

  it("깨진 값이면 빈 기록으로 보고, 시작 전에는 아무것도 쓰지 않는다", () => {
    for (const bad of ["{", "12", JSON.stringify({ best: { "180s-3miss": -3 } })]) {
      localStorage.setItem(KEY, bad);
      expect(띄운다().now().best).toBeNull();
      expect(localStorage.getItem(KEY)).toBe(bad);
    }
  });
});

describe("도는 중", () => {
  it("시작하면 3분이 남고, 1수 문제부터 섞은 순서로 낸다", () => {
    const { hook, now } = 띄운다();
    act(() => now().start());
    expect(now()).toMatchObject({ phase: "running", solved: 0, misses: 0, remainingMs: 180_000, index: 0 });
    expect(now().puzzle).toBe(순서[0]);
    expect(now().puzzle!.n).toBe(1);
    hook.unmount();
  });

  it("풀면 푼 개수가 오르고, 0.5초 기다린 뒤 다음 문제가 선다. 기다리는 동안 넘기기는 받지 않는다", () => {
    const { now } = 띄운다();
    act(() => now().start());
    act(() => now().solve(순서[0].id));
    expect(now()).toMatchObject({ solved: 1, waiting: true, puzzle: 순서[0] });
    act(() => now().miss());
    expect(now().misses).toBe(0);
    act(() => vi.advanceTimersByTime(REPLY_DELAY_MS));
    expect(now()).toMatchObject({ solved: 1, waiting: false, index: 1, puzzle: 순서[1], missedLast: false });
  });

  it("지금 문제가 아닌 id 는 푼 것으로 세지 않는다", () => {
    const { now } = 띄운다();
    act(() => now().start());
    act(() => now().solve(순서[5].id));
    expect(now().solved).toBe(0);
  });

  it("놓치면 바로 다음 문제가 서고, 앞 문제를 놓쳤다고 알린다. 다음에 풀면 그 알림이 지워진다", () => {
    const { hook, now } = 띄운다();
    act(() => now().start());
    act(() => now().miss());
    expect(now()).toMatchObject({ misses: 1, index: 1, puzzle: 순서[1], missedLast: true });
    푼다(hook);
    expect(now()).toMatchObject({ solved: 1, misses: 1, missedLast: false, puzzle: 순서[2] });
  });

  it("남은 시간은 흐른 시간만큼 준다", () => {
    const { now } = 띄운다();
    act(() => now().start());
    act(() => vi.advanceTimersByTime(19_000));
    expect(now().remainingMs).toBe(161_000);
  });
});

describe("끝", () => {
  it("3분이 다 되면 끝난다. 그 전에는 돈다", () => {
    const { hook, now } = 띄운다();
    act(() => now().start());
    푼다(hook);
    act(() => vi.advanceTimersByTime(180_000 - REPLY_DELAY_MS - 200));
    expect(now().phase).toBe("running");
    act(() => vi.advanceTimersByTime(200));
    expect(now()).toMatchObject({ phase: "over", end: "time", solved: 1, puzzle: null });
  });

  it("세 번 놓치면 시간이 남아도 끝난다", () => {
    const { hook, now } = 띄운다();
    act(() => now().start());
    푼다(hook);
    for (let i = 0; i < TIMED_RULE.misses; i++) act(() => now().miss());
    expect(now()).toMatchObject({ phase: "over", end: "misses", solved: 1, misses: 3, puzzle: null });
  });

  it("문제를 다 지나면 끝난다", () => {
    const 둘 = MATES.slice(0, 2);
    const { hook, now } = 띄운다(둘);
    act(() => now().start());
    푼다(hook);
    act(() => now().miss());
    expect(now()).toMatchObject({ phase: "over", end: "all", solved: 1, misses: 1 });
  });

  it("다음 문제를 기다리는 동안 시간이 다 되면 그대로 끝나고, 기다리던 것은 버린다", () => {
    const { now } = 띄운다();
    act(() => now().start());
    act(() => vi.advanceTimersByTime(179_800));
    act(() => now().solve(now().puzzle!.id));
    act(() => vi.advanceTimersByTime(200));
    expect(now()).toMatchObject({ phase: "over", end: "time", solved: 1 });
    act(() => vi.advanceTimersByTime(REPLY_DELAY_MS));
    expect(now()).toMatchObject({ phase: "over", index: 0, puzzle: null });
  });

  it("끝난 뒤에는 풀기·놓치기를 받지 않고, 다시 시작하면 새 판이다", () => {
    const { hook, now } = 띄운다();
    act(() => now().start());
    for (let i = 0; i < 3; i++) act(() => now().miss());
    act(() => now().miss());
    act(() => now().solve(순서[3].id));
    expect(now()).toMatchObject({ phase: "over", solved: 0, misses: 3 });

    act(() => now().start());
    expect(now()).toMatchObject({ phase: "running", solved: 0, misses: 0, index: 0, end: null, remainingMs: 180_000 });
    hook.unmount();
  });
});

describe("최고 기록", () => {
  it("끝나면 푼 개수를 이 규칙의 칸에 남기고, 새 기록이라고 알린다", () => {
    const { hook, now } = 띄운다();
    act(() => now().start());
    푼다(hook);
    푼다(hook);
    for (let i = 0; i < 3; i++) act(() => now().miss());
    expect(now()).toMatchObject({ best: 2, newBest: true });
    expect(저장된값()).toEqual({ best: { "180s-3miss": 2 } });
  });

  it("최고보다 적거나 같으면 기록을 바꾸지 않고 새 기록도 아니다. 다른 규칙의 칸은 그대로다", () => {
    const before = { best: { "180s-3miss": 2, "300s-3miss": 20 } };
    localStorage.setItem(KEY, JSON.stringify(before));
    const { hook, now } = 띄운다();
    act(() => now().start());
    푼다(hook);
    푼다(hook);
    for (let i = 0; i < 3; i++) act(() => now().miss());
    expect(now()).toMatchObject({ solved: 2, best: 2, newBest: false });
    expect(저장된값()).toEqual(before);
  });

  it("판 도중 다른 탭이 남긴 더 큰 기록을 지우지 않는다 - 쓰기 직전에 다시 읽는다", () => {
    const { hook, now } = 띄운다();
    act(() => now().start());
    푼다(hook);
    푼다(hook);
    localStorage.setItem(KEY, JSON.stringify({ best: { "180s-3miss": 9 } }));
    for (let i = 0; i < 3; i++) act(() => now().miss());
    expect(now()).toMatchObject({ solved: 2, best: 9, newBest: false });
    expect(저장된값()).toEqual({ best: { "180s-3miss": 9 } });
  });

  it("깨진 값은 판이 끝날 때 이 키만 새 기록으로 덮는다. 다른 키는 그대로다", () => {
    localStorage.setItem(KEY, "{망가짐");
    localStorage.setItem("janggi:mate-solved", JSON.stringify({ solved: ["x"] }));
    const { hook, now } = 띄운다();
    act(() => now().start());
    푼다(hook);
    for (let i = 0; i < 3; i++) act(() => now().miss());
    expect(저장된값()).toEqual({ best: { "180s-3miss": 1 } });
    expect(localStorage.getItem("janggi:mate-solved")).toBe(JSON.stringify({ solved: ["x"] }));
  });

  it("하나도 못 풀면 기록을 남기지 않는다", () => {
    const { now } = 띄운다();
    act(() => now().start());
    for (let i = 0; i < 3; i++) act(() => now().miss());
    expect(now()).toMatchObject({ phase: "over", best: null, newBest: false });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("판 도중 화면을 떠나면 그 판은 버린다 - 기록을 쓰지 않고 타이머도 남기지 않는다", () => {
    const { hook, now } = 띄운다();
    act(() => now().start());
    act(() => now().solve(now().puzzle!.id));
    // 훅이 건 것은 둘(200ms 간격 타이머, 다음 문제 0.5초). 전체 수를 0 으로 보지 않는 까닭: jsdom 의
    // localStorage 는 쓸 때마다 storage 이벤트용 타이머를 건다(저장소를 만지는 safeStore 가 두 개).
    const before = vi.getTimerCount();
    hook.unmount();
    expect(vi.getTimerCount()).toBe(before - 2);
    act(() => vi.advanceTimersByTime(200_000));
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
