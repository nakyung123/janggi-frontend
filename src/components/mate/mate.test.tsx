// @vitest-environment jsdom
//
// 외통 문제 화면 - 메뉴에서 열고, 목록에서 1·2·3수 문제를 끝까지 풀고, 푼 기록이 이 기기에 남는다
//
// 수는 판의 교차점을 눌러 둔다(기물 → 갈 곳). 응수는 0.5초 타이머라 풀기 시험은 가짜 시계로
// 앞당긴다. 메뉴 시험은 App 을 띄우므로(가짜 엔진이 비동기로 답한다) 진짜 시계로 둔다.
//
// 어느 폭에서 무엇이 보이는지는 CSS 가 정하고 jsdom 은 CSS 를 읽지 않는다 - 모양은 캡처로 본다.

import "../../test/browser";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { REPLY_DELAY_MS } from "../../hooks/useMateSolve";
import type { Position } from "../../janggi/board";
import type { MatePuzzle } from "../../janggi/mate";
import { MATES, positionAt } from "../../janggi/mate";
import { describeMove, splitMove, toJanggiCoord } from "../../janggi/notation";
import { SIDE_LABEL, pieceInfo, sideOf } from "../../janggi/pieces";
import { FakeEngine } from "../../test/fakeEngine";
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
const 묶음 = (n: number) => MATES.filter((p) => p.n === n);

// --- 메뉴 ------------------------------------------------------------------------

describe("메뉴", () => {
  it("문제 묶음에는 외통 문제 하나뿐이라 묶음 이름 없이 서고, 누르면 외통 문제 목록이 선다", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "새 대국" })).toBeTruthy());

    const 왼쪽메뉴 = screen.getByRole("complementary", { name: "왼쪽 메뉴" });
    const 모드 = within(왼쪽메뉴).getByRole("navigation", { name: "모드" });
    expect(within(모드).queryByText("문제")).toBeNull();
    fireEvent.click(within(모드).getByRole("button", { name: "외통 문제" }));
    expect(screen.getByRole("heading", { level: 2, name: "외통 문제" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    const 폰메뉴 = screen.getByRole("dialog", { name: "메뉴" });
    expect(within(폰메뉴).getByRole("button", { name: "외통 문제" })).toBeTruthy();
  });
});

// --- 목록 ------------------------------------------------------------------------

const 묶음칸 = (n: number) => screen.getByRole("region", { name: `${n}수 외통` });
const 줄들 = (n: number) => within(묶음칸(n)).getAllByRole("button");
const 줄 = (n: number, no: number) => within(묶음칸(n)).getByRole("button", { name: new RegExp(`^${no}번(,|$)`) });

describe("목록", () => {
  it("1수 21 · 2수 13 · 3수 8 문제가 번호 순서로 서고, 첫 수가 장군이 아닌 문제에 그 표시가 붙는다", () => {
    render(<MateScreen />);
    for (const n of [1, 2, 3]) {
      const 기대 = 묶음(n).map((p, i) => [`${i + 1}번`, p.quiet && "첫 수가 장군 아님"].filter(Boolean).join(", "));
      expect(줄들(n).map((b) => b.getAttribute("aria-label"))).toEqual(기대);
      expect(within(묶음칸(n)).getByText(`${묶음(n).length}문제 · 0개 풂`)).toBeTruthy();
    }
    expect(screen.getAllByText("첫 수가 장군 아님")).toHaveLength(MATES.filter((p) => p.quiet).length);
  });

  it("푼 표시는 번호 바로 뒤, 첫 수가 장군 아님은 그 뒤다", () => {
    const quiet = 묶음(2).find((p) => p.quiet)!;
    const no = 묶음(2).indexOf(quiet) + 1;
    localStorage.setItem(KEY, JSON.stringify({ solved: [quiet.id] }));
    render(<MateScreen />);
    const button = 줄(2, no);
    expect(button.getAttribute("aria-label")).toBe(`${no}번, 풂, 첫 수가 장군 아님`);
    expect(button.textContent).toBe(`${no}번풂첫 수가 장군 아님`);
  });
});

// --- 풀기 ------------------------------------------------------------------------

const 판 = () => screen.getByRole("grid", { name: "장기판" });
const 교차점 = (square: string) => 판().querySelector(`[data-square="${square}"]`)!;
const 칸이름 = (square: string) => 교차점(square).getAttribute("aria-label");
const 알림 = () => screen.getByRole("status").textContent;

/** 기물을 누르고 갈 곳을 누른다. */
function 둔다(move: string) {
  const { from, to } = splitMove(move);
  fireEvent.pointerUp(교차점(from));
  fireEvent.pointerUp(교차점(to));
}
const 응수를기다린다 = () => act(() => vi.advanceTimersByTime(REPLY_DELAY_MS));

/** 목록에서 문제를 열고 정답을 끝까지 둔다. */
function 끝까지푼다(p: MatePuzzle) {
  for (let step = 0; step < p.n; step++) {
    둔다(p.line[step * 2]);
    if (step < p.n - 1) 응수를기다린다();
  }
}

const 연다 = (p: MatePuzzle) => fireEvent.click(줄(p.n, MATES.filter((q) => q.n === p.n).indexOf(p) + 1));
const 목록으로 = () => fireEvent.click(screen.getByRole("button", { name: "목록으로" }));

describe("풀기", () => {
  beforeEach(() => vi.useFakeTimers());

  it.each([1, 2, 3])("%i수 문제 - 정답을 두면 응수가 주 수순대로 서고, 마지막 정답 뒤 외통·푼 표시가 선다", (n) => {
    const p = 묶음(n)[0];
    render(<MateScreen />);
    연다(p);
    expect(screen.getByRole("heading", { level: 2, name: `${n}수 외통 · 1번` })).toBeTruthy();
    expect(알림()).toBe(`${n}수 안에 외통을 거세요.`);

    for (let step = 0; step < n; step++) {
      둔다(p.line[step * 2]);
      if (step === n - 1) break;
      expect(알림()).toBe("맞습니다.");
      응수를기다린다();
      // 응수 자리에 응수한 기물이 선다.
      const reply = p.line[step * 2 + 1];
      const after = positionAt(p, step * 2 + 2);
      expect(칸이름(splitMove(reply).to)).toBe(칸이름된(after, splitMove(reply).to));
      expect(알림()).toMatch(new RegExp(`^(초가|한이) ${describeMove(reply, positionAt(p, step * 2 + 1).board).short}(으로|로) 받았습니다\\.`));
    }
    expect(알림()).toBe("외통입니다. 풀었습니다.");
    expect(판().closest("svg")!.querySelector(".checked-king")).not.toBeNull();

    목록으로();
    expect(줄(n, 1).getAttribute("aria-label")).toBe("1번, 풂");
    expect(within(묶음칸(n)).getByText(`${묶음(n).length}문제 · 1개 풂`)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ solved: [p.id] });
  });

  it("답이 아닌 수는 기물이 옮겨지지 않고 알림 줄이 선다. 다시 둬서 풀 수 있다", () => {
    const p = 묶음(2)[0];
    render(<MateScreen />);
    연다(p);
    const 틀린수 = p.legal[0].find((m) => m !== p.line[0])!;
    const { from, to } = splitMove(틀린수);
    const 전 = [칸이름(from), 칸이름(to)];

    둔다(틀린수);
    expect([칸이름(from), 칸이름(to)]).toEqual(전);
    expect(알림()).toMatch(new RegExp(`^${describeMove(틀린수, positionAt(p, 0).board).short}(은|는) 답이 아닙니다\\.`));

    끝까지푼다(p);
    expect(알림()).toBe("외통입니다. 풀었습니다.");
  });

  it("공격 쪽이 아래다 - 한이 공격하면 판을 뒤집는다", () => {
    render(<MateScreen />);
    const 맨위왼쪽 = () => within(within(판()).getAllByRole("row")[0]).getAllByRole("gridcell")[0].getAttribute("data-square");

    연다(MATES.find((p) => p.fen.split(" ")[1] === "w")!);
    expect(screen.getByText(/^초가 둡니다/)).toBeTruthy();
    expect(맨위왼쪽()).toBe("a10");

    목록으로();
    연다(MATES.find((p) => p.fen.split(" ")[1] === "b")!);
    expect(screen.getByText(/^한이 둡니다/)).toBeTruthy();
    expect(맨위왼쪽()).toBe("i1");
  });

  it("정답 보기 - 파란 화살표가 서고, 그 판은 끝까지 둬도 푼 문제로 남지 않는다. 처음부터 다시 풀면 남는다", () => {
    const p = 묶음(1)[0];
    render(<MateScreen />);
    연다(p);
    const 처음부터 = () => screen.getByRole("button", { name: "처음부터" }) as HTMLButtonElement;
    expect(처음부터().disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "정답 보기" }));
    expect(document.querySelector("svg.board line.best-arrow")).not.toBeNull();
    expect(처음부터().disabled).toBe(false);
    둔다(p.line[0]);
    expect(알림()).toBe("외통입니다. 정답을 보고 끝냈습니다.");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ solved: [] });

    fireEvent.click(처음부터());
    expect(알림()).toBe("1수 안에 외통을 거세요.");
    둔다(p.line[0]);
    expect(알림()).toBe("외통입니다. 풀었습니다.");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ solved: [p.id] });
  });

  it("다음 문제는 전체 순서의 다음 문제를 열고, 마지막 문제에는 서지 않는다", () => {
    render(<MateScreen />);
    연다(묶음(1)[20]);
    expect(screen.queryByRole("button", { name: "다음 문제" })).toBeNull();
    끝까지푼다(묶음(1)[20]);
    fireEvent.click(screen.getByRole("button", { name: "다음 문제" }));
    expect(screen.getByRole("heading", { level: 2, name: "2수 외통 · 1번" })).toBeTruthy();

    목록으로();
    const 마지막 = MATES[MATES.length - 1];
    연다(마지막);
    끝까지푼다(마지막);
    expect(알림()).toBe("외통입니다. 풀었습니다.");
    expect(screen.queryByRole("button", { name: "다음 문제" })).toBeNull();
  });
});

/** 그 국면에서 그 자리의 교차점 이름. 판이 붙이는 이름(좌표 + 진영 + 기물, Board.tsx)과 같은 방식. */
function 칸이름된(pos: Position, square: string): string {
  const piece = pos.board[square];
  const coord = toJanggiCoord(square);
  return piece ? `${coord} ${SIDE_LABEL[sideOf(piece)]} ${pieceInfo(piece).name}` : coord;
}

// --- 푼 기록 ----------------------------------------------------------------------

describe("푼 기록", () => {
  it("다시 열어도(새로고침) 남아 있다", () => {
    vi.useFakeTimers();
    const p = 묶음(1)[3];
    const first = render(<MateScreen />);
    연다(p);
    끝까지푼다(p);
    first.unmount();

    render(<MateScreen />);
    expect(줄(1, 4).getAttribute("aria-label")).toBe("4번, 풂");
    expect(within(묶음칸(1)).getByText("21문제 · 1개 풂")).toBeTruthy();
  });

  it("데이터에 없는 id 는 세지 않고 지우지도 않는다", () => {
    localStorage.setItem(KEY, JSON.stringify({ solved: ["0000000000", MATES[0].id] }));
    render(<MateScreen />);
    expect(within(묶음칸(1)).getByText("21문제 · 1개 풂")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ solved: ["0000000000", MATES[0].id] });
  });

  it.each([
    ["JSON 이 아님", "{solved"],
    ["solved 가 문자열 배열이 아님", JSON.stringify({ solved: "8b7f95153b" })],
    ["배열 하나", JSON.stringify([MATES[0].id])],
  ])("깨진 값(%s)이면 빈 기록으로 시작하고, 다른 janggi: 키는 그대로다", (_, bad) => {
    localStorage.setItem(KEY, bad);
    localStorage.setItem("janggi:flipped", "true");
    localStorage.setItem("janggi:game", '{"keep":1}');

    render(<MateScreen />);
    for (const n of [1, 2, 3]) {
      expect(within(묶음칸(n)).getByText(`${묶음(n).length}문제 · 0개 풂`)).toBeTruthy();
    }
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ solved: [] });
    expect(localStorage.getItem("janggi:flipped")).toBe("true");
    expect(localStorage.getItem("janggi:game")).toBe('{"keep":1}');
  });
});
