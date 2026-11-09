// @vitest-environment jsdom
//
// 혼자 장기 화면 - 메뉴에서 열고, 규칙을 읽고, 목록에서 문제를 끝까지 풀고, 푼 기록이 이 기기에 남는다
//
// 수는 판의 교차점을 눌러 둔다(기물 → 갈 곳). 메뉴 시험은 App 을 띄우므로 가짜 엔진을 쓴다(이 화면은
// 엔진을 쓰지 않는다). 어느 폭에서 무엇이 보이는지는 CSS 가 정하고 jsdom 은 CSS 를 읽지 않는다 -
// 모양은 캡처로 본다.

import "../../test/browser";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import type { Board } from "../../janggi/board";
import { splitMove, toJanggiCoord } from "../../janggi/notation";
import { SIDE_LABEL, pieceInfo, sideOf } from "../../janggi/pieces";
import type { SoloPuzzle } from "../../janggi/solo";
import { LEVEL_LABEL, SOLOS, boardOf, capturesOf, pieceCount, playCapture, stateOf } from "../../janggi/solo";
import { FakeEngine } from "../../test/fakeEngine";
import { SoloScreen } from "./SoloScreen";

vi.mock("../../engine/engine", async () => ({
  JanggiEngine: (await import("../../test/fakeEngine")).FakeEngine,
}));

vi.mock("../../report/events", () => ({ track: () => {} }));

beforeEach(() => {
  localStorage.clear();
  FakeEngine.current.reset();
});
afterEach(cleanup);

const KEY = "janggi:solo-solved";
const 묶음 = (level: number) => SOLOS.filter((p) => p.level === level);
const 기록 = () => JSON.parse(localStorage.getItem(KEY) ?? "null");

// --- 메뉴 ------------------------------------------------------------------------

describe("메뉴", () => {
  it("문제 묶음의 혼자 장기를 누르면 제목과 규칙 카드가 선다", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "새 대국" })).toBeTruthy());
    const 모드 = within(screen.getByRole("complementary", { name: "왼쪽 메뉴" })).getByRole("navigation", { name: "모드" });
    fireEvent.click(within(모드).getByRole("button", { name: "혼자 장기" }));
    expect(screen.getByRole("heading", { level: 2, name: "혼자 장기" })).toBeTruthy();
    const 규칙 = screen.getByRole("region", { name: "규칙" });
    expect(within(규칙).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "잡는 수만 둡니다. 빈 자리로는 옮기지 못합니다.",
      "초 기물은 한 기물만, 한 기물은 초 기물만 잡습니다.",
      "차례는 없습니다. 어느 편 기물이든 먼저 둘 수 있습니다.",
      "기물은 대국과 똑같이 움직입니다. 포는 포를 넘지도 잡지도 못합니다.",
      "기물이 하나만 남으면 풀립니다. 궁이 없어 장군은 없습니다.",
    ]);
  });
});

// --- 목록 ------------------------------------------------------------------------

const 묶음칸 = (level: number) => screen.getByRole("region", { name: LEVEL_LABEL[level as 1 | 2 | 3] });
const 줄 = (level: number, no: number) =>
  within(묶음칸(level)).getByRole("button", { name: new RegExp(`^${no}번(,|$)`) });

describe("목록", () => {
  it("쉬움 · 보통 · 어려움 묶음에 12문제씩 번호 순서로 서고, 줄마다 기물 수가 붙는다", () => {
    render(<SoloScreen />);
    for (const level of [1, 2, 3]) {
      const 기대 = 묶음(level).map((p, i) => `${i + 1}번, 기물 ${pieceCount(boardOf(p))}개`);
      expect(within(묶음칸(level)).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(기대);
      expect(within(묶음칸(level)).getByText("12문제 · 0개 풂")).toBeTruthy();
    }
  });
});

// --- 풀기 ------------------------------------------------------------------------

const 판 = () => screen.getByRole("grid", { name: "장기판" });
const 교차점 = (square: string) => 판().querySelector(`[data-square="${square}"]`)!;
const 알림 = () => screen.getByRole("status").textContent;
const 단추 = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

/** 기물을 누르고 갈 곳을 누른다. */
function 둔다(move: string) {
  const { from, to } = splitMove(move);
  fireEvent.pointerUp(교차점(from));
  fireEvent.pointerUp(교차점(to));
}

const 연다 = (p: SoloPuzzle) => fireEvent.click(줄(p.level, 묶음(p.level).indexOf(p) + 1));

/** 그 판이면 교차점에 붙을 이름(Board.tsx 의 gridcell 이름: "43 한 병", 빈 자리는 "43"). */
function 기대이름(board: Board, square: string): string {
  const piece = board[square];
  const coord = toJanggiCoord(square);
  return piece ? `${coord} ${SIDE_LABEL[sideOf(piece)]} ${pieceInfo(piece).name}` : coord;
}

/** 화면이 그린 판이 이 판과 같은지 - 교차점 90개의 이름을 모두 견준다. */
function 판이같다(board: Board) {
  const cells = [...판().querySelectorAll("[data-square]")];
  expect(cells).toHaveLength(90);
  for (const cell of cells) {
    const square = cell.getAttribute("data-square")!;
    expect(cell.getAttribute("aria-label")).toBe(기대이름(board, square));
  }
}

describe("풀기", () => {
  it.each([1, 2, 3])("묶음 %i 의 첫 문제 - 답대로 두면 풀리고, 목록에 푼 표시가 선다", (level) => {
    const p = 묶음(level)[0];
    render(<SoloScreen />);
    연다(p);
    expect(screen.getByRole("heading", { level: 2, name: `${LEVEL_LABEL[p.level]} · 1번` })).toBeTruthy();
    expect(screen.getByText(`기물 ${pieceCount(boardOf(p))}개 · 하나만 남기세요`)).toBeTruthy();
    expect(알림()).toBe("상대 편 기물을 잡아 하나만 남기세요.");
    expect(단추("한 수 무르기").disabled).toBe(true);
    expect(단추("처음부터").disabled).toBe(true);

    let board = boardOf(p);
    판이같다(board);
    for (const [i, move] of p.line.entries()) {
      둔다(move);
      board = playCapture(board, move);
      // 화면의 판이 규칙대로 둔 판과 같다.
      판이같다(board);
      if (i < p.line.length - 1) expect(알림()).toBe(`남은 기물 ${pieceCount(board)}개.`);
    }
    expect(알림()).toBe("하나만 남았습니다. 풀었습니다.");
    expect(screen.getByRole("button", { name: "다음 문제" })).toBeTruthy();
    expect(기록()).toEqual({ solved: [p.id] });

    fireEvent.click(단추("목록으로"));
    expect(줄(level, 1).getAttribute("aria-label")).toBe(`1번, 풂, 기물 ${pieceCount(boardOf(p))}개`);
    expect(within(묶음칸(level)).getByText("12문제 · 1개 풂")).toBeTruthy();
  });

  it("빈 자리를 눌러도 기물이 옮겨지지 않는다", () => {
    const p = 묶음(1)[0];
    render(<SoloScreen />);
    연다(p);
    const board = boardOf(p);
    const { from } = splitMove(p.line[0]);
    const 빈자리 = ["a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1", "i1", "a2"].find((s) => !board[s])!;
    fireEvent.pointerUp(교차점(from));
    fireEvent.pointerUp(교차점(빈자리));
    판이같다(board);
    expect(알림()).toBe("상대 편 기물을 잡아 하나만 남기세요.");
    expect(단추("처음부터").disabled).toBe(true);
  });

  it("집은 기물에는 잡을 수 있는 자리에만 붉은 테가 서고 빈 자리 점은 없다", () => {
    const p = 묶음(1)[0];
    render(<SoloScreen />);
    연다(p);
    const { from } = splitMove(p.line[0]);
    fireEvent.pointerUp(교차점(from));
    const svg = 판().closest("svg")!;
    const 잡을곳 = capturesOf(boardOf(p)).filter((m) => splitMove(m).from === from).length;
    expect(svg.querySelectorAll(".target-capture")).toHaveLength(잡을곳);
    expect(svg.querySelectorAll(".target")).toHaveLength(0);
  });

  it("막히면 그렇다고 알리고, 한 수 무르기와 처음부터로 돌아간다", () => {
    // 첫 수 가운데 막히는 길로 가는 것을 고르고, 막힐 때까지 첫 잡기를 이어 둔다.
    const p = 묶음(2)[0];
    let board = boardOf(p);
    const played: string[] = [];
    const 막히는첫수 = capturesOf(board).find((m) => {
      let b = playCapture(board, m);
      while (stateOf(b) === "open") b = playCapture(b, capturesOf(b)[0]);
      return stateOf(b) === "stuck";
    })!;
    expect(막히는첫수).toBeTruthy();
    board = playCapture(board, 막히는첫수);
    played.push(막히는첫수);
    while (stateOf(board) === "open") {
      const m = capturesOf(board)[0];
      board = playCapture(board, m);
      played.push(m);
    }

    render(<SoloScreen />);
    연다(p);
    for (const m of played) 둔다(m);
    expect(알림()).toBe("더 잡을 수 있는 수가 없습니다. 한 수 무르거나 처음부터 하세요.");
    expect(screen.queryByRole("button", { name: "다음 문제" })).toBeNull();

    fireEvent.click(단추("한 수 무르기"));
    expect(알림()).toBe(played.length === 1 ? "상대 편 기물을 잡아 하나만 남기세요." : `남은 기물 ${pieceCount(board) + 1}개.`);
    fireEvent.click(단추("처음부터"));
    expect(알림()).toBe("상대 편 기물을 잡아 하나만 남기세요.");
    판이같다(boardOf(p));
    expect(단추("처음부터").disabled).toBe(true);
    expect(기록()).toBeNull();
  });

  it("다음 문제는 전체 순서의 다음이고, 묶음이 바뀌어도 이어진다", () => {
    const p = 묶음(1)[11];
    render(<SoloScreen />);
    연다(p);
    for (const m of p.line) 둔다(m);
    fireEvent.click(단추("다음 문제"));
    expect(screen.getByRole("heading", { level: 2, name: "보통 · 1번" })).toBeTruthy();
  });
});

// --- 푼 기록 ---------------------------------------------------------------------

function 푼다(p: SoloPuzzle) {
  연다(p);
  for (const m of p.line) 둔다(m);
  fireEvent.click(단추("목록으로"));
}

describe("푼 기록", () => {
  it("화면을 다시 열어도(새로고침) 푼 표시가 남는다", () => {
    const p = 묶음(1)[2];
    const first = render(<SoloScreen />);
    푼다(p);
    first.unmount();
    render(<SoloScreen />);
    expect(줄(1, 3).getAttribute("aria-label")).toMatch(/^3번, 풂, /);
  });

  it("같은 문제를 다시 풀어도 기록에는 하나만 남는다", () => {
    const p = 묶음(1)[0];
    render(<SoloScreen />);
    푼다(p);
    푼다(p);
    expect(기록()).toEqual({ solved: [p.id] });
  });

  it("다른 탭이 그사이 남긴 기록을 지우지 않는다", () => {
    const [a, b] = 묶음(1);
    render(<SoloScreen />);
    // 이 화면이 뜬 뒤 다른 탭이 b 를 풀었다.
    localStorage.setItem(KEY, JSON.stringify({ solved: [b.id] }));
    푼다(a);
    expect(기록()).toEqual({ solved: [b.id, a.id] });
  });

  it("데이터에 없는 id 는 지우지 않고 세지도 않는다", () => {
    localStorage.setItem(KEY, JSON.stringify({ solved: ["없는문제id"] }));
    render(<SoloScreen />);
    expect(within(묶음칸(1)).getByText("12문제 · 0개 풂")).toBeTruthy();
    푼다(묶음(1)[0]);
    expect(기록()).toEqual({ solved: ["없는문제id", 묶음(1)[0].id] });
  });

  it.each([
    ["JSON 이 아님", "{풀었음"],
    ["solved 가 배열이 아님", JSON.stringify({ solved: "1ae6292bdb" })],
    ["solved 에 글자 아닌 값", JSON.stringify({ solved: [1, 2] })],
  ])("깨진 값(%s)이면 빈 기록으로 시작하고 다른 키는 그대로다", (_, raw) => {
    localStorage.setItem(KEY, raw);
    localStorage.setItem("janggi:mate-solved", JSON.stringify({ solved: ["d61bb50cd6"] }));
    localStorage.setItem("janggi:sound", "true");
    render(<SoloScreen />);
    for (const level of [1, 2, 3]) expect(within(묶음칸(level)).getByText("12문제 · 0개 풂")).toBeTruthy();
    // 풀기 전에는 깨진 값을 그대로 둔다(읽기만 한다).
    expect(localStorage.getItem(KEY)).toBe(raw);
    푼다(묶음(1)[0]);
    expect(기록()).toEqual({ solved: [묶음(1)[0].id] });
    expect(localStorage.getItem("janggi:mate-solved")).toBe(JSON.stringify({ solved: ["d61bb50cd6"] }));
    expect(localStorage.getItem("janggi:sound")).toBe("true");
  });
});
