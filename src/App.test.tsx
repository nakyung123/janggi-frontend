// @vitest-environment jsdom
//
// 화면 + 엔진 테스트 — 진짜 App 을 띄워 판을 누르고, 가짜 엔진과 둔다
//
// 순수 로직 테스트가 못 잡은 버그는 React effect 와 엔진이 얽힌 자리에서 났다
// (docs/DECISIONS.md '테스트는 순수 로직만' · 사건 '무르고 같은 수를…' '직접 입력 시계…').
// 여기서는 판을 눌러 두고, 엔진이 제때 두는지, 버튼·목록이 언제 잠기고 열리는지를 본다.
//
// 엔진(wasm)만 가짜로 바꿔 끼운다(test/fakeEngine.ts). 시간은 진짜로 흐른다 - 가짜 시계는
// 엔진 응답·React 갱신과 얽혀 멈춘 것처럼 보이기 쉽다. 한 판이 1~2초 걸린다.

import "./test/browser";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { positionKey } from "./engine/types";
import { START_FEN, parseFen } from "./janggi/board";
import { nextEntry, startHistory } from "./janggi/history";
import { describeMove, splitMove } from "./janggi/notation";
import { sideOf } from "./janggi/pieces";
import { reviewMove } from "./janggi/review";
import { FakeEngine } from "./test/fakeEngine";

vi.mock("./engine/engine", async () => ({
  JanggiEngine: (await import("./test/fakeEngine")).FakeEngine,
}));

/*
 * 밖으로 나가는 측정을 가로채 이름만 모은다. 진짜 `track` 은 `sendBeacon` 으로
 * 던지는데, 테스트에서 그걸 들여다보려면 beacon 을 흉내 내야 하고 **그러면 beacon 이
 * 아니라 내 흉내를 시험하게 된다.** 보내는 함수 자체를 바꿔 끼우는 쪽이 짧고 정확하다.
 *
 * `track` 만 내보내는 것으로 충분하다 - 화면 쪽에서 이 파일에서 가져다 쓰는 것이 그것
 * 하나다(`startTracking` 은 `main.tsx` 만 쓰고, 테스트는 App 을 바로 띄운다).
 */
const 보냄 = vi.hoisted(() => ({ 이름들: [] as string[] }));
vi.mock("./report/events", () => ({
  track: (name: string) => {
    보냄.이름들.push(name);
  },
}));
const 보낸횟수 = (name: string) => 보냄.이름들.filter((n) => n === name).length;

const engine = () => FakeEngine.current;

beforeEach(() => {
  localStorage.clear();
  engine().reset();
  보냄.이름들.length = 0;
});
afterEach(cleanup);

// --- 판 다루기 ---------------------------------------------------------------

const piece = (square: string) => document.querySelector(`[data-piece="${square}"]`);
/** 지금 집어 들 수 있는 기물. 내 차례이고 엔진이 합법수를 알려 줬을 때만 생긴다. */
const pickable = () => document.querySelectorAll(".piece:not(.fixed)");
const passButton = () => screen.getByRole("button", { name: "한수쉼" }) as HTMLButtonElement;
const hintButton = () => screen.getByRole("button", { name: "힌트" }) as HTMLButtonElement;

/** 교차점의 화면 좌표. 판의 화면 크기를 SVG 좌표 그대로 뒀다(test/browser.ts). */
function pointOf(square: string) {
  const hit = document.querySelector(`.hit[data-square="${square}"]`)!;
  return { clientX: Number(hit.getAttribute("cx")), clientY: Number(hit.getAttribute("cy")) };
}

/** 기물을 끌어 옮긴다 - 사람이 판에서 하는 그대로(기물을 누르고, 갈 곳에서 뗀다). */
function drag(from: string, to: string) {
  fireEvent.pointerDown(piece(from)!, { ...pointOf(from), pointerId: 1 });
  fireEvent.pointerUp(document.querySelector("svg.board")!, { ...pointOf(to), pointerId: 1 });
}

/** App 을 띄우고 첫 국면의 합법수가 올 때까지(기물을 집을 수 있을 때까지) 기다린다. */
async function start() {
  render(<App />);
  await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
}

/** 엔진이 n 번째 수를 내놓고, 그 수가 판에 놓일 때까지 기다린다. 놓인 수를 돌려준다. */
async function engineReply(n: number, timeout = 3000) {
  await waitFor(() => expect(engine().answers.length).toBeGreaterThanOrEqual(n), { timeout });
  const move = engine().answers[n - 1];
  const { from, to } = splitMove(move);
  await waitFor(
    () => {
      expect(piece(to)).not.toBeNull();
      expect(piece(from)).toBeNull();
    },
    { timeout }
  );
  return move;
}

// --- 테스트 ------------------------------------------------------------------

describe("엔진과 한 판", () => {
  it("무르고 같은 수를 다시 두면 엔진이 다시 둔다", async () => {
    // 엔진은 같은 국면에서 두 번 두지 않으려고 '이 국면에서 뒀다' 를 기억한다. 무를 때 그
    // 기억을 버리지 않으면, 같은 수로 같은 국면이 돌아왔을 때 엔진이 영영 두지 않는다.
    await start();
    drag("c4", "c5");
    const first = await engineReply(1);

    fireEvent.click(screen.getByRole("button", { name: /무르기/ }));
    await waitFor(() => expect(piece("c4")).not.toBeNull());
    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));

    drag("c4", "c5");
    const again = await engineReply(2);
    expect(again).toBe(first);
  });

  it("시계가 도는 동안에도 탐색을 다시 시작하지 않고 끝까지 가서 둔다", async () => {
    // 엔진이 쓸 시간을 정하는 값이 렌더마다 새 객체면, 시계가 깎일 때마다(0.2초) 탐색 설정이
    // 바뀐 것으로 읽혀 탐색이 끊기고 다시 시작한다. 탐색이 끝날 틈이 없어 엔진이 두지 않는다.
    engine().searchMs = 900; // 시계가 네 번 넘게 깎이는 동안
    await start();
    drag("c4", "c5");
    await engineReply(1, 4000);

    const afterMine = positionKey({ startFen: START_FEN, moves: ["c4c5"] });
    expect(engine().searches.filter((k) => k === afterMine)).toHaveLength(1);
  });

  it("한수쉼은 내 국면의 합법수를 받기 전에는 잠겨 있다", async () => {
    // 버튼을 '내 차례인가' 로만 잠그면, 엔진이 둔 직후 합법수가 오기 전에 눌러도 아무 일이 없다.
    await start();
    expect(passButton().disabled).toBe(false);

    // 엔진이 둔 뒤의 국면(내 차례)만 합법수를 붙잡아 둔다.
    engine().holdProbe = (ref) => ref.moves.length === 2;
    drag("c4", "c5");
    await engineReply(1);
    await waitFor(() => expect(engine().heldProbes).toBe(1));
    expect(pickable()).toHaveLength(0);
    expect(passButton().disabled).toBe(true);

    act(() => engine().releaseProbes());
    await waitFor(() => expect(passButton().disabled).toBe(false));
    expect(pickable().length).toBeGreaterThan(0);
  });
});

describe("힌트", () => {
  const arrow = () => document.querySelector("svg.board .best-arrow");
  /** 대국 칸(연습 중이면 연습 칸) 제목 줄 오른쪽의 덧말 */
  const panelMeta = () => document.querySelector(".panel-title .panel-meta")?.textContent ?? null;

  it("내 차례에 누르면 엔진이 고른 수가 화살표와 덧말로 선다", async () => {
    await start();
    fireEvent.click(hintButton());

    await waitFor(() => expect(arrow()).not.toBeNull());
    const asked = engine().onceCalls;
    expect(asked).toHaveLength(1);
    const move = asked[0].answer!;
    const { from, to } = splitMove(move);

    // 화살표의 두 끝이 그 수의 출발·도착 교차점이다.
    const line = arrow()!;
    expect([line.getAttribute("x1"), line.getAttribute("y1")].map(Number)).toEqual(
      Object.values(pointOf(from))
    );
    expect([line.getAttribute("x2"), line.getAttribute("y2")].map(Number)).toEqual(
      Object.values(pointOf(to))
    );
    expect(panelMeta()).toBe(`AI의 수 ${describeMove(move, parseFen(START_FEN).board).short}`);

    // 급수와 상관없이 가장 센 설정으로, 정한 탐색량으로 찾는다.
    expect(asked[0].skill).toBe(20);
    expect(asked[0].limits).toEqual({ nodes: 300_000, movetimeMs: 3_000 });

    // 같은 국면에서 다시 누르면 다시 찾지 않는다.
    expect(hintButton().disabled).toBe(true);
  });

  it("엔진 차례에는 눌리지 않고, 내 차례가 되면 눌린다", async () => {
    engine().searchMs = 400;
    await start();
    drag("c4", "c5");
    await waitFor(() => expect(hintButton().disabled).toBe(true));
    await engineReply(1);
    await waitFor(() => expect(hintButton().disabled).toBe(false));
  });

  it("무르고 [다시]로 간 국면이 엔진 쪽 차례면 눌리지 않는다", async () => {
    // 엔진은 기보 끝에서만 둔다. 되짚은 국면은 엔진 쪽 차례여도 판이 열리는데, 여기서 찾으면
    // 상대 기물의 수를 'AI의 수' 로 보인다.
    await start();
    drag("c4", "c5");
    await engineReply(1);
    await waitFor(() => expect(hintButton().disabled).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: /무르기/ }));
    await waitFor(() => expect(piece("c4")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "다시" }));
    await waitFor(() => expect(piece("c5")).not.toBeNull());
    // 그 국면의 합법수가 와서 판이 열린 뒤에 본다 - 합법수 전이라 잠긴 것과 가른다.
    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
    expect(hintButton().disabled).toBe(true);
  });

  it("내 국면의 합법수를 받기 전에는 잠겨 있다", async () => {
    // 엔진이 둔 직후에는 설정을 내 차례 것(실력 20)으로 바꾸는 일이 합법수 묻기보다 먼저 줄에
    // 선다. 합법수가 왔으면 설정도 바뀌어 있다 - 그 전에 열면 상대 급수의 세기로 찾을 수 있다.
    await start();
    engine().holdProbe = (ref) => ref.moves.length === 2;
    drag("c4", "c5");
    await engineReply(1);
    await waitFor(() => expect(engine().heldProbes).toBe(1));
    expect(hintButton().disabled).toBe(true);

    act(() => engine().releaseProbes());
    await waitFor(() => expect(hintButton().disabled).toBe(false));
  });

  it("수를 두면 화살표와 덧말이 사라진다", async () => {
    await start();
    fireEvent.click(hintButton());
    await waitFor(() => expect(arrow()).not.toBeNull());

    drag("c4", "c5");
    await waitFor(() => expect(arrow()).toBeNull());
    expect(panelMeta() ?? "").not.toMatch(/^AI의 수/);
    await engineReply(1);
    expect(arrow()).toBeNull();
  });

  it("찾는 동안 수를 두면 늦게 온 힌트는 버린다", async () => {
    // 늦게 온 답을 새 국면의 것으로 읽으면 엉뚱한 자리에 화살표가 선다.
    engine().holdOnce = true;
    await start();
    fireEvent.click(hintButton());
    await waitFor(() => expect(panelMeta()).toBe("힌트를 찾는 중…"));

    drag("c4", "c5");
    await engineReply(1);
    act(() => engine().releaseOnce());
    await waitFor(() => expect(hintButton().disabled).toBe(false));
    expect(arrow()).toBeNull();
  });

  it("끝난 판에서는 눌리지 않는다", async () => {
    await start();
    engine().probeAnswer = (ref) =>
      ref.moves.length === 2 ? { checkers: ["e3"], legal: ["e2e2"] } : null;
    drag("c4", "c5");
    await engineReply(1);
    await waitFor(() => expect(document.querySelector(".dialog.result")).not.toBeNull());
    expect(hintButton().disabled).toBe(true);
  });

  it("힌트를 쓴 판도 끝나면 기보 목록에 평소대로 들어간다", async () => {
    // 힌트를 쓴 판도 전적에 그대로 센다(2026-11-02 사용자 결정). 쓴 것을 어디에도 적지 않는다.
    await start();
    fireEvent.click(hintButton());
    await waitFor(() => expect(arrow()).not.toBeNull());
    // 기권은 한 수라도 둔 뒤에 열린다.
    drag("c4", "c5");
    await engineReply(1);

    fireEvent.click(screen.getByRole("button", { name: "기권" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "기권" }));
    await waitFor(() => expect(document.querySelector(".dialog.result")).not.toBeNull());

    const saved = JSON.parse(localStorage.getItem("janggi:games") ?? "[]") as { result: { kind: string } }[];
    expect(saved).toHaveLength(1);
    expect(saved[0].result.kind).toBe("resign");
  });
});

describe("실수한 곳부터 다시", () => {
  /*
   * 복기를 마친 판 하나. 내가 잡은 쪽(기본은 초)의 둘째 수가 큰 실수다 - 초면 셋째 수 e4e5,
   * 한이면 넷째 수 e7e6. 기보 목록은 등급을 승률 하락에서 다시 매기므로(archive.ts 의 regrade)
   * 점수로 정한다. 점수는 초 기준이라 한의 큰 실수는 점수가 오른다.
   */
  const 수순 = ["c4c5", "c7c6", "e4e5", "e7e6"];
  const 큰실수 = {
    cho: { played: "e4e5", best: "a4a5", scoreAfter: -8 },
    han: { played: "e7e6", best: "a7a6", scoreAfter: 8 },
  } as const;
  function 복기한판(mySide: keyof typeof 큰실수 = "cho") {
    const 실수 = 큰실수[mySide];
    const history = startHistory(START_FEN);
    for (const m of 수순) {
      const { from, to } = splitMove(m);
      history.push(nextEntry(history[history.length - 1].fen, from, to));
    }
    const reviewed = 수순.map((m, i) =>
      reviewMove({
        index: i + 1,
        mover: i % 2 === 0 ? "cho" : "han",
        before: parseFen(history[i].fen).board,
        after: parseFen(history[i + 1].fen).board,
        played: m,
        best: m === 실수.played ? 실수.best : m,
        replyPv: [],
        scoreBefore: 0,
        scoreAfter: m === 실수.played ? 실수.scoreAfter : 0,
        bestGivesCheck: false,
      })
    );
    return {
      id: "reviewed-1",
      endedAt: Date.now() - 60_000,
      mySide,
      levelId: "k12",
      levelName: "12급",
      variant: "janggi",
      result: { kind: "resign", winner: mySide === "cho" ? "han" : "cho" },
      history,
      reviewed,
    };
  }

  const 다시두기 = () => screen.queryByRole("button", { name: "이 수 전부터 다시 두기" });
  const 이전 = () => fireEvent.click(screen.getByRole("button", { name: /이전|무르기/ }));
  const 연습칸 = () => document.querySelector(".panel.practice");
  const 저장된판들 = () => JSON.parse(localStorage.getItem("janggi:games") ?? "[]") as { id: string }[];

  /** 대국 탭에서 한 수 두고(두던 판), 기보 탭에서 복기한 판을 연다. 판은 마지막 수(한의 수)에 선다. */
  async function 복기한판을연다(mySide: keyof typeof 큰실수 = "cho") {
    localStorage.setItem("janggi:games", JSON.stringify([복기한판(mySide)]));
    await start();
    drag("c4", "c5");
    await engineReply(1);
    fireEvent.click(screen.getByRole("button", { name: /^기보/ }));
    await waitFor(() => expect(document.querySelectorAll(".game-card")).toHaveLength(1));
    fireEvent.click(document.querySelector(".game-card")!);
    await screen.findByRole("button", { name: "다시 복기" });
  }

  it("내가 둔 큰 실수 자리에만 단추가 서고, 지난 판에는 힌트가 없다", async () => {
    await 복기한판을연다();
    expect(screen.queryByRole("button", { name: "힌트" })).toBeNull();
    expect(다시두기(), "4수째 - 한의 수").toBeNull();
    이전();
    expect(다시두기(), "3수째 - 나의 큰 실수").not.toBeNull();
    이전();
    expect(다시두기(), "2수째 - 한의 수").toBeNull();
    이전();
    expect(다시두기(), "1수째 - 나의 최선수").toBeNull();
  });

  it("누르면 그 수를 두기 전 국면이 서고, 내가 두면 엔진이 이어 둔다. 두던 판은 그대로다", async () => {
    await 복기한판을연다();
    const 두던판 = localStorage.getItem("janggi:game");
    이전();
    fireEvent.click(다시두기()!);

    // 큰 실수(e4e5)를 두기 전 국면 - 앞의 두 수는 둔 채로, e4 의 졸은 아직 제자리다.
    await waitFor(() => expect(연습칸()).not.toBeNull());
    expect(piece("c5")).not.toBeNull();
    expect(piece("c6")).not.toBeNull();
    expect(piece("e4")).not.toBeNull();
    expect(piece("e5")).toBeNull();
    expect(screen.queryByRole("button", { name: "다시 복기" })).toBeNull();
    expect(연습칸()!.textContent).toContain("초의 2번째 수(75졸65) 전 국면부터 12급과 다시 둡니다.");

    // 연습 시작 국면 앞으로는 되짚지 않는다.
    expect((screen.getByRole("button", { name: "처음으로" }) as HTMLButtonElement).disabled).toBe(true);

    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
    drag("a4", "a5");
    await engineReply(2);
    expect(piece("a5")).not.toBeNull();

    // 무르면 연습 시작 국면까지만 간다.
    fireEvent.click(screen.getByRole("button", { name: /무르기/ }));
    await waitFor(() => expect(piece("a4")).not.toBeNull());
    expect((screen.getByRole("button", { name: "처음으로" }) as HTMLButtonElement).disabled).toBe(true);

    // 복기로 돌아가면 보던 수(큰 실수)에 선다.
    fireEvent.click(screen.getByRole("button", { name: "복기로 돌아가기" }));
    await waitFor(() => expect(다시두기()).not.toBeNull());
    expect(piece("e5")).not.toBeNull();

    // 대국 탭의 두던 판은 그대로다.
    fireEvent.click(screen.getByRole("button", { name: "대국" }));
    await waitFor(() => expect(piece("c5")).not.toBeNull());
    expect(localStorage.getItem("janggi:game")).toBe(두던판);
  });

  it("무르고 [다시]로 간 엔진 쪽 차례에는 힌트가 눌리지 않는다", async () => {
    await 복기한판을연다();
    이전();
    fireEvent.click(다시두기()!);
    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
    drag("a4", "a5");
    await engineReply(2);

    fireEvent.click(screen.getByRole("button", { name: /무르기/ }));
    await waitFor(() => expect(piece("a4")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "다시" }));
    await waitFor(() => expect(piece("a5")).not.toBeNull());
    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
    expect(hintButton().disabled).toBe(true);
  });

  it("한을 잡은 판은 대국 탭이 초여도 한으로 두고, 엔진은 초의 수만 둔다", async () => {
    // 연습 판의 쪽은 그 판에서 잡은 쪽이다. 대국 탭의 쪽을 따르면 엔진이 내 쪽(한)의 수를 둔다.
    await 복기한판을연다("han");
    // 마지막 수(한의 e7e6)가 큰 실수라 되짚지 않고 연다.
    fireEvent.click(다시두기()!);
    await waitFor(() => expect(연습칸()).not.toBeNull());
    expect(연습칸()!.textContent).toContain("한의 2번째 수");

    // 시작 국면은 한(나)의 차례다. 엔진은 두지 않고, 내가 기물을 집는다.
    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
    expect(engine().answers, "대국 탭에서 받은 한 수뿐").toHaveLength(1);
    // [힌트]도 한(나)의 차례에 열린다. 대국 탭의 쪽(초)으로 차례를 보면 여기서 잠긴다.
    await waitFor(() => expect(hintButton().disabled).toBe(false));

    drag("a7", "a6");
    const reply = await engineReply(2);
    const 받기전 = ["c4c5", "c7c6", "e4e5", "a7a6"].reduce((fen, m) => {
      const { from, to } = splitMove(m);
      return nextEntry(fen, from, to).fen;
    }, START_FEN);
    expect(sideOf(parseFen(받기전).board[splitMove(reply).from]!)).toBe("cho");
  });

  it("연습 판은 끝나도 기보 목록에 들지 않고 결과 창도 뜨지 않는다", async () => {
    await 복기한판을연다();
    이전();
    fireEvent.click(다시두기()!);
    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));

    // 내가 두고 엔진이 받은 국면(앞 두 수 + 둘)을 외통으로 꾸민다. 차례인 초(나)가 진다.
    engine().probeAnswer = (ref) =>
      ref.moves.length === 4 && ref.moves[2] === "a4a5" ? { checkers: ["e3"], legal: ["e2e2"] } : null;
    drag("a4", "a5");
    await engineReply(2);

    await waitFor(() => expect(연습칸()!.textContent).toContain("외통 - 한이 이겼습니다."));
    expect(document.querySelector(".dialog.result")).toBeNull();
    expect(저장된판들().map((g) => g.id)).toEqual(["reviewed-1"]);

    // 처음부터 다시 두면 연습 시작 국면으로 돌아간다.
    fireEvent.click(screen.getByRole("button", { name: "처음부터 다시" }));
    await waitFor(() => expect(piece("a4")).not.toBeNull());
    expect(piece("a5")).toBeNull();
  });
});

/*
 * 판이 끝나는 길은 다섯이고(status.ts 의 outcomeOf), 어느 길로 끝나든 그 뒤는 똑같다 -
 * 결과 창이 뜨고, 더 못 두게 잠기고, 기보에 올라간다. 판정 자체는 순수 로직이라
 * status.test.ts·clock.test.ts 가 길마다 따로 본다(외통 4개, 수 제한 7개, 시간패 6개).
 *
 * 여기서는 그 **뒤**를 본다. 판정이 섰을 때 화면과 저장이 실제로 따라오는가.
 * 길마다 되풀이하지 않는 까닭은 그 뒤가 한 몸이기 때문이다 - outcome 하나를 보고
 * 창을 띄우고 저장한다. 길을 하나 더 보태도 같은 줄을 다시 밟을 뿐이다.
 *
 * 대신 **들어오는 길이 다른** 둘을 고른다. 외통은 엔진이 알려 준 국면에서 서고,
 * 시간패는 국면과 무관하게 시계에서 선다. 둘은 코드가 갈린다.
 */
describe("판의 칸 이름", () => {
  // E2E 가 칸을 역할과 이름으로 찾아 사람의 수를 둔다(e2e/app-page.ts). 이름은 기보 좌표 + 기물이다.
  const grid = () => screen.getByRole("grid", { name: "장기판" });
  const cells = () => within(grid()).getAllByRole("gridcell");

  it("교차점 90개에 좌표와 기물로 이름이 붙고, 수를 두면 바뀐다", async () => {
    await start();
    expect(within(grid()).getAllByRole("row")).toHaveLength(10);
    expect(cells()).toHaveLength(90);
    // c4 는 초의 졸, c5 는 빈 자리다. 기보 좌표로 73, 63 이다.
    expect(within(grid()).getByRole("gridcell", { name: "73 초 졸" })).toBeTruthy();
    expect(within(grid()).getByRole("gridcell", { name: "63" })).toBeTruthy();

    drag("c4", "c5");
    await engineReply(1);
    expect(within(grid()).getByRole("gridcell", { name: "63 초 졸" })).toBeTruthy();
    expect(within(grid()).getByRole("gridcell", { name: "73" })).toBeTruthy();
  });

  it("가로줄은 화면에 보이는 위에서 아래 순서이고, 판을 뒤집으면 같이 뒤집힌다", async () => {
    await start();
    // 뒤집지 않은 판의 왼쪽 위는 a10(기보 좌표 11), 뒤집은 판은 i1(09)이다.
    expect(cells()[0].getAttribute("aria-label")).toMatch(/^11( |$)/);
    fireEvent.click(screen.getByRole("button", { name: "판 뒤집기" }));
    expect(cells()[0].getAttribute("aria-label")).toMatch(/^09( |$)/);
  });
});

describe("판이 끝나면", () => {
  const 기권버튼 = () => screen.getByRole("button", { name: "기권" }) as HTMLButtonElement;
  const 결과창 = () => document.querySelector(".dialog.result");

  it("외통이 나면 결과 창이 뜨고, 더 못 두고, 기보에 올라간다", async () => {
    await start();

    // 내가 두고 엔진이 받은 그 국면(2수째)을 외통으로 꾸민다.
    // 장군을 맞았고(checkers) 한수쉼 말고는 둘 게 없는(legal) 상태다.
    engine().probeAnswer = (ref) =>
      ref.moves.length === 2 ? { checkers: ["e3"], legal: ["e2e2"] } : null;

    drag("c4", "c5");
    await engineReply(1);

    const dialog = await waitFor(() => {
      const d = 결과창();
      expect(d).not.toBeNull();
      return d!;
    });
    expect(dialog.textContent).toContain("외통");
    // 차례인 쪽(초, 나)이 진다.
    expect(dialog.textContent).toContain("한이 이겼습니다");

    // 끝난 판에서 기권 버튼이 살아 있으면 끝난 판을 또 기권할 수 있다.
    expect(기권버튼().disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.click(screen.getByRole("button", { name: /^기보/ }));
    await waitFor(() => expect(document.querySelectorAll(".game-card")).toHaveLength(1));
  });

  it("시간패로 끝난 판을 되살려도 끝난 판으로 돌아온다", async () => {
    /*
     * 시계는 저장하지 않는다(savedGame.ts). 그래서 되살릴 때 시계가 새로 가득 차는데,
     * 시간패까지 같이 잊으면 **시간을 다 써서 진 판이 멀쩡한 판으로 되살아난다.**
     * 새로고침 한 번으로 진 판을 이어 둘 수 있게 되는 셈이다.
     */
    localStorage.setItem(
      "janggi:game",
      JSON.stringify({
        id: "flagged-1",
        history: [
          { fen: START_FEN, move: null, notation: "시작", mover: null, score: null },
          {
            fen: "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/2P6/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR b - - 0 1",
            move: "c4c5",
            notation: "73졸63",
            mover: "cho",
            score: null,
          },
        ],
        cursor: 1,
        resigned: null,
        flagged: "cho",
      })
    );

    render(<App />);

    const dialog = await waitFor(() => {
      const d = 결과창();
      expect(d).not.toBeNull();
      return d!;
    });
    expect(dialog.textContent).toContain("시간패");
    expect(dialog.textContent).toContain("한이 이겼습니다");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(기권버튼().disabled).toBe(true);
    // 끝난 판이라 기물을 집을 수 없다.
    expect(pickable()).toHaveLength(0);
  });
});

/*
 * 전적은 판이 끝난 순간의 급수·쪽으로 센다(hooks/stats.ts). 두는 중에 바꿀 수 있으면 다른
 * 급수와 둔 판이 그 급수의 전적에 든다. 그래서 내가 첫 수를 두면 쪽·급수를 잠근다.
 * '판의 첫 수' 가 아니다 - 한을 잡으면 엔진이 판이 놓이자마자 두므로, 그것으로 잠그면
 * 한을 잡은 사람은 바꿀 틈이 없다.
 */
describe("쪽·급수는 내가 첫 수를 두면 잠긴다", () => {
  const 패널 = () => document.querySelector(".panel.play") as HTMLElement;
  const 쪽 = (name: "초" | "한") => within(패널()).getByRole("button", { name }) as HTMLButtonElement;
  const 급수 = () => within(패널()).getByRole("combobox", { name: /상대 급수/ }) as HTMLButtonElement;
  const 시계 = () => within(패널()).getByRole("button", { name: "시계 없음" }) as HTMLButtonElement;
  const 확인창 = () => screen.getByRole("alertdialog");

  it("첫 수를 두면 쪽·급수가 잠기고 시계는 열려 있다. 끝난 판에서 새 대국을 누르면 풀린다", async () => {
    await start();
    expect(쪽("한").disabled).toBe(false);
    expect(급수().disabled).toBe(false);

    drag("c4", "c5");
    await engineReply(1);
    expect(쪽("초").disabled).toBe(true);
    expect(쪽("한").disabled).toBe(true);
    expect(급수().disabled).toBe(true);
    expect(시계().disabled).toBe(false);

    // 기권으로 끝낸다. 끝난 판도 잠겨 있다.
    fireEvent.click(within(패널()).getByRole("button", { name: "기권" }));
    fireEvent.click(within(확인창()).getByRole("button", { name: "기권" }));
    fireEvent.click(await screen.findByRole("button", { name: "닫기" }));
    expect(쪽("한").disabled).toBe(true);
    expect(급수().disabled).toBe(true);

    fireEvent.click(within(패널()).getByRole("button", { name: "새 대국" }));
    fireEvent.click(within(확인창()).getByRole("button", { name: "새 대국" }));
    await waitFor(() => expect(쪽("한").disabled).toBe(false));
    expect(급수().disabled).toBe(false);
  });

  it("한을 잡아 엔진이 먼저 둬도 내가 두기 전에는 열려 있고, 초로 바꾸면 판을 처음부터 놓는다", async () => {
    await start();
    fireEvent.click(쪽("한"));
    const enginesFirst = await engineReply(1);
    const { from, to } = splitMove(enginesFirst);

    expect(쪽("초").disabled).toBe(false);
    expect(급수().disabled).toBe(false);

    fireEvent.click(쪽("초"));
    // 엔진이 둔 초의 첫 수가 내 수가 되지 않는다. 처음 국면이고 아무것도 잠기지 않았다.
    await waitFor(() => expect(piece(from)).not.toBeNull());
    expect(piece(to)).toBeNull();
    expect(쪽("한").disabled).toBe(false);
    expect(급수().disabled).toBe(false);
    await waitFor(() => expect(pickable().length).toBeGreaterThan(0));
  });
});

describe("기보 파일 불러오기", () => {
  const recordFile = (name: string) =>
    new File(
      [
        JSON.stringify({
          format: "janggi-board/2",
          startFen: START_FEN,
          variant: "janggi",
          moves: ["c4c5", "c7c6", "e4e5"].map((move) => ({ move, notation: "" })),
          players: { cho: { kind: "human", label: "나" }, han: { kind: "engine", label: "엔진" } },
          result: "unfinished",
        }),
      ],
      name,
      { type: "application/json" }
    );
  const load = (file: File) =>
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  const cards = () => document.querySelectorAll(".game-card");

  it("규칙에 맞지 않는 수가 있으면 목록에 넣지 않고, 까닭을 버튼 옆에 남긴다", async () => {
    // 화면은 그 수를 둔 판을 그리는데 엔진은 그 수를 받지 않아, 장군·복기가 다른 판을 두고 말한다.
    await start();
    fireEvent.click(screen.getByRole("button", { name: /^기보/ }));

    engine().illegalAt = 2;
    load(recordFile("bad.json"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/3번째 수\(.+\)가 규칙에 맞지 않습니다/);
    expect(cards()).toHaveLength(0);

    engine().illegalAt = null;
    load(recordFile("ok.json"));
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(cards()[0].classList.contains("fresh")).toBe(true);
  });
});

describe("깔때기 숫자", () => {
  /** 두던 판 하나. 수를 한 개 둔 상태로 저장돼 있다. */
  const 두던판 = JSON.stringify({
    id: "saved-1",
    history: [
      { fen: START_FEN, move: null, notation: "시작", mover: null, score: null },
      {
        fen: "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/2P6/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR b - - 0 1",
        move: "c4c5",
        notation: "73졸63",
        mover: "cho",
        score: null,
      },
    ],
    cursor: 1,
    resigned: null,
    flagged: null,
  });

  it("두던 판을 들고 들어온 것만으로는 first_move 를 보내지 않는다", async () => {
    /*
     * 복구하면 쪽이 뜨는 순간 이미 `playHistory.length > 1` 이라, 그걸 '수를 뒀다' 로
     * 세면 **사람이 아무것도 안 했는데 찍힌다.**
     *
     * 2026-10-12 에 실서버에서 실제로 그랬다. 엔진은 1102ms 에 떴는데 첫 수가 126ms 로
     * 찍혀 있었다 - 엔진이 뜨기 전에 둘 수는 없으니 사람이 만든 줄이 아니었다.
     * 하필 그 칸이 깔때기에서 제일 크게 깎일 자리라 **부풀면 전체를 못 믿는다.**
     */
    localStorage.setItem("janggi:game", 두던판);
    await start();
    expect(보낸횟수("first_move")).toBe(0);
  });

  it("새로 들어와 한 수 두면 그때 first_move 를 한 번만 보낸다", async () => {
    // 위 고침이 정상까지 막아 버리면 깔때기의 가운데 칸이 영영 0이 된다.
    await start();
    expect(보낸횟수("first_move")).toBe(0);

    drag("c4", "c5");
    await waitFor(() => expect(보낸횟수("first_move")).toBe(1));

    // 엔진이 받아 두어도 한 판에 한 번이다.
    await engineReply(1);
    expect(보낸횟수("first_move")).toBe(1);
  });
});
