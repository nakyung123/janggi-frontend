// @vitest-environment jsdom
//
// 혼자 장기 풀기 - 잡는 수만 받고, 두 편을 다 집고, 무르기·처음부터, 막힘, 풂에서 기록
//
// 수는 판을 누르는 길(onSquareClick: 기물 → 갈 곳)로 둔다 - 화면과 같다. 타이머는 없다.

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Board } from "../janggi/board";
import { toFen } from "../janggi/board";
import { splitMove } from "../janggi/notation";
import type { SoloPuzzle } from "../janggi/solo";
import { SOLOS, boardOf, pieceCount } from "../janggi/solo";
import { touchViewOf, useSolo } from "./useSolo";

// jsdom 에는 오디오가 없다. 여기서 볼 것도 아니다.
vi.mock("../audio/sound", () => ({ playMoveSound: vi.fn(), playPickSound: vi.fn() }));

/** 시험용 문제. 판만 쓴다. */
const 문제 = (board: Board): SoloPuzzle => ({
  id: "test",
  level: 1,
  fen: toFen({ board, turn: "cho", halfmove: 0, fullmove: 1 }),
  line: [],
});

function 띄운다(puzzle: SoloPuzzle) {
  const onSolve = vi.fn();
  const hook = renderHook(() => useSolo(puzzle, onSolve));
  return { hook, onSolve, now: () => hook.result.current };
}

/** 기물을 누르고 갈 곳을 누른다. */
function 둔다(hook: ReturnType<typeof 띄운다>["hook"], move: string) {
  const { from, to } = splitMove(move);
  act(() => hook.result.current.onSquareClick(from));
  act(() => hook.result.current.onSquareClick(to));
}

describe("처음", () => {
  it("문제 판으로 시작한다", () => {
    const p = SOLOS[0];
    const { now } = 띄운다(p);
    expect(now().board).toEqual(boardOf(p));
    expect(now().note).toEqual({ kind: "start" });
    expect(now().state).toBe("open");
    expect(now().atStart).toBe(true);
    expect(now().lastMove).toBeNull();
  });

  it("차례가 없다 - 초 기물도 한 기물도 잡을 수가 있으면 집힌다", () => {
    // 초 차 a1 은 한 차 a9 를, 한 차 a9 는 초 차 a1 을 잡을 수 있다.
    const { now } = 띄운다(문제({ a1: "R", a9: "r" }));
    expect(now().canPick("a1")).toBe(true);
    expect(now().canPick("a9")).toBe(true);
  });

  it("잡을 것이 없는 기물은 집히지 않는다", () => {
    // 초 졸 c5 는 옆·앞이 비었다. 초 차 e5 는 한 졸 e8 을 잡는다.
    const { now } = 띄운다(문제({ e5: "R", e8: "p", c5: "P" }));
    expect(now().canPick("e5")).toBe(true);
    expect(now().canPick("c5")).toBe(false);
  });

  it("기물을 집으면 잡을 수 있는 자리만 찍힌다 - 빈 자리는 없다", () => {
    const { hook, now } = 띄운다(문제({ e5: "R", e8: "p", c5: "P" }));
    act(() => hook.result.current.onSquareClick("e5"));
    expect(now().targets).toEqual(["e8"]);
  });
});

describe("규칙에 어긋나는 수는 판이 받지 않는다", () => {
  it("빈 자리로 옮기지 못한다", () => {
    const { hook, now } = 띄운다(문제({ e5: "R", e8: "p", c5: "P" }));
    둔다(hook, "e5e6");
    expect(now().board).toEqual({ e5: "R", e8: "p", c5: "P" });
    expect(now().atStart).toBe(true);
  });

  it("같은 편은 잡지 못한다", () => {
    // 초 차 a1 위의 초 졸 a5, 그 위 한 차 a9. 초 차는 초 졸을 못 잡는다(한 차는 초 졸을 잡는다).
    const { hook, now } = 띄운다(문제({ a1: "R", a5: "P", a9: "r" }));
    expect(now().canPick("a1")).toBe(false);
    둔다(hook, "a1a5");
    expect(now().board).toEqual({ a1: "R", a5: "P", a9: "r" });
    둔다(hook, "a9a5");
    expect(now().board).toEqual({ a1: "R", a5: "r" });
  });

  it("끌어서 두어도 같다 - 둘 수 없는 수는 받지 않는다", () => {
    const { hook, now } = 띄운다(문제({ a1: "R", a5: "P", a9: "r" }));
    act(() => hook.result.current.onMove("a1", "a5"));
    expect(now().atStart).toBe(true);
    act(() => hook.result.current.onMove("a9", "a5"));
    expect(now().board).toEqual({ a1: "R", a5: "r" });
    // 끈 기물은 손으로 이미 옮겼으니 날리지 않는다.
    expect(now().flyMove).toBeNull();
  });
});

describe("판 만지기에 넘기는 칠한 국면", () => {
  it("모든 기물을 초로 칠하고 초 차례다", () => {
    expect(touchViewOf({ a1: "R", a9: "r", e5: "p" })).toEqual({
      board: { a1: "R", a9: "R", e5: "P" },
      turn: "cho",
      halfmove: 0,
      fullmove: 1,
    });
  });

  it("판 그림에는 원래 색의 판이 간다 - 한 기물이 잡은 뒤에도 그 자리는 한이다", () => {
    const { hook, now } = 띄운다(문제({ a1: "R", a5: "P", a9: "r" }));
    expect(now().board).toEqual({ a1: "R", a5: "P", a9: "r" });
    둔다(hook, "a9a5");
    expect(now().board.a5).toBe("r");
  });

  it("둘 수 있는 수와 판정은 원래 색으로 한다 - 칠한 판으로 냈다면 이 잡기는 없다", () => {
    // 원래 판: 초 차 a1 과 한 차 a5. 칠한 판에서는 둘 다 초라 서로 못 잡는다. 둘 수 있는 수를 원래
    // 색으로 내므로 잡힌다. 그 뒤 하나가 남아 풀린다.
    const { hook, now, onSolve } = 띄운다(문제({ a1: "R", a5: "r" }));
    expect(now().canPick("a1")).toBe(true);
    act(() => hook.result.current.onSquareClick("a1"));
    expect(now().targets).toEqual(["a5"]);
    act(() => hook.result.current.onSquareClick("a5"));
    expect(now().board).toEqual({ a5: "R" });
    expect(now().state).toBe("solved");
    expect(onSolve).toHaveBeenCalledTimes(1);
  });
});

describe("두기", () => {
  it("눌러서 두면 잡은 기물이 날아가고 잡힌 기물을 알린다. 남은 기물 수가 알림에 선다", () => {
    const { hook, now } = 띄운다(문제({ a1: "R", a5: "p", a9: "r" }));
    둔다(hook, "a1a5");
    expect(now().flyMove).toMatchObject({ from: "a1", to: "a5", captured: "p" });
    expect(now().lastMove).toEqual({ from: "a1", to: "a5" });
    expect(now().note).toEqual({ kind: "left", count: 2 });
    expect(now().atStart).toBe(false);
  });

  it("데이터의 답대로 두면 풀린다. 기록은 그때 한 번 부른다", () => {
    for (const p of [SOLOS[0], SOLOS[12], SOLOS[24]]) {
      const { hook, now, onSolve } = 띄운다(p);
      for (const move of p.line) 둔다(hook, move);
      expect(pieceCount(now().board)).toBe(1);
      expect(now().state).toBe("solved");
      expect(now().note).toEqual({ kind: "solved" });
      expect(onSolve).toHaveBeenCalledTimes(1);
      expect(onSolve).toHaveBeenCalledWith(p.id);
      // 풀린 뒤에는 판이 잠긴다.
      const [square] = Object.keys(now().board);
      expect(now().canPick(square)).toBe(false);
    }
  });
});

describe("막힘 · 무르기 · 처음부터", () => {
  // 초 차 a1·한 차 a9·초 졸 i9. 어느 수를 두어도 남은 둘이 같은 편이거나 서로 닿지 않는다.
  const 막히는문제 = 문제({ a1: "R", a9: "r", i9: "P" });

  it("둘 이상 남았는데 잡을 수 없으면 막힘이다", () => {
    const { hook, now, onSolve } = 띄운다(막히는문제);
    둔다(hook, "a1a9");
    expect(now().state).toBe("stuck");
    expect(now().note).toEqual({ kind: "stuck" });
    expect(onSolve).not.toHaveBeenCalled();
  });

  it("한 수 무르면 앞 판으로 돌아가고, 처음 판이면 무르기가 할 일이 없다", () => {
    const { hook, now } = 띄운다(막히는문제);
    둔다(hook, "a1a9");
    act(() => now().undo());
    expect(now().board).toEqual(boardOf(막히는문제));
    expect(now().note).toEqual({ kind: "start" });
    expect(now().atStart).toBe(true);
    expect(now().lastMove).toBeNull();
    act(() => now().undo());
    expect(now().board).toEqual(boardOf(막히는문제));
  });

  it("여러 수 둔 뒤 처음부터 누르면 문제 판으로 돌아간다", () => {
    const p = SOLOS[24];
    const { hook, now } = 띄운다(p);
    for (const move of p.line.slice(0, 3)) 둔다(hook, move);
    act(() => now().undo());
    expect(pieceCount(now().board)).toBe(pieceCount(boardOf(p)) - 2);
    act(() => now().restart());
    expect(now().board).toEqual(boardOf(p));
    expect(now().atStart).toBe(true);
    expect(now().selected).toBeNull();
  });

  it("푼 뒤 무르고 다시 풀면 기록을 다시 부른다(같은 id 라 기록에는 하나만 남는다 - 화면이 합친다)", () => {
    const p = SOLOS[0];
    const { hook, now, onSolve } = 띄운다(p);
    for (const move of p.line) 둔다(hook, move);
    act(() => now().undo());
    expect(now().state).toBe("open");
    둔다(hook, p.line[p.line.length - 1]);
    expect(onSolve).toHaveBeenCalledTimes(2);
  });
});
