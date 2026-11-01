// @vitest-environment jsdom
//
// 배우기 화면 - 메뉴에서 열리고, 기물 화면의 판이 행마 계산(janggi/moves.ts)과 같은 자리를 찍는다
//
// 기물 화면은 글과 판이 같은 것을 말해야 한다. 판의 점이 행마와 다르면 배우기에서 익힌
// 움직임이 대국에서 안 된다(대국은 엔진의 합법수로 둔다). 그래서 미리 차려 둔 국면마다 판에
// 찍힌 자리를 손으로 따진 값과 행마 계산 둘 다와 맞춘다.
//
// 판에 찍힌 자리는 판이 갈 곳으로 표시한 교차점(.hit.active)에서 읽는다. 어느 폭에서 무엇이
// 보이는지는 CSS 가 정하고 jsdom 은 CSS 를 읽지 않는다 - 모양은 캡처로 본다.

import "../../test/browser";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import type { Square } from "../../janggi/board";
import { pieceMoves } from "../../janggi/moves";
import { FakeEngine } from "../../test/fakeEngine";
import { PIECE_LESSONS } from "./pieceScenes";
import { PiecesScreen } from "./PiecesScreen";

vi.mock("../../engine/engine", async () => ({
  JanggiEngine: (await import("../../test/fakeEngine")).FakeEngine,
}));

vi.mock("../../report/events", () => ({ track: () => {} }));

beforeEach(() => {
  localStorage.clear();
  FakeEngine.current.reset();
});
afterEach(cleanup);

// --- 메뉴 --------------------------------------------------------------------

const 왼쪽메뉴 = () => screen.getByRole("complementary", { name: "왼쪽 메뉴" });
function 폰메뉴() {
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  return screen.getByRole("dialog", { name: "메뉴" });
}

describe("메뉴", () => {
  it("왼쪽 메뉴와 폰 메뉴 둘 다 기물이 있고, 누르면 기물 화면이 선다", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "새 대국" })).toBeTruthy());

    fireEvent.click(within(왼쪽메뉴()).getByRole("button", { name: "기물" }));
    expect(screen.getByRole("heading", { level: 2, name: "기물" })).toBeTruthy();

    fireEvent.click(within(왼쪽메뉴()).getByRole("button", { name: "대국" }));
    expect(screen.queryByRole("heading", { level: 2, name: "기물" })).toBeNull();

    fireEvent.click(within(폰메뉴()).getByRole("button", { name: "기물" }));
    expect(screen.getByRole("heading", { level: 2, name: "기물" })).toBeTruthy();
  });
});

// --- 기물 화면 ---------------------------------------------------------------

const 판 = () => screen.getByRole("grid", { name: "장기판" });
/** 판이 갈 곳으로 찍은 자리(엔진 좌표). 순서는 보지 않는다. */
const 찍힌자리 = () =>
  Array.from(판().querySelectorAll(".hit.active"))
    .map((e) => e.getAttribute("data-square"))
    .sort();
const 자리 = (...squares: Square[]) => [...squares].sort();
const 교차점 = (square: Square) => 판().querySelector(`[data-square="${square}"]`)!;
/** 교차점을 누른다(눌러서 두기). */
const 누르기 = (square: Square) => fireEvent.pointerUp(교차점(square));
/** 교차점의 화면 좌표. 판의 화면 크기를 SVG 좌표 그대로 뒀다(test/browser.ts). */
const 좌표 = (square: Square) => ({
  clientX: Number(교차점(square).getAttribute("cx")),
  clientY: Number(교차점(square).getAttribute("cy")),
});
/** 기물을 끌어 옮긴다 - 기물을 누르고, 갈 곳에서 뗀다. */
function 끌기(from: Square, to: Square) {
  fireEvent.pointerDown(document.querySelector(`[data-piece="${from}"]`)!, { ...좌표(from), pointerId: 1 });
  fireEvent.pointerUp(document.querySelector("svg.board")!, { ...좌표(to), pointerId: 1 });
}
const 기물고르기 = (name: string) =>
  fireEvent.click(within(screen.getByRole("group", { name: "기물" })).getByRole("button", { name }));
const 국면고르기 = (name: string) =>
  fireEvent.click(within(screen.getByRole("group", { name: "국면" })).getByRole("button", { name }));
const 처음자리로 = () => screen.getByRole("button", { name: "처음 자리로" }) as HTMLButtonElement;

/**
 * 미리 차려 둔 국면마다 판에 찍혀야 할 자리. 손으로 따졌다. 기물 이름 · 국면 이름 · 자리.
 * 국면이 하나뿐인 기물(궁·사)은 국면 고르기가 없다.
 */
const 국면표: [string, string, Square[]][] = [
  ["궁", "궁성", ["d1", "e1", "f1", "d2", "f2", "d3", "e3", "f3"]],
  ["사", "궁성", ["d2", "e1", "e2"]],
  [
    "차",
    "빈 판",
    ["a5", "b5", "c5", "d5", "f5", "g5", "h5", "i5", "e1", "e2", "e3", "e4", "e6", "e7", "e8", "e9", "e10"],
  ],
  ["차", "막힐 때", ["e6", "d5", "c5", "f5", "g5", "h5", "i5", "e4", "e3", "e2", "e1"]],
  [
    "차",
    "궁성",
    [
      "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d9", "d10",
      "a8", "b8", "c8", "e8", "f8", "g8", "h8", "i8",
      "e9", "f10",
    ],
  ],
  ["포", "넘기", ["b6", "b7", "b8", "b9"]],
  ["포", "포를 만나면", ["e5", "f5"]],
  ["포", "궁성", ["f3"]],
  ["마", "빈 판", ["c4", "c6", "d3", "d7", "f3", "f7", "g4", "g6"]],
  ["마", "멱", ["c4", "c6", "d3", "f3", "g4", "g6"]],
  ["상", "빈 판", ["b3", "b7", "c2", "c8", "g2", "g8", "h3", "h7"]],
  ["상", "멱", ["b3", "b7", "c2", "g2", "h7"]],
  ["졸", "기본", ["d4", "e5", "f4"]],
  ["졸", "상대 궁성", ["d9", "d10", "e10", "f9", "f10"]],
];

describe("기물 화면 - 미리 차려 둔 국면", () => {
  it("모든 국면이 위 표에 있다 - 새 국면을 넣으면 찍힐 자리도 표에 적는다", () => {
    const 화면의국면 = PIECE_LESSONS.flatMap((l) => l.scenes.map((s) => [l.label, s.label]));
    expect(화면의국면).toEqual(국면표.map(([piece, scene]) => [piece, scene]));
  });

  it.each(국면표)("%s · %s: 판에 찍힌 자리가 손으로 따진 자리, 행마 계산과 같다", (piece, scene, 기대) => {
    render(<PiecesScreen />);
    기물고르기(piece);
    if (screen.queryByRole("group", { name: "국면" })) 국면고르기(scene);

    expect(찍힌자리()).toEqual(자리(...기대));
    const lesson = PIECE_LESSONS.find((l) => l.label === piece)!;
    const s = lesson.scenes.find((x) => x.label === scene)!;
    expect(찍힌자리()).toEqual([...pieceMoves(s.board, s.from)].sort());
  });

  it("국면이 하나뿐인 기물은 국면 고르기를 두지 않는다", () => {
    render(<PiecesScreen />);
    기물고르기("궁");
    expect(screen.queryByRole("group", { name: "국면" })).toBeNull();
    기물고르기("차");
    expect(screen.getByRole("group", { name: "국면" })).toBeTruthy();
  });
});

describe("기물 화면 - 옮겨 보기", () => {
  it("점을 누르면 기물이 그리로 가고, 새 자리에서 갈 곳을 다시 찍는다", () => {
    render(<PiecesScreen />);
    기물고르기("차");
    expect(screen.getByRole("gridcell", { name: "65 초 차" })).toBeTruthy();

    누르기("e7");
    expect(screen.getByRole("gridcell", { name: "45 초 차" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "65" })).toBeTruthy();
    expect(찍힌자리()).toEqual(
      자리("a7", "b7", "c7", "d7", "f7", "g7", "h7", "i7", "e1", "e2", "e3", "e4", "e5", "e6", "e8", "e9", "e10")
    );
  });

  it("끌어서 옮겨도 된다", () => {
    render(<PiecesScreen />);
    기물고르기("마");
    끌기("e5", "f7");
    expect(screen.getByRole("gridcell", { name: "46 초 마" })).toBeTruthy();
  });

  it("갈 곳이 아닌 자리와 막는 기물은 눌러도 아무 일이 없다", () => {
    render(<PiecesScreen />);
    기물고르기("마");
    국면고르기("멱");
    누르기("e7");
    누르기("e6");
    끌기("e6", "e7");
    expect(screen.getByRole("gridcell", { name: "65 초 마" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "55 초 졸" })).toBeTruthy();
    expect(찍힌자리()).toEqual(자리("c4", "c6", "d3", "f3", "g4", "g6"));
  });

  it("상대 기물 자리로 가면 그 기물을 잡는다", () => {
    render(<PiecesScreen />);
    기물고르기("차");
    국면고르기("막힐 때");
    누르기("c5");
    expect(screen.getByRole("gridcell", { name: "63 초 차" })).toBeTruthy();
    expect(screen.queryByRole("gridcell", { name: /한 병/ })).toBeNull();
  });

  it("처음 자리로 - 옮긴 기물과 잡힌 기물을 국면 처음으로 되돌리고, 그 뒤에는 잠긴다", () => {
    render(<PiecesScreen />);
    기물고르기("차");
    국면고르기("막힐 때");
    expect(처음자리로().disabled).toBe(true);

    누르기("c5");
    expect(처음자리로().disabled).toBe(false);
    fireEvent.click(처음자리로());
    expect(screen.getByRole("gridcell", { name: "65 초 차" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "63 한 병" })).toBeTruthy();
    expect(처음자리로().disabled).toBe(true);
  });

  it("다른 국면이나 다른 기물을 고르면 그 국면 처음 판이 선다", () => {
    render(<PiecesScreen />);
    기물고르기("차");
    누르기("e7");
    국면고르기("막힐 때");
    expect(screen.getByRole("gridcell", { name: "65 초 차" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "45 초 졸" })).toBeTruthy();

    기물고르기("상");
    expect(screen.getByRole("gridcell", { name: "65 초 상" })).toBeTruthy();
    expect(screen.queryByRole("gridcell", { name: /초 차/ })).toBeNull();
  });
});

describe("기물 화면 - 설명", () => {
  it("고른 기물의 이름, 판 위 글자 그림(초·한), 한쪽 수, 점수를 보인다", () => {
    render(<PiecesScreen />);
    기물고르기("차");
    expect(screen.getByRole("heading", { level: 3, name: "차" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "초 차" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "한 차" })).toBeTruthy();
    expect(screen.getByText("한쪽에 2개 · 13점")).toBeTruthy();

    기물고르기("궁");
    expect(screen.getByText("한쪽에 1개 · 점수 없음")).toBeTruthy();

    기물고르기("졸");
    expect(screen.getByRole("heading", { level: 3, name: "졸·병" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "초 졸" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "한 병" })).toBeTruthy();
    expect(screen.getByText("한쪽에 5개 · 2점")).toBeTruthy();
  });
});
