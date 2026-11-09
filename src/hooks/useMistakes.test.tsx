// @vitest-environment jsdom
//
// 내 실수 문제의 상태 - 엔진에 묻는 차례, 판이 잠기는 때, 판정, 늦은 답 버리기
//
// 엔진은 가짜(test/fakeEngine.ts)를 바로 넘긴다. 가짜 규칙은 기물이 한 칸씩만 가서, 졸을 한 칸 올리는
// 수순으로 판을 짓는다. 시간은 진짜로 흐른다(엔진에 묻기 전 0.2초) - App 시험과 같다.

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JanggiEngine } from "../engine/engine";
import type { EngineStatus } from "../engine/useEngine";
import type { ArchivedGame } from "../janggi/archive";
import { START_FEN, parseFen } from "../janggi/board";
import { nextEntry, startHistory } from "../janggi/history";
import { splitMove } from "../janggi/notation";
import type { Side } from "../janggi/pieces";
import type { ReviewedMove } from "../janggi/review";
import { FakeEngine } from "../test/fakeEngine";
import { MISTAKE_LIMITS, useMistakes } from "./useMistakes";

vi.mock("../audio/sound", () => ({ playMoveSound: vi.fn(), playPickSound: vi.fn() }));

const MOVES = ["a4a5", "a7a6", "c4c5", "c7c6", "e4e5", "e7e6"];

/** 복기한 판. blunders 의 수 번호는 내 큰 실수이고 AI 의 수는 그 값이다. 나머지는 최선수. */
function 판(id: string, blunders: Record<number, string>, over: { mySide?: Side; variant?: string } = {}): ArchivedGame {
  const history = startHistory(START_FEN);
  for (const m of MOVES) {
    const { from, to } = splitMove(m);
    history.push(nextEntry(history[history.length - 1].fen, from, to));
  }
  const reviewed: ReviewedMove[] = MOVES.map((m, i) => {
    const index = i + 1;
    const best = blunders[index] ?? m;
    return {
      index,
      mover: history[index].mover!,
      played: m,
      playedNotation: history[index].notation,
      best,
      bestNotation: best,
      scoreBefore: 0,
      scoreAfter: 0,
      loss: 0,
      winDrop: blunders[index] ? 0.3 : 0,
      grade: blunders[index] ? "blunder" : "best",
      note: { verdict: null, best: null, bestDoes: null, after: null },
    };
  });
  return {
    id,
    endedAt: 100,
    mySide: over.mySide ?? "cho",
    levelId: "k12",
    levelName: "12급",
    variant: over.variant ?? "janggi",
    result: { kind: "resign", winner: "han" },
    history,
    reviewed,
  };
}

const fake = () => FakeEngine.current;
/** 초 승률이 p 가 되는 점수(review.ts 의 winChance 를 거꾸로). */
const scoreFor = (p: number) => Math.log(p / (1 - p)) / 0.18;

interface Props {
  engine: JanggiEngine | null;
  engineStatus: EngineStatus;
  active: boolean;
  games: ArchivedGame[];
}

function 띄운다(games: ArchivedGame[], over: Partial<Props> = {}) {
  const onOpenGame = vi.fn();
  const hook = renderHook((p: Props) => useMistakes({ ...p, onOpenGame }), {
    initialProps: {
      engine: fake() as unknown as JanggiEngine,
      engineStatus: "ready",
      active: true,
      games,
      ...over,
    },
  });
  return { hook, onOpenGame };
}

type Hook = ReturnType<typeof 띄운다>["hook"];

/** 판을 눌러 둔다(기물 → 갈 곳). 화면과 같은 길이다. */
function 둔다(hook: Hook, move: string) {
  const { from, to } = splitMove(move);
  act(() => hook.result.current.view.onSquareClick(from));
  act(() => hook.result.current.view.onSquareClick(to));
}

const 첫문제를연다 = async (hook: Hook) => {
  act(() => hook.result.current.show(hook.result.current.list.groups[0].mistakes[0].id));
  await waitFor(() => expect(hook.result.current.note.kind).toBe("start"));
};

beforeEach(() => {
  fake().reset();
  // 문제 국면(첫 수 전, 수순 0)은 초 60%, 그 밖은 시험마다 정한다.
  fake().onceScore = (ref) => (ref.moves.length === 0 ? { score: scoreFor(0.6) } : null);
});
// 앞 시험의 훅을 내린다. 남겨 두면 그 훅이 0.2초 뒤 엔진에 묻는 것이 다음 시험에 섞인다.
afterEach(cleanup);

describe("엔진에 묻기", () => {
  it("합법수를 받기 전에는 판이 잠기고, 받으면 내 기물을 집을 수 있다. 한수쉼은 갈 곳에 없다", async () => {
    let held = true;
    fake().holdProbe = () => held;
    const { hook } = 띄운다([판("g", { 1: "c4c5" })]);
    act(() => hook.result.current.show("g:1"));
    await waitFor(() => expect(fake().heldProbes).toBe(1));
    expect(hook.result.current.note.kind).toBe("preparing");
    expect(hook.result.current.view.canPick("a4")).toBe(false);

    held = false;
    act(() => fake().releaseProbes());
    await waitFor(() => expect(hook.result.current.note.kind).toBe("start"));
    expect(hook.result.current.view.canPick("a4")).toBe(true);
    // 궁을 집으면 한수쉼(제자리)이 갈 곳에 없다. 가짜 규칙에서 궁의 갈 곳은 앞뒤·옆의 빈 칸이다.
    act(() => hook.result.current.view.onSquareClick("e2"));
    expect(hook.result.current.view.targets).not.toContain("e2");
  });

  it("문제를 열면 합법수를 묻고, 이어서 문제 국면을 힌트와 같은 탐색량으로 미리 잰다. 그 판의 수순을 그대로 넘긴다", async () => {
    const { hook } = 띄운다([판("g", { 3: "e4e5" })]);
    act(() => hook.result.current.show("g:3"));
    await waitFor(() => expect(fake().onceCalls.length).toBe(1));
    expect(fake().probes).toHaveLength(1);
    expect(fake().onceCalls[0]).toMatchObject({ limits: MISTAKE_LIMITS });
    // 수순 둘(a4a5 a7a6) 뒤의 국면이다.
    expect(fake().onceCalls[0].key).toBe(fake().probes[0]);
    expect(fake().onceCalls[0].key).toContain("a4a5 a7a6");
  });

  it("엔진이 아직 안 떴거나 못 떴으면 그 말이 서고 판이 잠긴다. 맞음으로 넘어가지 않는다", async () => {
    const { hook } = 띄운다([판("g", { 1: "c4c5" })], { engine: null, engineStatus: "loading" });
    act(() => hook.result.current.show("g:1"));
    expect(hook.result.current.note.kind).toBe("loading");
    expect(hook.result.current.view.canPick("a4")).toBe(false);
    hook.rerender({ engine: fake() as unknown as JanggiEngine, engineStatus: "error", active: true, games: [판("g", { 1: "c4c5" })] });
    expect(hook.result.current.note.kind).toBe("broken");
    expect(hook.result.current.view.canPick("a4")).toBe(false);
  });

  it("합법수를 못 받으면 그 말이 서고, 다시 묻기로 다시 묻는다", async () => {
    let failing = true;
    const probe = fake().probe.bind(fake());
    const spy = vi.spyOn(fake(), "probe").mockImplementation((ref) => (failing ? Promise.reject(new Error("끊김")) : probe(ref)));
    const { hook } = 띄운다([판("g", { 1: "c4c5" })]);
    act(() => hook.result.current.show("g:1"));
    await waitFor(() => expect(hook.result.current.note.kind).toBe("probeFailed"));
    failing = false;
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.note.kind).toBe("start"));
    spy.mockRestore();
  });

  it("엔진에 걸 규칙은 연 문제의 판 규칙이다. 연 문제가 없으면 null(App 이 대국 쪽 규칙을 쓴다)", async () => {
    const { hook } = 띄운다([판("g", { 1: "c4c5" }, { variant: "janggimodern" })]);
    expect(hook.result.current.variant).toBeNull();
    act(() => hook.result.current.show("g:1"));
    expect(hook.result.current.variant).toBe("janggimodern");
  });
});

describe("판정", () => {
  it("복기에 적힌 AI 의 수는 엔진을 기다리지 않고 맞음이다. 판은 문제 국면으로 돌아가 AI 의 수를 화살표로 보인다", async () => {
    const { hook } = 띄운다([판("g", { 1: "c4c5" })]);
    await 첫문제를연다(hook);
    await waitFor(() => expect(fake().onceCalls.length).toBe(1));
    둔다(hook, "c4c5");
    expect(hook.result.current.note).toMatchObject({ kind: "verdict", verdict: { kind: "best" } });
    expect(hook.result.current.done).toBe(true);
    expect(fake().onceCalls).toHaveLength(1); // 둔 뒤 국면을 재지 않았다
    expect(hook.result.current.view.board).toEqual(parseFen(hook.result.current.open!.fen).board);
    expect(hook.result.current.view.bestMove).toEqual({ from: "c4", to: "c5" });
    expect(hook.result.current.view.lastMove).toEqual({ from: "c4", to: "c5" });
    expect(hook.result.current.view.canPick("e4")).toBe(false); // 한 번 두면 끝이다
  });

  it("그때 둔 수는 엔진을 기다리지 않고 틀림이다", async () => {
    const { hook } = 띄운다([판("g", { 1: "c4c5" })]);
    await 첫문제를연다(hook);
    둔다(hook, "a4a5");
    expect(hook.result.current.note).toMatchObject({ kind: "verdict", verdict: { kind: "again" } });
  });

  it("그 밖의 수는 둔 뒤 국면을 같은 탐색량으로 재고, 승률이 5%p 보다 덜 떨어지면 좋은 수(맞음)다", async () => {
    fake().onceScore = (ref) => ({ score: scoreFor(ref.moves.length === 0 ? 0.6 : 0.57) });
    const { hook } = 띄운다([판("g", { 1: "c4c5" })]);
    await 첫문제를연다(hook);
    둔다(hook, "e4e5");
    await waitFor(() => expect(hook.result.current.note.kind).toBe("verdict"));
    expect(hook.result.current.note).toMatchObject({
      verdict: { kind: "measured", grade: "good", before: 60, after: 57 },
      move: expect.any(String),
    });
    expect(fake().onceCalls.map((c) => c.limits)).toEqual([MISTAKE_LIMITS, MISTAKE_LIMITS]);
    expect(fake().onceCalls[1].key).toContain("e4e5");
  });

  it("5%p 넘게 떨어지면 아쉬운 수(틀림)다", async () => {
    fake().onceScore = (ref) => ({ score: scoreFor(ref.moves.length === 0 ? 0.6 : 0.5) });
    const { hook } = 띄운다([판("g", { 1: "c4c5" })]);
    await 첫문제를연다(hook);
    둔다(hook, "e4e5");
    await waitFor(() => expect(hook.result.current.note.kind).toBe("verdict"));
    expect(hook.result.current.note).toMatchObject({ verdict: { grade: "inaccuracy", before: 60, after: 50 } });
  });

  it("한을 잡은 판은 한의 승률로 잰다", async () => {
    // 문제 국면(수순 하나 뒤)은 초 40% = 한 60%, 둔 뒤 초 52% = 한 48%: 12%p 떨어짐.
    fake().onceScore = (ref) => ({ score: scoreFor(ref.moves.length === 1 ? 0.4 : 0.52) });
    const { hook } = 띄운다([판("g", { 2: "c7c6" }, { mySide: "han" })]);
    await 첫문제를연다(hook);
    expect(hook.result.current.view.flipped).toBe(true);
    둔다(hook, "e7e6");
    await waitFor(() => expect(hook.result.current.note.kind).toBe("verdict"));
    expect(hook.result.current.note).toMatchObject({ verdict: { grade: "inaccuracy", before: 60, after: 48 } });
  });

  it("재는 동안 판이 잠기고 내 수를 둔 국면이 선다. 다 재면 답이 나온다", async () => {
    fake().onceScore = (ref) => ({ score: scoreFor(ref.moves.length === 0 ? 0.6 : 0.59) });
    const { hook } = 띄운다([판("g", { 1: "c4c5" })]);
    await 첫문제를연다(hook);
    await waitFor(() => expect(fake().onceCalls.length).toBe(1));
    fake().holdOnce = true;
    둔다(hook, "e4e5");
    expect(hook.result.current.note.kind).toBe("measuring");
    expect(hook.result.current.view.board.e5).toBe("P");
    expect(hook.result.current.view.board.e4).toBeUndefined();
    expect(hook.result.current.view.canPick("g4")).toBe(false);
    await waitFor(() => expect(fake().onceCalls.length).toBe(2));
    act(() => fake().releaseOnce());
    await waitFor(() => expect(hook.result.current.note.kind).toBe("verdict"));
  });

  it("문제 국면을 다 재기 전에 두면 그것이 끝난 뒤에 둔 뒤 국면을 잰다(앞의 것을 버리지 않는다)", async () => {
    fake().onceScore = (ref) => ({ score: scoreFor(ref.moves.length === 0 ? 0.6 : 0.58) });
    fake().holdOnce = true;
    const { hook } = 띄운다([판("g", { 1: "c4c5" })]);
    await 첫문제를연다(hook);
    await waitFor(() => expect(fake().onceCalls.length).toBe(1));
    둔다(hook, "e4e5");
    // 앞의 것이 끝나지 않아 둔 뒤 국면은 아직 묻지 않았다.
    expect(fake().onceCalls).toHaveLength(1);
    act(() => fake().releaseOnce());
    await waitFor(() => expect(hook.result.current.note.kind).toBe("verdict"));
    expect(fake().onceCalls).toHaveLength(2);
  });

  it("재다가 다시 풀기를 누르면 늦게 온 답을 버린다", async () => {
    fake().onceScore = (ref) => ({ score: scoreFor(ref.moves.length === 0 ? 0.6 : 0.3) });
    const { hook } = 띄운다([판("g", { 1: "c4c5" })]);
    await 첫문제를연다(hook);
    await waitFor(() => expect(fake().onceCalls.length).toBe(1));
    fake().holdOnce = true;
    둔다(hook, "e4e5");
    await waitFor(() => expect(fake().onceCalls.length).toBe(2));
    act(() => hook.result.current.restart());
    act(() => fake().releaseOnce());
    await new Promise((r) => setTimeout(r, 50));
    expect(hook.result.current.note.kind).toBe("start");
    expect(hook.result.current.done).toBe(false);
  });

  it("재지 못하면(엔진 답에 점수 줄이 없음) 그 말이 서고 맞음으로 넘어가지 않는다", async () => {
    fake().onceScore = null;
    const { hook } = 띄운다([판("g", { 1: "c4c5" })]);
    await 첫문제를연다(hook);
    둔다(hook, "e4e5");
    await waitFor(() => expect(hook.result.current.note.kind).toBe("measureFailed"));
    expect(hook.result.current.done).toBe(false);
  });
});

describe("오가기", () => {
  it("다음 문제는 목록 순서의 다음이고, 마지막이면 없다", () => {
    const { hook } = 띄운다([판("g", { 1: "c4c5", 3: "e4e5" })]);
    act(() => hook.result.current.show("g:1"));
    expect(hook.result.current.next?.id).toBe("g:3");
    act(() => hook.result.current.show("g:3"));
    expect(hook.result.current.next).toBeNull();
  });

  it("기보에서 보기는 그 판을 큰 실수의 수 번호로 연다", () => {
    const { hook, onOpenGame } = 띄운다([판("g", { 3: "e4e5" })]);
    act(() => hook.result.current.show("g:3"));
    act(() => hook.result.current.openInGames());
    expect(onOpenGame).toHaveBeenCalledWith("g", 3);
  });

  it("화면을 떠나면 연 문제를 닫는다", () => {
    const games = [판("g", { 1: "c4c5" })];
    const { hook } = 띄운다(games);
    act(() => hook.result.current.show("g:1"));
    hook.rerender({ engine: null, engineStatus: "ready", active: false, games });
    expect(hook.result.current.open).toBeNull();
  });
});
