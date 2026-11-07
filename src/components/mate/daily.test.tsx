// @vitest-environment jsdom
//
// 오늘의 문제 화면 - 메뉴에서 열고, 한국 날짜로 문제가 정해지고, 풀면 외통 문제 목록에도 "풂" 이 선다
//
// 날짜는 가짜 시계로 정한다(vi.setSystemTime). 응수는 0.5초 타이머라 같은 가짜 시계로 앞당긴다.
// 메뉴 시험은 App 을 띄우므로(가짜 엔진이 비동기로 답한다) 진짜 시계로 둔다.

import "../../test/browser";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { REPLY_DELAY_MS } from "../../hooks/useMateSolve";
import type { Position } from "../../janggi/board";
import { dailyOrder } from "../../janggi/daily";
import type { MatePuzzle } from "../../janggi/mate";
import { MATES, positionAt } from "../../janggi/mate";
import { splitMove, toJanggiCoord } from "../../janggi/notation";
import { SIDE_LABEL, pieceInfo, sideOf } from "../../janggi/pieces";
import { FakeEngine } from "../../test/fakeEngine";
import { DailyScreen } from "./DailyScreen";
import { MateScreen } from "./MateScreen";

vi.mock("../../engine/engine", async () => ({
  JanggiEngine: (await import("../../test/fakeEngine")).FakeEngine,
}));

vi.mock("../../report/events", () => ({ track: () => {} }));

beforeEach(() => {
  localStorage.clear();
  FakeEngine.current.reset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const KEY = "janggi:mate-solved";
const 순서 = dailyOrder(MATES);
/** 한국 시각 y-m-d h:mi:s */
const 한국 = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => new Date(Date.UTC(y, m - 1, d, h - 9, mi, s));

/** 그 날짜로 시계를 맞추고 화면을 띄운다. */
function 그날연다(when: Date) {
  vi.useFakeTimers();
  vi.setSystemTime(when);
  return render(<DailyScreen />);
}

const 판 = () => screen.getByRole("grid", { name: "장기판" });
const 교차점 = (square: string) => 판().querySelector(`[data-square="${square}"]`)!;
const 알림 = () => screen.getByRole("status").textContent;

/** 그 국면에서 그 자리의 교차점 이름. 판이 붙이는 이름(좌표 + 진영 + 기물, Board.tsx)과 같은 방식. */
function 칸이름된(pos: Position, square: string): string {
  const piece = pos.board[square];
  const coord = toJanggiCoord(square);
  return piece ? `${coord} ${SIDE_LABEL[sideOf(piece)]} ${pieceInfo(piece).name}` : coord;
}

/** 판의 모든 교차점 이름이 그 문제의 처음 국면과 같은지. */
function 판이(p: MatePuzzle) {
  const cells = [...판().querySelectorAll("[data-square]")];
  expect(cells.length).toBe(90);
  const pos = positionAt(p, 0);
  expect(cells.map((c) => c.getAttribute("aria-label"))).toEqual(
    cells.map((c) => 칸이름된(pos, c.getAttribute("data-square")!))
  );
}

function 둔다(move: string) {
  const { from, to } = splitMove(move);
  fireEvent.pointerUp(교차점(from));
  fireEvent.pointerUp(교차점(to));
}

function 끝까지푼다(p: MatePuzzle) {
  for (let step = 0; step < p.n; step++) {
    둔다(p.line[step * 2]);
    if (step < p.n - 1) act(() => vi.advanceTimersByTime(REPLY_DELAY_MS));
  }
}

describe("메뉴", () => {
  it("메뉴의 오늘의 문제를 누르면 오늘의 문제가 선다", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "새 대국" })).toBeTruthy());
    const 모드 = within(screen.getByRole("complementary", { name: "왼쪽 메뉴" })).getByRole("navigation", { name: "모드" });
    fireEvent.click(within(모드).getByRole("button", { name: "오늘의 문제" }));
    expect(screen.getByRole("heading", { level: 2, name: "오늘의 문제" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "목록으로" })).toBeNull();
  });
});

describe("날짜", () => {
  it("2026-11-07(한국)은 id 순서의 첫 문제이고, 그날의 날짜와 몇 수인지가 선다", () => {
    const p = 순서[0];
    그날연다(한국(2026, 11, 7, 10));
    판이(p);
    expect(screen.getByText(new RegExp(`^11월 7일 · ${p.n}수 외통 · (초가|한이) 둡니다`))).toBeTruthy();
    expect(알림()).toBe(`${p.n}수 안에 외통을 거세요.`);
  });

  it("같은 한국 날짜면 0시에 열든 23시 59분에 열든 같은 문제다", () => {
    const a = 그날연다(한국(2026, 11, 20, 0, 0));
    const 처음 = [...판().querySelectorAll("[data-square]")].map((c) => c.getAttribute("aria-label"));
    a.unmount();
    그날연다(한국(2026, 11, 20, 23, 59));
    expect([...판().querySelectorAll("[data-square]")].map((c) => c.getAttribute("aria-label"))).toEqual(처음);
    판이(순서[13]);
  });

  it("한국 자정이 지나면 다음 문제다 - 한국 0시는 UTC 로 전날 15시다", () => {
    const a = 그날연다(new Date(Date.UTC(2026, 10, 7, 14, 59)));
    판이(순서[0]);
    a.unmount();
    그날연다(new Date(Date.UTC(2026, 10, 7, 15, 0)));
    판이(순서[1]);
    expect(screen.getByText(/^11월 8일 · /)).toBeTruthy();
  });

  it("열어 둔 채 자정을 넘겨도 문제는 바뀌지 않는다", () => {
    그날연다(한국(2026, 11, 7, 23, 59, 50));
    act(() => vi.advanceTimersByTime(60_000));
    판이(순서[0]);
    expect(screen.getByText(/^11월 7일 · /)).toBeTruthy();
  });
});

describe("풀기와 푼 기록", () => {
  it("풀면 외통 문제의 푼 기록에 남고, 내일 새 문제가 나온다는 줄이 선다. 외통 문제 목록의 그 줄에도 풂", () => {
    const p = 순서[0];
    const a = 그날연다(한국(2026, 11, 7, 9));
    expect(screen.queryByText("내일 새 문제가 나옵니다.")).toBeNull();
    끝까지푼다(p);
    expect(알림()).toBe("외통입니다. 풀었습니다.");
    expect(screen.getByText("내일 새 문제가 나옵니다.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다음 문제" })).toBeNull();
    // 지금 푼 것으로는 판 위에 "푼 문제입니다" 가 서지 않는다(판이 밀리지 않게).
    expect(screen.queryByText("푼 문제입니다")).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ solved: [p.id] });
    a.unmount();

    render(<MateScreen />);
    const no = MATES.filter((q) => q.n === p.n).indexOf(p) + 1;
    const 줄 = within(screen.getByRole("region", { name: `${p.n}수 외통` })).getByRole("button", {
      name: new RegExp(`^${no}번(,|$)`),
    });
    expect(줄.getAttribute("aria-label")).toMatch(new RegExp(`^${no}번, 풂`));
  });

  it("이미 푼 문제면 푼 문제라는 표시가 서고, 판은 처음 국면이라 다시 풀 수 있다", () => {
    const p = 순서[0];
    localStorage.setItem(KEY, JSON.stringify({ solved: ["0000000000", p.id] }));
    그날연다(한국(2026, 11, 7, 9));
    expect(screen.getByText("푼 문제입니다")).toBeTruthy();
    판이(p);
    끝까지푼다(p);
    expect(알림()).toBe("외통입니다. 풀었습니다.");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ solved: ["0000000000", p.id] });
  });

  it("다른 날의 문제를 푼 기록은 오늘 표시를 세우지 않는다", () => {
    localStorage.setItem(KEY, JSON.stringify({ solved: [순서[1].id] }));
    그날연다(한국(2026, 11, 7, 9));
    expect(screen.queryByText("푼 문제입니다")).toBeNull();
  });

  it("정답 보기를 쓰고 끝내면 푼 문제로 남지 않는다(외통 문제와 같다)", () => {
    const p = 순서[0];
    그날연다(한국(2026, 11, 7, 9));
    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
    끝까지푼다(p);
    expect(알림()).toBe("외통입니다. 정답을 보고 끝냈습니다.");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ solved: [] });
  });
});
