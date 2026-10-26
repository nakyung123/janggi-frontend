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
import { START_FEN } from "./janggi/board";
import { splitMove } from "./janggi/notation";
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
