// @vitest-environment jsdom
//
// 시간 도전 화면 - 시작 전 → 도는 중 → 끝, 상태 줄, 최고 기록이 새로고침을 넘기고 깨진 값에서 빈 기록
//
// 문제 순서는 Math.random 으로 섞는다. 시험은 Math.random 을 0 으로 묶어 순서를 deckOf(MATES, () => 0)
// 과 같게 한다. 시계는 가짜 시계(타이머와 Date.now 를 같이 앞당긴다). 메뉴를 오가는 시험은 App 을
// 띄우므로(가짜 엔진이 비동기로 답한다) 진짜 시계로 둔다.

import "../../test/browser";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { REPLY_DELAY_MS } from "../../hooks/useMateSolve";
import { SKIP_GUARD_MS } from "../../hooks/useTimed";
import type { Position } from "../../janggi/board";
import type { MatePuzzle } from "../../janggi/mate";
import { MATES, positionAt } from "../../janggi/mate";
import { splitMove, toJanggiCoord } from "../../janggi/notation";
import { SIDE_LABEL, pieceInfo, sideOf } from "../../janggi/pieces";
import { deckOf } from "../../janggi/timed";
import { FakeEngine } from "../../test/fakeEngine";
import { TimedScreen } from "./TimedScreen";

vi.mock("../../engine/engine", async () => ({
  JanggiEngine: (await import("../../test/fakeEngine")).FakeEngine,
}));

vi.mock("../../report/events", () => ({ track: () => {} }));

const KEY = "janggi:timed-best";
const 순서 = deckOf(MATES, () => 0);

beforeEach(() => {
  localStorage.clear();
  FakeEngine.current.reset();
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const 판 = () => screen.getByRole("grid", { name: "장기판" });
const 교차점 = (square: string) => 판().querySelector(`[data-square="${square}"]`)!;
const 알림 = () => screen.getByRole("status").textContent;
const 시계 = () => screen.getByRole("timer");
const 누른다 = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const 결과 = () => screen.getByRole("region", { name: "결과" });
/**
 * 넘기기를 누른다. 새 문제가 선 뒤 0.3초(SKIP_GUARD_MS)는 단추가 꺼져 있어, 시계를 그보다 조금 넘게(다음
 * 200ms 타이머까지) 앞당긴 뒤 누른다 - 사람이 문제를 보고 넘기는 것과 같다.
 */
function 넘긴다() {
  act(() => vi.advanceTimersByTime(SKIP_GUARD_MS + 200));
  누른다("넘기기");
}

function 칸이름된(pos: Position, square: string): string {
  const piece = pos.board[square];
  const coord = toJanggiCoord(square);
  return piece ? `${coord} ${SIDE_LABEL[sideOf(piece)]} ${pieceInfo(piece).name}` : coord;
}

/** 판이 그 문제의 처음 국면인지. */
function 판이(p: MatePuzzle) {
  const cells = [...판().querySelectorAll("[data-square]")];
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

/** 지금 문제(1수)를 풀고 다음 문제를 기다린다. */
function 푼다(p: MatePuzzle) {
  expect(p.n).toBe(1);
  둔다(p.line[0]);
  act(() => vi.advanceTimersByTime(REPLY_DELAY_MS));
}

function 띄운다() {
  vi.useFakeTimers();
  return render(<TimedScreen />);
}

describe("시작 전", () => {
  it("메뉴에서 열면 규칙과 최고 기록, 시작 단추가 선다", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "새 대국" })).toBeTruthy());
    const 모드 = within(screen.getByRole("complementary", { name: "왼쪽 메뉴" })).getByRole("navigation", { name: "모드" });
    fireEvent.click(within(모드).getByRole("button", { name: "시간 도전" }));
    expect(screen.getByRole("heading", { level: 2, name: "시간 도전" })).toBeTruthy();
    expect(screen.getByText("3분 안에 외통 문제를 몇 개 푸는지 셉니다.")).toBeTruthy();
    const 규칙 = screen.getByRole("region", { name: "규칙" });
    expect(within(규칙).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "1수 외통부터 나오고, 갈수록 2수·3수가 나옵니다.",
      "답이 아닌 수를 두거나 넘기면 그 문제를 놓칩니다. 세 번 놓치면 끝납니다.",
      "정답 보기는 없습니다.",
    ]);
    expect(within(규칙).getByText("아직 기록이 없습니다.")).toBeTruthy();
    expect(within(규칙).getByRole("button", { name: "시작" })).toBeTruthy();
  });
});

describe("도는 중", () => {
  it("시작하면 3:00 · 푼 문제 0 · 놓침 0/3 이 서고, 1수 문제가 섞인 순서로 나온다. 처음부터·정답 보기는 없다", () => {
    띄운다();
    누른다("시작");
    expect(시계().textContent).toBe("3:00");
    expect(시계().getAttribute("aria-label")).toBe("남은 시간 3:00");
    expect(screen.getByText("푼 문제 0")).toBeTruthy();
    expect(screen.getByText("놓침 0/3")).toBeTruthy();
    판이(순서[0]);
    expect(screen.getByText(/^1수 외통 · (초가|한이) 둡니다/)).toBeTruthy();
    expect(알림()).toBe("1수 안에 외통을 거세요.");
    expect(screen.queryByRole("button", { name: "처음부터" })).toBeNull();
    expect(screen.queryByRole("button", { name: "정답 보기" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("풀면 푼 문제가 오르고 0.5초 뒤 다음 문제. 기다리는 동안 넘기기는 눌리지 않는다", () => {
    띄운다();
    누른다("시작");
    둔다(순서[0].line[0]);
    expect(알림()).toBe("외통입니다. 풀었습니다.");
    expect(screen.getByText("푼 문제 1")).toBeTruthy();
    expect((screen.getByRole("button", { name: "넘기기" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => vi.advanceTimersByTime(REPLY_DELAY_MS));
    판이(순서[1]);
    expect(알림()).toBe("1수 안에 외통을 거세요.");
  });

  it("답이 아닌 수를 두면 그 문제를 놓치고 바로 다음 문제가 선다. 알림 줄이 앞 문제를 놓쳤다고 한다", () => {
    띄운다();
    누른다("시작");
    const p = 순서[0];
    둔다(p.legal[0].find((m) => m !== p.line[0])!);
    expect(screen.getByText("놓침 1/3")).toBeTruthy();
    판이(순서[1]);
    expect(알림()).toBe("앞 문제를 놓쳤습니다. 1수 안에 외통을 거세요.");
  });

  it("넘기기를 빠르게 두 번 눌러도 한 문제만 놓친다 - 새 문제가 선 뒤 0.3초는 넘기기가 꺼져 있다", () => {
    띄운다();
    누른다("시작");
    const 넘기기 = () => screen.getByRole("button", { name: "넘기기" }) as HTMLButtonElement;
    expect(넘기기().disabled).toBe(true);
    act(() => vi.advanceTimersByTime(SKIP_GUARD_MS + 200));
    expect(넘기기().disabled).toBe(false);

    // 첫 누름에 다음 문제가 서고 같은 자리에 새 넘기기가 선다. 곧바로 온 둘째 누름은 그 단추에 닿는다.
    fireEvent.click(넘기기());
    fireEvent.click(넘기기());
    expect(screen.getByText("놓침 1/3")).toBeTruthy();
    판이(순서[1]);
    expect(넘기기().disabled).toBe(true);

    act(() => vi.advanceTimersByTime(SKIP_GUARD_MS + 200));
    fireEvent.click(넘기기());
    expect(screen.getByText("놓침 2/3")).toBeTruthy();
  });

  it("남은 시간이 흐르고, 마지막 10초는 붉게 선다", () => {
    띄운다();
    누른다("시작");
    act(() => vi.advanceTimersByTime(19_000));
    expect(시계().textContent).toBe("2:41");
    expect(시계().classList.contains("low")).toBe(false);
    act(() => vi.advanceTimersByTime(151_000));
    expect(시계().textContent).toBe("0:10");
    expect(시계().classList.contains("low")).toBe(true);
  });
});

describe("끝", () => {
  it("세 번 놓치면 끝 화면에 푼 개수·까닭·최고 기록(새 기록)이 서고, 이 기기에 남는다", () => {
    띄운다();
    누른다("시작");
    푼다(순서[0]);
    넘긴다();
    넘긴다();
    넘긴다();
    expect(결과().textContent).toContain("1개 풀었습니다");
    expect(within(결과()).getByText("세 번 놓쳤습니다.")).toBeTruthy();
    expect(within(결과()).getByText(/^최고 기록 1개/).textContent).toBe("최고 기록 1개 · 새 기록입니다.");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ best: { "180s-3miss": 1 } });
  });

  it("3분이 지나면 끝난다. 하나도 못 풀면 기록은 없다", () => {
    띄운다();
    누른다("시작");
    act(() => vi.advanceTimersByTime(179_800));
    expect(screen.getByRole("timer")).toBeTruthy();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("timer")).toBeNull();
    expect(결과().textContent).toContain("0개 풀었습니다");
    expect(within(결과()).getByText("시간이 다 됐습니다.")).toBeTruthy();
    expect(within(결과()).getByText("아직 기록이 없습니다.")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("최고 기록은 다시 열어도(새로고침) 남고, 더 적게 풀면 새 기록이 아니다", () => {
    const first = 띄운다();
    누른다("시작");
    푼다(순서[0]);
    푼다(순서[1]);
    for (let i = 0; i < 3; i++) 넘긴다();
    first.unmount();

    render(<TimedScreen />);
    expect(screen.getByText("최고 기록 2개")).toBeTruthy();
    누른다("시작");
    푼다(순서[0]);
    for (let i = 0; i < 3; i++) 넘긴다();
    expect(결과().textContent).toContain("1개 풀었습니다");
    expect(within(결과()).getByText("최고 기록 2개").textContent).toBe("최고 기록 2개");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ best: { "180s-3miss": 2 } });

    누른다("다시 하기");
    expect(시계().textContent).toBe("3:00");
    판이(순서[0]);
  });

  it.each([
    ["JSON 이 아님", "{best"],
    ["best 가 객체가 아님", JSON.stringify({ best: 5 })],
    ["값이 음수·소수·글자", JSON.stringify({ best: { "180s-3miss": -1, a: 1.5, b: "3" } })],
  ])("깨진 값(%s)이면 빈 기록으로 시작하고, 판이 끝나면 이 키만 새로 쓴다. 다른 janggi: 키는 그대로다", (_, bad) => {
    localStorage.setItem(KEY, bad);
    localStorage.setItem("janggi:mate-solved", JSON.stringify({ solved: [MATES[0].id] }));
    localStorage.setItem("janggi:flipped", "true");

    띄운다();
    expect(screen.getByText("아직 기록이 없습니다.")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBe(bad);
    누른다("시작");
    푼다(순서[0]);
    for (let i = 0; i < 3; i++) 넘긴다();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ best: { "180s-3miss": 1 } });
    expect(localStorage.getItem("janggi:mate-solved")).toBe(JSON.stringify({ solved: [MATES[0].id] }));
    expect(localStorage.getItem("janggi:flipped")).toBe("true");
  });
});

describe("판 도중 다른 메뉴로", () => {
  it("다른 메뉴로 갔다 오면 그 판은 버려져 시작 전이고, 기록도 없다", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "새 대국" })).toBeTruthy());
    const 모드 = () =>
      within(screen.getByRole("complementary", { name: "왼쪽 메뉴" })).getByRole("navigation", { name: "모드" });
    fireEvent.click(within(모드()).getByRole("button", { name: "시간 도전" }));
    누른다("시작");
    둔다(순서[0].line[0]);
    expect(screen.getByText("푼 문제 1")).toBeTruthy();

    fireEvent.click(within(모드()).getByRole("button", { name: "외통 문제" }));
    fireEvent.click(within(모드()).getByRole("button", { name: "시간 도전" }));
    expect(screen.getByRole("button", { name: "시작" })).toBeTruthy();
    expect(screen.getByText("아직 기록이 없습니다.")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
