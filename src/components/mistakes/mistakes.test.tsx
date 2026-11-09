// @vitest-environment jsdom
//
// 내 실수 문제 화면 - 메뉴에서 열고, 복기한 판의 내 큰 실수가 목록에 서고, 끝까지 푼다
//
// App 을 띄운다. 이 화면은 엔진(합법수·판정)을 쓰고, 엔진은 App 이 쥔다 - 분석판 시험과 같다. 엔진은
// 가짜(test/fakeEngine.ts)이고 시간은 진짜로 흐른다. 가짜 규칙은 기물이 한 칸씩만 가서, 졸을 한 칸씩
// 올린 판을 기기 기보 목록(janggi:games)에 넣어 두고 시작한다.
//
// 어느 폭에서 무엇이 보이는지는 CSS 가 정하고 jsdom 은 CSS 를 읽지 않는다 - 모양은 캡처로 본다.

import "../../test/browser";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import type { ArchivedGame, ArchivedKind } from "../../janggi/archive";
import { START_FEN } from "../../janggi/board";
import { nextEntry, startHistory } from "../../janggi/history";
import { splitMove } from "../../janggi/notation";
import type { Side } from "../../janggi/pieces";
import type { ReviewedMove } from "../../janggi/review";
import { FakeEngine } from "../../test/fakeEngine";

vi.mock("../../engine/engine", async () => ({
  JanggiEngine: (await import("../../test/fakeEngine")).FakeEngine,
}));
vi.mock("../../report/events", () => ({ track: () => {} }));

/*
 * 엔진 상태를 시험마다 바꿔 끼운다(screens.test.tsx 와 같은 방법). 진짜 훅은 늘 부르고, 덮을 값이
 * 없으면 진짜 값이 그대로 나간다.
 */
const 엔진덮기 = vi.hoisted(() => ({ state: null as null | { status: "loading" | "error"; error: string | null } }));
vi.mock("../../engine/useEngine", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../engine/useEngine")>();
  return {
    ...real,
    useEngine: () => {
      const got = real.useEngine();
      const over = 엔진덮기.state;
      return over ? { ...got, engine: null, progress: null, evalMode: null, ...over } : got;
    },
  };
});

const engine = () => FakeEngine.current;

beforeEach(() => {
  localStorage.clear();
  engine().reset();
  엔진덮기.state = null;
  // 문제 국면(수순 0 또는 2)은 초 60%. 둔 뒤 국면은 시험마다 정한다(없으면 59% - 좋은 수).
  engine().onceScore = () => ({ score: scoreFor(0.6) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 초 승률이 p 가 되는 점수(review.ts 의 winChance 를 거꾸로). */
const scoreFor = (p: number) => Math.log(p / (1 - p)) / 0.18;

const MOVES = ["a4a5", "a7a6", "c4c5", "c7c6", "e4e5", "e7e6"];

interface Over {
  mySide?: Side;
  kind?: ArchivedKind;
  variant?: string;
  endedAt?: number;
  /** 예전 복기(승률 하락 없음). 앱이 복기 전으로 읽는다. */
  old?: boolean;
  moves?: string[];
}

/** 복기한 판. blunders 의 수 번호가 내 큰 실수이고 AI 의 수는 그 값이다. 나머지는 최선수. */
function 판(id: string, blunders: Record<number, string>, over: Over = {}): ArchivedGame {
  const moves = over.moves ?? MOVES;
  const history = startHistory(START_FEN);
  for (const m of moves) {
    const { from, to } = splitMove(m);
    history.push(nextEntry(history[history.length - 1].fen, from, to));
  }
  const reviewed = moves.map((m, i) => {
    const index = i + 1;
    const best = blunders[index] ?? m;
    const row: Partial<ReviewedMove> = {
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
    if (over.old) delete row.winDrop;
    return row;
  });
  return {
    id,
    endedAt: over.endedAt ?? Date.now() - 60_000,
    mySide: over.mySide ?? "cho",
    levelId: "k12",
    levelName: "12급",
    variant: over.variant ?? "janggi",
    result: { kind: over.kind ?? "resign", winner: "han" },
    history,
    reviewed: reviewed as ReviewedMove[],
  };
}

const 넣는다 = (...games: ArchivedGame[]) => localStorage.setItem("janggi:games", JSON.stringify(games));

const 메뉴 = (name: string) => fireEvent.click(screen.getAllByRole("button", { name })[0]);
const 단추 = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const 알림 = () => document.querySelector(".mate-note")?.textContent ?? "";
const piece = (square: string) => document.querySelector(`[data-piece="${square}"]`);
const pickable = () => document.querySelectorAll(".piece:not(.fixed)");
const 화살표 = () => document.querySelector("svg.board line.best-arrow");

function pointOf(square: string) {
  const hit = document.querySelector(`.hit[data-square="${square}"]`)!;
  return { clientX: Number(hit.getAttribute("cx")), clientY: Number(hit.getAttribute("cy")) };
}
/** 기물을 끌어 옮긴다(App 시험과 같다). */
function drag(from: string, to: string) {
  fireEvent.pointerDown(piece(from)!, { ...pointOf(from), pointerId: 1 });
  fireEvent.pointerUp(document.querySelector("svg.board")!, { ...pointOf(to), pointerId: 1 });
}

/** App 을 띄우고 대국 판이 설 때까지 기다린 뒤 이 화면으로 간다. */
async function 연다() {
  render(<App />);
  await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
  메뉴("내 실수 문제");
  await waitFor(() => expect(screen.getByRole("heading", { name: "내 실수 문제" })).toBeTruthy());
}

/** 목록에서 문제 줄을 눌러 열고, 판을 만질 수 있을 때까지 기다린다. */
async function 푼다(name: string) {
  fireEvent.click(단추(name));
  await waitFor(() => expect(알림()).toMatch(/큰 실수였습니다/));
  await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
}

describe("메뉴와 목록", () => {
  it("메뉴 \"문제\" 묶음 끝에 \"내 실수 문제\" 가 선다", async () => {
    render(<App />);
    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
    const 왼쪽메뉴 = screen.getByRole("complementary", { name: "왼쪽 메뉴" });
    const 문제묶음 = [...왼쪽메뉴.querySelectorAll(".menu-group")].find(
      (g) => g.querySelector(".menu-heading")?.textContent === "문제"
    )!;
    const 항목 = [...문제묶음.querySelectorAll("button")].map((b) => b.textContent);
    expect(항목[항목.length - 1]).toBe("내 실수 문제");
  });

  it("복기한 판이 없으면 무엇을 하면 문제가 생기는지 알린다", async () => {
    넣는다(판("r", { 1: "c4c5" }, { old: true }));
    await 연다();
    expect(screen.getByText("아직 복기한 판이 없습니다.")).toBeTruthy();
    expect(screen.getByText(/기보 탭에서 \[복기 시작\]을 누르면/)).toBeTruthy();
  });

  it("복기한 판에 큰 실수가 없으면 그렇다고 알리고 큰 실수가 무엇인지 적는다", async () => {
    넣는다(판("a", {}), 판("b", {}));
    await 연다();
    expect(screen.getByText("복기한 2판에 내 큰 실수가 없습니다.")).toBeTruthy();
    expect(screen.getByText(/60% → 40%/)).toBeTruthy();
  });

  it("복기한 판의 내 큰 실수만 판 카드에 선다 - 상대의 수, 예전 복기, 불러온 기보는 서지 않는다", async () => {
    넣는다(
      판("mine", { 1: "c4c5", 2: "c7c6", 5: "g4g5" }),
      판("old", { 3: "e4e5" }, { old: true, endedAt: Date.now() - 120_000 }),
      판("file", { 3: "e4e5" }, { kind: "record", endedAt: Date.now() - 180_000 })
    );
    await 연다();
    const 카드 = screen.getAllByRole("region");
    expect(카드).toHaveLength(1);
    expect(within(카드[0]).getByRole("heading", { name: "12급과 둔 판" })).toBeTruthy();
    expect(카드[0].textContent).toContain("기권패 · 2문제");
    expect(within(카드[0]).getAllByRole("button").map((b) => b.textContent)).toEqual(["1번째 수", "3번째 수"]);
  });

  it("같은 국면이 여러 판에 있으면 가장 최근 판의 것 하나만 선다", async () => {
    넣는다(판("new", { 1: "c4c5" }), 판("old", { 1: "c4c5" }, { endedAt: Date.now() - 120_000 }));
    await 연다();
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("판이 많으면 10판까지 세우고 [더 보기]로 더 연다", async () => {
    // 같은 국면은 한 번만 내므로 판마다 첫 수를 달리 둔다. 다섯째 수(초의 셋째 수)가 큰 실수다.
    const 첫수 = ["a4a5", "c4c5", "e4e5", "g4g5", "i4i5", "a4b4", "c4b4", "c4d4", "e4d4", "e4f4", "g4f4", "g4h4"];
    넣는다(
      ...첫수.map((first, i) =>
        판(`g${i}`, { 5: "e2e3" }, { endedAt: Date.now() - (i + 1) * 60_000, moves: [first, "a7a6", "i1i2", "c7c6", "a1a2", "e7e6"] })
      )
    );
    await 연다();
    expect(screen.getAllByRole("region")).toHaveLength(10);
    fireEvent.click(단추("더 보기"));
    expect(screen.getAllByRole("region")).toHaveLength(12);
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
  });
});

describe("풀기", () => {
  it("AI 의 수를 두면 맞았다고 하고, AI 의 수를 화살표로 보인다. 다시 풀기·다음 문제가 선다", async () => {
    넣는다(판("g", { 1: "c4c5", 3: "e4e5" }));
    await 연다();
    await 푼다("1번째 수");
    expect(screen.getByRole("heading", { name: "1번째 수" })).toBeTruthy();
    expect(알림()).toMatch(/^그때 둔 .+ 큰 실수였습니다\. 더 나은 수를 찾아보세요\.$/);
    expect(화살표()).toBeNull();

    drag("c4", "c5");
    await waitFor(() => expect(알림()).toBe("맞았습니다. AI의 수와 같습니다."));
    expect(화살표()).not.toBeNull();
    // 답이 나오면 판은 문제 국면으로 돌아간다.
    expect(piece("c4")).not.toBeNull();

    fireEvent.click(단추("다시 풀기"));
    await waitFor(() => expect(알림()).toMatch(/큰 실수였습니다/));
    expect(화살표()).toBeNull();

    drag("c4", "c5");
    await waitFor(() => expect(알림()).toMatch(/^맞았습니다/));
    fireEvent.click(단추("다음 문제"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "2번째 수" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "다음 문제" })).toBeNull();
  });

  it("그때 둔 수를 또 두면 그렇다고 하고 AI 의 수를 알린다", async () => {
    넣는다(판("g", { 1: "c4c5" }));
    await 연다();
    await 푼다("1번째 수");
    drag("a4", "a5");
    await waitFor(() => expect(알림()).toMatch(/^그때 둔 수와 같습니다\. AI는 c4c5를 골랐습니다\.$/));
  });

  it("그 밖의 수는 AI 가 재는 동안 기다리고, 승률이 5%p 넘게 떨어지면 등급과 승률을 적는다", async () => {
    engine().onceScore = (ref) => ({ score: scoreFor(ref.moves.length === 0 ? 0.6 : 0.5) });
    넣는다(판("g", { 1: "c4c5" }));
    await 연다();
    await 푼다("1번째 수");
    engine().holdOnce = true;
    drag("e4", "e5");
    await waitFor(() => expect(알림()).toMatch(/^AI가 .+ 보는 중…$/));
    expect(pickable()).toHaveLength(0);
    engine().releaseOnce();
    await waitFor(() => expect(알림()).toBe("아쉬운 수입니다. 승률 60% → 50%. AI는 c4c5를 골랐습니다."));
  });

  it("승률이 5%p 보다 덜 떨어지면 좋은 수로 맞음이다", async () => {
    engine().onceScore = (ref) => ({ score: scoreFor(ref.moves.length === 0 ? 0.6 : 0.57) });
    넣는다(판("g", { 1: "c4c5" }));
    await 연다();
    await 푼다("1번째 수");
    drag("e4", "e5");
    await waitFor(() => expect(알림()).toBe("맞았습니다. 좋은 수입니다. AI는 c4c5를 골랐습니다."));
  });

  it("엔진에는 그 판의 규칙으로 묻고, 대국으로 돌아오면 대국 규칙으로 돌아간다", async () => {
    const 물은규칙: string[] = [];
    engine().onceScore = () => {
      물은규칙.push(engine().getOptions().variant);
      return { score: scoreFor(0.6) };
    };
    넣는다(판("g", { 1: "c4c5" }, { variant: "janggimodern" }));
    await 연다();
    await 푼다("1번째 수");
    drag("e4", "e5");
    await waitFor(() => expect(알림()).toMatch(/^맞았습니다/));
    expect(물은규칙.length).toBeGreaterThanOrEqual(2);
    expect(new Set(물은규칙)).toEqual(new Set(["janggimodern"]));

    메뉴("대국");
    await waitFor(() => expect(engine().getOptions()).toMatchObject({ variant: "janggi", multiPV: 1 }));
  });

  it("[기보에서 보기]는 기보 탭에서 그 판을 그 수에 연다 - 거기 [이 수 전부터 다시 두기]가 있다", async () => {
    넣는다(판("g", { 3: "e4e5" }));
    await 연다();
    await 푼다("2번째 수");
    drag("e4", "e5");
    await waitFor(() => expect(알림()).toMatch(/^맞았습니다/));
    fireEvent.click(단추("기보에서 보기"));
    await waitFor(() => expect(단추("이 수 전부터 다시 두기")).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "내 실수 문제" })).toBeNull();
  });

  it("이 화면을 오가도 대국 탭의 판과 엔진 설정이 그대로다", async () => {
    render(<App />);
    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
    drag("c4", "c5");
    await waitFor(() => expect(engine().answers.length).toBe(1));
    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
    const 자리들 = () =>
      Array.from(document.querySelectorAll("[data-piece]"))
        .map((g) => g.getAttribute("data-piece"))
        .sort()
        .join(",");
    const 떠날때 = 자리들();

    메뉴("내 실수 문제");
    await waitFor(() => expect(screen.getByRole("heading", { name: "내 실수 문제" })).toBeTruthy());
    메뉴("대국");
    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
    expect(자리들()).toBe(떠날때);
    expect(engine().getOptions()).toMatchObject({ multiPV: 1, variant: "janggi", skill: 20 });
  });

  it("엔진이 아직 안 떴거나 못 떴으면 판이 잠기고 그 말이 선다. 목록은 엔진 없이 선다", async () => {
    넣는다(판("g", { 1: "c4c5" }));
    엔진덮기.state = { status: "loading", error: null };
    render(<App />);
    메뉴("내 실수 문제");
    fireEvent.click(단추("1번째 수"));
    expect(알림()).toBe("AI를 불러오는 중입니다.");
    expect(pickable()).toHaveLength(0);
    cleanup();

    엔진덮기.state = { status: "error", error: "메모리가 모자랍니다." };
    vi.stubGlobal("crossOriginIsolated", false);
    render(<App />);
    메뉴("내 실수 문제");
    fireEvent.click(단추("1번째 수"));
    expect(알림()).toBe("AI를 띄우지 못해 풀 수 없습니다. 새로고침해 보세요.");
    expect(pickable()).toHaveLength(0);
  });
});
