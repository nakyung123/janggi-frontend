// @vitest-environment jsdom
//
// 외통 문제 풀기 - 정답이면 응수가 주 수순대로 서고, 마지막 정답이면 끝, 답이 아니면 판이 그대로
//
// 응수는 0.5초 타이머로 둔다. 이 훅은 흐른 시간을 재지 않고 타이머 하나만 쓰므로 가짜 시계로
// 앞당긴다(엔진도 없다). 수는 판을 누르는 길(onSquareClick: 기물 → 갈 곳)로 둔다 - 화면과 같다.

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatePuzzle } from "../janggi/mate";
import { MATES, kingOf, positionAt } from "../janggi/mate";
import { describeMove, splitMove } from "../janggi/notation";
import { REPLY_DELAY_MS, useMateSolve } from "./useMateSolve";

// jsdom 에는 오디오가 없다. 여기서 볼 것도 아니다.
vi.mock("../audio/sound", () => ({ playMoveSound: vi.fn(), playPickSound: vi.fn() }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const 한수 = MATES.find((p) => p.n === 1)!;
const 두수 = MATES.find((p) => p.n === 2)!;
const 세수한공격 = MATES.find((p) => p.n === 3 && p.fen.split(" ")[1] === "b")!;

function 띄운다(puzzle: MatePuzzle) {
  const onSolve = vi.fn();
  const hook = renderHook(() => useMateSolve(puzzle, onSolve));
  return { hook, onSolve, now: () => hook.result.current };
}

/** 기물을 누르고 갈 곳을 누른다. */
function 둔다(hook: ReturnType<typeof 띄운다>["hook"], move: string) {
  const { from, to } = splitMove(move);
  act(() => hook.result.current.onSquareClick(from));
  act(() => hook.result.current.onSquareClick(to));
}

/** 응수를 기다린다. */
const 응수를기다린다 = () => act(() => vi.advanceTimersByTime(REPLY_DELAY_MS));

/** 이 국면에서 둘 수 있지만 답이 아닌 수. */
const 오답 = (p: MatePuzzle, step: number) => p.legal[step].find((m) => m !== p.line[step * 2])!;

describe("처음", () => {
  it("문제 국면에서 공격 쪽 차례로 시작하고, 공격 쪽 기물만 집힌다", () => {
    const { now } = 띄운다(두수);
    expect(now().phase).toBe("attack");
    expect(now().note).toEqual({ kind: "start" });
    expect(now().position).toEqual(positionAt(두수, 0));
    const { from } = splitMove(두수.line[0]);
    expect(now().canPick(from)).toBe(true);
    const 수비기물 = Object.keys(now().position.board).find((s) => now().position.board[s] === (now().attacker === "cho" ? "k" : "K"))!;
    expect(now().canPick(수비기물)).toBe(false);
  });

  it("기물을 집으면 그 기물의 갈 곳이 데이터의 합법수 그대로 찍힌다", () => {
    const { hook, now } = 띄운다(두수);
    const { from } = splitMove(두수.line[0]);
    act(() => hook.result.current.onSquareClick(from));
    const 기대 = 두수.legal[0].filter((m) => splitMove(m).from === from).map((m) => splitMove(m).to);
    expect([...now().targets].sort()).toEqual(기대.sort());
  });
});

describe("답이 아닌 수", () => {
  it("판은 그대로이고 알림 줄에 그 수의 기보 표기가 선다. 다시 둘 수 있다", () => {
    const { hook, now, onSolve } = 띄운다(두수);
    const 틀린수 = 오답(두수, 0);
    둔다(hook, 틀린수);
    expect(now().position).toEqual(positionAt(두수, 0));
    expect(now().note).toEqual({ kind: "wrong", move: describeMove(틀린수, positionAt(두수, 0).board).short });
    expect(now().phase).toBe("attack");
    expect(now().selected).toBeNull();

    둔다(hook, 두수.line[0]);
    expect(now().phase).toBe("reply");
    expect(onSolve).not.toHaveBeenCalled();
  });

  it("끌어서 둔 답이 아닌 수도 판에 남지 않는다", () => {
    const { hook, now } = 띄운다(두수);
    const { from, to } = splitMove(오답(두수, 0));
    act(() => hook.result.current.onMove(from, to));
    expect(now().position).toEqual(positionAt(두수, 0));
    expect(now().note.kind).toBe("wrong");
  });
});

describe("정답", () => {
  it("두면 응수를 기다리는 동안 판이 잠기고, 0.5초 뒤 주 수순의 응수가 선다", () => {
    const { hook, now } = 띄운다(두수);
    둔다(hook, 두수.line[0]);
    expect(now().phase).toBe("reply");
    expect(now().note).toEqual({ kind: "correct" });
    expect(now().position).toEqual(positionAt(두수, 1));
    expect(now().canPick(splitMove(두수.line[2]).from)).toBe(false);

    act(() => vi.advanceTimersByTime(REPLY_DELAY_MS - 1));
    expect(now().phase).toBe("reply");
    act(() => vi.advanceTimersByTime(1));
    expect(now().phase).toBe("attack");
    expect(now().position).toEqual(positionAt(두수, 2));
    expect(now().note).toEqual({ kind: "replied", move: describeMove(두수.line[1], positionAt(두수, 1).board).short });
    expect(now().lastMove).toEqual(splitMove(두수.line[1]));
  });

  it("눌러서 둔 수와 응수는 날아가고, 끌어서 둔 수는 날지 않는다", () => {
    const { hook, now } = 띄운다(두수);
    둔다(hook, 두수.line[0]);
    expect(now().flyMove).toMatchObject(splitMove(두수.line[0]));
    응수를기다린다();
    expect(now().flyMove).toMatchObject(splitMove(두수.line[1]));

    const { from, to } = splitMove(두수.line[2]);
    act(() => hook.result.current.onMove(from, to));
    expect(now().flyMove).toBeNull();
  });

  it("마지막 정답이면 끝나고, 외통을 맞은 궁을 짚고, 푼 문제로 한 번 알린다", () => {
    const { hook, now, onSolve } = 띄운다(두수);
    둔다(hook, 두수.line[0]);
    응수를기다린다();
    둔다(hook, 두수.line[2]);
    expect(now().phase).toBe("done");
    expect(now().note).toEqual({ kind: "done", peeked: false });
    const 끝 = positionAt(두수, 3);
    expect(now().matedKing).toBe(kingOf(끝, 끝.turn));
    expect(onSolve).toHaveBeenCalledTimes(1);
    expect(onSolve).toHaveBeenCalledWith(두수.id);

    // 끝난 뒤에는 기다리는 응수가 없고 판도 잠긴다.
    응수를기다린다();
    expect(now().position).toEqual(끝);
    expect(now().canPick(splitMove(두수.line[2]).to)).toBe(false);
  });

  it("1수 문제는 첫 정답으로 끝난다", () => {
    const { hook, now, onSolve } = 띄운다(한수);
    둔다(hook, 한수.line[0]);
    expect(now().phase).toBe("done");
    expect(onSolve).toHaveBeenCalledWith(한수.id);
  });

  it("한이 공격하는 3수 문제도 응수를 주 수순대로 두며 끝까지 간다", () => {
    const { hook, now, onSolve } = 띄운다(세수한공격);
    expect(now().attacker).toBe("han");
    for (let step = 0; step < 3; step++) {
      둔다(hook, 세수한공격.line[step * 2]);
      if (step < 2) 응수를기다린다();
    }
    expect(now().phase).toBe("done");
    expect(now().position).toEqual(positionAt(세수한공격, 5));
    expect(onSolve).toHaveBeenCalledWith(세수한공격.id);
  });
});

describe("정답 보기와 처음부터", () => {
  it("정답 보기는 지금 둘 수를 화살표로 보이고, 그 수를 두면 화살표가 사라진다", () => {
    const { hook, now } = 띄운다(두수);
    act(() => now().showAnswer());
    expect(now().answerArrow).toEqual(splitMove(두수.line[0]));
    expect(now().note).toEqual({ kind: "shown" });
    expect(now().peeked).toBe(true);

    둔다(hook, 두수.line[0]);
    expect(now().answerArrow).toBeNull();
    응수를기다린다();
    expect(now().answerArrow).toBeNull();
  });

  it("정답을 본 판은 끝까지 둬도 푼 문제로 알리지 않는다", () => {
    const { hook, now, onSolve } = 띄운다(두수);
    둔다(hook, 두수.line[0]);
    응수를기다린다();
    act(() => now().showAnswer());
    둔다(hook, 두수.line[2]);
    expect(now().note).toEqual({ kind: "done", peeked: true });
    expect(onSolve).not.toHaveBeenCalled();
  });

  it("처음부터 - 문제 국면으로 돌아가고 정답 본 것도 지운다. 다시 풀면 푼 문제로 알린다", () => {
    const { hook, now, onSolve } = 띄운다(한수);
    act(() => now().showAnswer());
    act(() => now().restart());
    expect(now().peeked).toBe(false);
    expect(now().answerArrow).toBeNull();
    expect(now().note).toEqual({ kind: "start" });
    둔다(hook, 한수.line[0]);
    expect(onSolve).toHaveBeenCalledWith(한수.id);
  });

  it("응수를 기다리다 처음부터를 누르면 기다리던 응수는 두지 않는다", () => {
    const { hook, now } = 띄운다(두수);
    둔다(hook, 두수.line[0]);
    act(() => now().restart());
    응수를기다린다();
    expect(now().position).toEqual(positionAt(두수, 0));
    expect(now().phase).toBe("attack");
  });

  it("응수를 기다리는 동안 정답 보기는 아무 일도 하지 않는다", () => {
    const { hook, now } = 띄운다(두수);
    둔다(hook, 두수.line[0]);
    act(() => now().showAnswer());
    expect(now().peeked).toBe(false);
  });

  it("응수를 기다리다 화면을 떠나도 타이머가 남지 않는다", () => {
    const { hook } = 띄운다(두수);
    둔다(hook, 두수.line[0]);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
