// 국면 만들기 - 놓을 수 있는 자리, 놓기·빼기·옮기기, 엔진에 넘기기 전 국면 검사
//
// 잘못된 국면은 엔진에 넘기지 않는다. 엔진은 궁이 없는 판에도 합법수를 내고, 둘 차례가 아닌
// 쪽 궁이 장군을 받는 판에서는 궁을 잡는 수를 내놓는다(2026-11-07 분석판 설계에서 엔진에 넣어
// 확인). 그래서 그 둘은 여기 검사가 막아야 한다.

import { describe, expect, it } from "vitest";
import type { Board, Position } from "./board";
import { START_FEN, parseFen } from "./board";
import {
  MAX_COUNT,
  allowedAt,
  isFull,
  movePiece,
  placePiece,
  placeRefusal,
  removePiece,
  setupProblems,
} from "./editor";

const pos = (board: Board, turn: Position["turn"] = "cho"): Position => ({
  board,
  turn,
  halfmove: 0,
  fullmove: 1,
});

describe("놓을 수 있는 자리", () => {
  it("궁·사는 제 궁성 안에만 놓인다", () => {
    expect(allowedAt("K", "e2")).toBe(true);
    expect(allowedAt("K", "d3")).toBe(true);
    expect(allowedAt("K", "e5")).toBe(false);
    expect(allowedAt("K", "e9")).toBe(false); // 한의 궁성
    expect(allowedAt("a", "f10")).toBe(true);
    expect(allowedAt("a", "f1")).toBe(false);
  });

  it("졸·병은 처음 줄보다 뒤에 놓이지 않는다", () => {
    expect(allowedAt("P", "a4")).toBe(true);
    expect(allowedAt("P", "a3")).toBe(false);
    expect(allowedAt("P", "e1")).toBe(false);
    expect(allowedAt("P", "e10")).toBe(true);
    expect(allowedAt("p", "a7")).toBe(true);
    expect(allowedAt("p", "a8")).toBe(false);
  });

  it("다른 기물은 어디든 놓인다", () => {
    for (const s of ["a1", "e5", "i10", "e2"]) {
      expect(allowedAt("R", s)).toBe(true);
      expect(allowedAt("b", s)).toBe(true);
    }
  });
});

describe("놓기", () => {
  it("빈 자리에 놓고, 있던 기물은 바꾼다", () => {
    const b1 = placePiece({}, "R", "a1");
    expect(b1).toEqual({ a1: "R" });
    expect(placePiece(b1, "c", "a1")).toEqual({ a1: "c" });
  });

  it("다 놓은 기물은 더 놓지 못한다", () => {
    const board: Board = { a1: "R", i1: "R" };
    expect(isFull(board, "R")).toBe(true);
    expect(isFull(board, "r")).toBe(false);
    expect(placeRefusal(board, "R", "e5")).toBe("초의 차는 2개까지 놓을 수 있습니다.");
    expect(placePiece(board, "R", "e5")).toBe(board);
  });

  it("졸은 다섯까지다", () => {
    expect(MAX_COUNT.p).toBe(5);
    const five: Board = { a4: "P", c4: "P", e4: "P", g4: "P", i4: "P" };
    expect(placeRefusal(five, "P", "b4")).toBe("초의 졸은 5개까지 놓을 수 있습니다.");
    expect(placeRefusal(five, "p", "b7")).toBeNull();
  });

  it("다 놓은 기물이라도 같은 기물이 있던 자리를 바꾸는 것은 셈이 늘지 않는다", () => {
    const board: Board = { a1: "R", i1: "R", e5: "c" };
    // 한의 포 자리에 초의 차를 놓으면 차가 셋이 된다 - 막는다.
    expect(placeRefusal(board, "R", "e5")).not.toBeNull();
    // 초의 차 자리에 다시 차 - 그대로다.
    expect(placeRefusal(board, "R", "a1")).toBeNull();
  });

  it("궁은 하나라 다시 놓으면 옮겨 간다", () => {
    const board: Board = { e2: "K", e9: "k" };
    expect(isFull(board, "K")).toBe(false);
    expect(placePiece(board, "K", "d1")).toEqual({ d1: "K", e9: "k" });
  });

  it("궁성 밖·처음 줄 뒤는 까닭을 돌려주고 놓지 않는다", () => {
    expect(placeRefusal({}, "K", "e5")).toBe("궁은 궁성 안에만 놓을 수 있습니다.");
    expect(placeRefusal({}, "A", "a1")).toBe("사는 궁성 안에만 놓을 수 있습니다.");
    expect(placeRefusal({}, "p", "a9")).toBe("병은 뒤로 가지 못해서 처음 줄보다 뒤에는 놓을 수 없습니다.");
    expect(placePiece({}, "K", "e5")).toEqual({});
  });
});

describe("빼기·옮기기", () => {
  it("뺀다", () => {
    expect(removePiece({ a1: "R", e2: "K" }, "a1")).toEqual({ e2: "K" });
    const same: Board = { e2: "K" };
    expect(removePiece(same, "a1")).toBe(same);
  });

  it("옮기고, 가는 자리의 기물은 없어진다", () => {
    expect(movePiece({ a1: "R", a5: "p" }, "a1", "a5")).toEqual({ a5: "R" });
  });

  it("옮길 때도 궁성·졸 줄을 지킨다", () => {
    const board: Board = { e2: "K", a4: "P" };
    expect(movePiece(board, "e2", "e5")).toBe(board);
    expect(movePiece(board, "a4", "a3")).toBe(board);
    expect(movePiece(board, "e2", "d1")).toEqual({ d1: "K", a4: "P" });
  });
});

describe("국면 검사", () => {
  it("처음 차림은 맞다", () => {
    expect(setupProblems(parseFen(START_FEN))).toEqual([]);
  });

  it("궁이 없으면 알린다", () => {
    expect(setupProblems(pos({}))).toEqual(["초의 궁이 없습니다.", "한의 궁이 없습니다."]);
    expect(setupProblems(pos({ e2: "K" }))).toEqual(["한의 궁이 없습니다."]);
  });

  it("둘 차례가 아닌 쪽의 궁이 장군을 받고 있으면 알린다", () => {
    // 초 차례인데 초의 차가 한의 궁을 겨눈다. 엔진은 여기서 궁을 잡는 수(e1e10)를 내놓았다.
    const board: Board = { e10: "k", d2: "K", e1: "R" };
    expect(setupProblems(pos(board, "cho"))).toEqual([
      "초 차례인데 한의 궁이 장군을 받고 있습니다. 둘 차례를 바꾸거나 기물을 옮기세요.",
    ]);
    // 한 차례면 한이 장군을 받는 것이라 맞는 국면이다.
    expect(setupProblems(pos(board, "han"))).toEqual([]);
  });

  it("포·마·졸의 장군도 본다", () => {
    // 포: 사이에 기물 하나를 넘는다.
    expect(setupProblems(pos({ e10: "k", e6: "p", e3: "C", d1: "K" }))).toHaveLength(1);
    // 마
    expect(setupProblems(pos({ e10: "k", d8: "N", d1: "K" }))).toHaveLength(1);
    // 졸(한 궁 바로 앞)
    expect(setupProblems(pos({ e9: "k", e8: "P", d1: "K" }))).toHaveLength(1);
    // 막힌 마는 장군이 아니다.
    expect(setupProblems(pos({ e10: "k", d8: "N", d9: "a", d1: "K" }))).toEqual([]);
  });

  it("빅장(두 궁이 마주 봄)과 외통 국면은 막지 않는다", () => {
    expect(setupProblems(pos({ e9: "k", e2: "K" }))).toEqual([]);
    // 한 차례, 한 궁이 외통(초 차 둘)
    expect(setupProblems(pos({ d10: "k", d5: "R", e5: "R", f1: "K" }, "han"))).toEqual([]);
  });

  it("놓을 때 막는 것이 불러온 국면에 있으면 목록에도 선다", () => {
    expect(setupProblems(pos({ e2: "K", e9: "k", a1: "R", b1: "R", c1: "R" }))).toEqual([
      "초의 차가 3개입니다. 2개까지 놓을 수 있습니다.",
    ]);
    expect(setupProblems(pos({ e2: "K", e9: "k", a2: "P" }))).toEqual([
      "a2: 초의 졸은 처음 줄보다 뒤에 있을 수 없습니다.",
    ]);
    expect(setupProblems(pos({ e5: "K", e9: "k" }))[0]).toContain("궁성 안에만");
  });
});
