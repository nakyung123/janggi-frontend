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
import type { Board as BoardMap, Square } from "../../janggi/board";
import { pieceMoves } from "../../janggi/moves";
import { toJanggiCoord } from "../../janggi/notation";
import { OPENINGS, positionAt } from "../../janggi/openings";
import { SIDE_LABEL, pieceInfo, sideOf } from "../../janggi/pieces";
import { SETUPS } from "../../janggi/setups";
import { FakeEngine } from "../../test/fakeEngine";
import { CoordsScreen } from "./CoordsScreen";
import { OpeningsScreen } from "./OpeningsScreen";
import type { ListItem } from "./readings";
import { READINGS } from "./readings";
import { ReadingsScreen } from "./ReadingsScreen";
import { PIECE_LESSONS } from "./pieceScenes";
import { PiecesScreen } from "./PiecesScreen";
import { RulesScreen } from "./RulesScreen";

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

/** 메뉴에서 "배우기" 묶음 이름 아래에 선 항목들. */
function 배우기항목(menu: HTMLElement) {
  const heading = within(within(menu).getByRole("navigation", { name: "모드" })).getByText("배우기");
  return within(heading.parentElement as HTMLElement)
    .getAllByRole("button")
    .map((b) => b.textContent);
}

const 배우기화면 = ["기물", "규칙", "용어", "좌표", "포진", "읽을거리"];

describe("메뉴", () => {
  it("왼쪽 메뉴와 폰 메뉴 둘 다 배우기 묶음 아래에 배우기 화면이 이 순서로 선다", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "새 대국" })).toBeTruthy());
    expect(배우기항목(왼쪽메뉴())).toEqual(배우기화면);
    expect(배우기항목(폰메뉴())).toEqual(배우기화면);
  });

  it.each(배우기화면)("%s - 두 메뉴 어디서 눌러도 그 화면이 서고, 대국을 누르면 판으로 돌아간다", async (name) => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "새 대국" })).toBeTruthy());

    fireEvent.click(within(왼쪽메뉴()).getByRole("button", { name }));
    expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();

    fireEvent.click(within(왼쪽메뉴()).getByRole("button", { name: "대국" }));
    expect(screen.queryByRole("heading", { level: 2, name })).toBeNull();
    expect(screen.getByRole("button", { name: "새 대국" })).toBeTruthy();

    fireEvent.click(within(폰메뉴()).getByRole("button", { name }));
    expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
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

// --- 규칙 화면 ---------------------------------------------------------------

describe("규칙 화면", () => {
  it("상차림 넷 - 대국 화면의 단추 순서로, 날개마다 상이 안쪽인지 바깥쪽인지 적는다", () => {
    render(<RulesScreen />);
    const 상차림 = screen.getByRole("heading", { level: 3, name: "상차림" }).closest("section")!;
    // 손으로 따졌다. 이름은 마·상 넷을 자기 왼쪽부터 읽은 것이고, 상이 사 옆이면 안쪽, 차 옆이면
    // 바깥쪽이다. 예: 마상마상은 왼쪽 상이 사 옆, 오른쪽 상이 차 옆이다.
    expect(within(상차림).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "마상상마: 상 둘이 안쪽",
      "상마마상: 상 둘이 바깥쪽",
      "마상마상: 오른쪽 상만 바깥쪽",
      "상마상마: 왼쪽 상만 바깥쪽",
    ]);
  });
});

// --- 좌표 화면 ---------------------------------------------------------------

/** 화면에 보이는 r 번째 가로줄(위에서 0)의 c 번째 교차점(왼쪽에서 0). 판을 뒤집으면 같이 뒤집힌다. */
const 보이는칸 = (r: number, c: number) =>
  within(within(판()).getAllByRole("row")[r]).getAllByRole("gridcell")[c];
/** 누른 칸의 번호(두 자리 숫자). */
const 나온번호 = () => within(screen.getByRole("status")).getByText(/^\d\d$/).textContent;
/** 번호 옆 설명 줄. 두 숫자 중 어느 것이 가로줄이고 어느 것이 세로줄인지, 그 자리 기물. */
const 나온설명 = () => within(screen.getByRole("status")).getByText(/^가로줄/).textContent;
const 뒤집기 = () => fireEvent.click(screen.getByRole("button", { name: "판 뒤집기" }));

/**
 * 화면의 r 번째 줄 c 번째 칸에 나와야 할 번호. notation.ts 를 쓰지 않고 좌표 읽는 법에서 센다.
 * 초가 아래인 판: 앞 숫자는 위에서부터 1~9, 맨 아래(열째) 줄은 0. 뒤 숫자는 왼쪽부터 1~9.
 * 뒤집은 판: 숫자는 그대로라 0 줄이 위, 1 줄이 아래이고 세로줄은 오른쪽부터 1~9 다.
 */
const 기대번호 = (r: number, c: number, 뒤집음: boolean) =>
  뒤집음 ? `${(10 - r) % 10}${9 - c}` : `${(r + 1) % 10}${c + 1}`;

describe("좌표 화면", () => {
  it("누르기 전에는 번호 대신 누르라는 말이 선다", () => {
    render(<CoordsScreen />);
    expect(within(screen.getByRole("status")).queryByText(/^\d\d$/)).toBeNull();
  });

  it("네 귀퉁이와 두 궁 자리 - 누르면 그 칸의 번호, 가로줄·세로줄, 기물이 보인다", () => {
    render(<CoordsScreen />);
    const 눌러서 = (r: number, c: number) => {
      fireEvent.pointerUp(보이는칸(r, c));
      return [나온번호(), 나온설명()];
    };
    expect(눌러서(0, 0)).toEqual(["11", "가로줄 1 · 세로줄 1 · 한 차"]);
    expect(눌러서(0, 8)).toEqual(["19", "가로줄 1 · 세로줄 9 · 한 차"]);
    expect(눌러서(9, 0)).toEqual(["01", "가로줄 0(열째) · 세로줄 1 · 초 차"]);
    expect(눌러서(9, 8)).toEqual(["09", "가로줄 0(열째) · 세로줄 9 · 초 차"]);
    expect(눌러서(8, 4)).toEqual(["95", "가로줄 9 · 세로줄 5 · 초 궁"]);
    expect(눌러서(1, 4)).toEqual(["25", "가로줄 2 · 세로줄 5 · 한 궁"]);
  });

  it("판을 뒤집으면 0 줄이 위로 가고, 같은 자리는 같은 번호와 설명이다", () => {
    render(<CoordsScreen />);
    뒤집기();
    const 눌러서 = (r: number, c: number) => {
      fireEvent.pointerUp(보이는칸(r, c));
      return [나온번호(), 나온설명()];
    };
    expect(눌러서(0, 0)).toEqual(["09", "가로줄 0(열째) · 세로줄 9 · 초 차"]);
    expect(눌러서(0, 8)).toEqual(["01", "가로줄 0(열째) · 세로줄 1 · 초 차"]);
    expect(눌러서(9, 0)).toEqual(["19", "가로줄 1 · 세로줄 9 · 한 차"]);
    expect(눌러서(9, 8)).toEqual(["11", "가로줄 1 · 세로줄 1 · 한 차"]);
    // 초의 궁은 위에서 둘째 줄로, 한의 궁은 아래에서 둘째 줄로 갔지만 번호는 그대로다.
    expect(눌러서(1, 4)).toEqual(["95", "가로줄 9 · 세로줄 5 · 초 궁"]);
    expect(눌러서(8, 4)).toEqual(["25", "가로줄 2 · 세로줄 5 · 한 궁"]);
  });

  it.each([false, true])("모든 칸 - 나온 번호가 좌표 읽는 법, 기보 표기(notation.ts)와 같다 (뒤집음: %s)", (뒤집음) => {
    render(<CoordsScreen />);
    if (뒤집음) 뒤집기();
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = 보이는칸(r, c);
        fireEvent.pointerUp(cell);
        expect(나온번호()).toBe(기대번호(r, c, 뒤집음));
        expect(나온번호()).toBe(toJanggiCoord(cell.getAttribute("data-square")!));
      }
    }
  });

  it("기보 읽기 예는 이 앱이 기보에 적는 표기 그대로다", () => {
    render(<CoordsScreen />);
    for (const 예 of ["73졸63", "43병53", "12마33", "95궁85"]) {
      expect(screen.getByText(예)).toBeTruthy();
    }
  });
});

// --- 포진 화면 ---------------------------------------------------------------

/** 판 위 기물이 선 칸의 이름("84 초 마" 꼴)들. 빈 칸은 이름에 기물이 없다. */
const 판기물 = () =>
  screen
    .getAllByRole("gridcell")
    .map((c) => c.getAttribute("aria-label")!)
    .filter((n) => n.includes(" "))
    .sort();
/** 데이터의 판이 화면에 그려지면 나올 이름들. */
const 기대기물 = (board: BoardMap) =>
  Object.entries(board)
    .map(([s, p]) => `${toJanggiCoord(s)} ${SIDE_LABEL[sideOf(p)]} ${pieceInfo(p).name}`)
    .sort();
const 포진고르기 = (name: string) =>
  fireEvent.click(within(screen.getByRole("group", { name: "포진" })).getByRole("button", { name }));
const 지금수 = () => document.querySelector(".opening-step")!.textContent;
const 단추 = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("포진 화면", () => {
  it.each(OPENINGS.map((o) => [o.name, o] as const))(
    "%s - 열면 완성 모양이고, 처음으로 가서 다음으로 끝까지 가는 동안 판이 데이터의 국면과 같다",
    (name, o) => {
      render(<OpeningsScreen />);
      포진고르기(name);
      expect(screen.getByRole("heading", { level: 3, name: `${name} 포진` })).toBeTruthy();
      for (const line of o.lines) {
        if (o.lines.length > 1) {
          fireEvent.click(within(screen.getByRole("group", { name: "차림" })).getByRole("button", { name: line.setup }));
        }
        const n = line.moves.length;
        expect(판기물()).toEqual(기대기물(positionAt(line, n).board));
        expect(지금수()).toMatch(new RegExp(`^${n}/${n} · .+ · 완성$`));
        expect(단추("다음").disabled).toBe(true);
        expect(단추("끝으로").disabled).toBe(true);

        fireEvent.click(단추("처음으로"));
        expect(지금수()).toBe(`0/${n} · 처음 차림`);
        expect(판기물()).toEqual(기대기물(positionAt(line, 0).board));
        expect(단추("이전").disabled).toBe(true);
        expect(단추("처음으로").disabled).toBe(true);

        for (let step = 1; step <= n; step++) {
          fireEvent.click(단추("다음"));
          expect(판기물()).toEqual(기대기물(positionAt(line, step).board));
        }
        expect(지금수()).toMatch(/ · 완성$/);
        fireEvent.click(단추("이전"));
        expect(판기물()).toEqual(기대기물(positionAt(line, n - 1).board));
      }
    }
  );

  /*
   * 지금 수는 이 앱의 기보 표기로 적는다. 양귀마는 수 순서도 본다 - 협회 뜻("귀에 마 둘을 놓은 뒤
   * 가운데 졸을 한 칸")대로 졸이 맨 뒤다. 조사 시험의 순서(졸 먼저)로 돌아가면 여기서 잡는다.
   */
  it.each([
    ["원앙마", ["1/4 · 75졸74", "2/4 · 02마83", "3/4 · 08마87", "4/4 · 83마75 · 완성"]],
    ["양귀마", ["1/3 · 03마84", "2/3 · 07마86", "3/3 · 75졸65 · 완성"]],
  ])("지금 수는 이 앱의 기보 표기로 적는다(%s)", (name, expected) => {
    render(<OpeningsScreen />);
    포진고르기(name);
    fireEvent.click(단추("처음으로"));
    const seen = expected.map(() => {
      fireEvent.click(단추("다음"));
      return 지금수();
    });
    expect(seen).toEqual(expected);
  });

  it("한 칸 오가면 기물이 날아간다 - 다음은 그 수대로, 이전은 거꾸로. 처음·끝으로 건너뛰면 날지 않는다", () => {
    render(<OpeningsScreen />);
    포진고르기("원앙마");
    /** 날아오는 기물이 선 칸들(판이 도착 칸의 기물 안에 .fly 를 그린다). */
    const 나는칸 = () => [...document.querySelectorAll("[data-piece]")].filter((g) => g.querySelector(".fly")).map((g) => g.getAttribute("data-piece"));
    fireEvent.click(단추("처음으로"));
    expect(나는칸()).toEqual([]);
    fireEvent.click(단추("다음")); // 75졸74 = e4d4
    expect(나는칸()).toEqual(["d4"]);
    fireEvent.click(단추("이전")); // 74 의 졸이 75 로 돌아간다
    expect(나는칸()).toEqual(["e4"]);
    fireEvent.click(단추("끝으로"));
    expect(나는칸()).toEqual([]);
  });

  it("차림 고르기는 차림이 둘 이상인 귀마·면상에만 있다", () => {
    render(<OpeningsScreen />);
    const 차림 = () =>
      screen.queryByRole("group", { name: "차림" })
        ? within(screen.getByRole("group", { name: "차림" })).getAllByRole("button").map((b) => b.textContent)
        : null;
    const seen = OPENINGS.map((o) => {
      포진고르기(o.name);
      return [o.name, 차림()];
    });
    expect(seen).toEqual([
      ["귀마", ["마상마상", "상마상마"]],
      ["원앙마", null],
      ["면상", ["상마마상", "마상마상", "상마상마"]],
      ["양귀마", null],
      ["양귀상", null],
    ]);
  });

  it("도중에 다른 포진이나 차림을 고르면 그 완성 모양이 선다", () => {
    render(<OpeningsScreen />);
    포진고르기("면상");
    fireEvent.click(단추("처음으로"));
    fireEvent.click(within(screen.getByRole("group", { name: "차림" })).getByRole("button", { name: "마상마상" }));
    expect(지금수()).toBe("2/2 · 08상85 · 완성");
    fireEvent.click(단추("처음으로"));
    포진고르기("양귀상");
    expect(지금수()).toBe("5/5 · 07상84 · 완성");
  });

  it("차림 줄은 데이터에서 만든다 - 차림 이름과 수", () => {
    render(<OpeningsScreen />);
    const seen = OPENINGS.map((o) => {
      포진고르기(o.name);
      return screen.getAllByText(/에서 \d수에 됩니다\.$/).map((p) => p.textContent);
    });
    expect(seen).toEqual([
      ["마상마상·상마상마에서 1수에 됩니다."],
      ["마상상마에서 4수에 됩니다."],
      ["상마마상·마상마상·상마상마에서 2수에 됩니다."],
      ["상마마상에서 3수에 됩니다."],
      ["마상상마에서 5수에 됩니다."],
    ]);
  });

  it("정석이 아니라는 말이 늘 보이고, 판의 기물은 집히지 않는다", () => {
    render(<OpeningsScreen />);
    for (const o of OPENINGS) {
      포진고르기(o.name);
      expect(screen.getByText(/^모양 만드는 수는 정석이 아니고, 상대가 가만히 있다고 친 길입니다\./)).toBeTruthy();
    }
    /*
     * 집히지 않는 기물에는 판이 fixed 를 붙인다(Board.tsx). 붙지 않으면 손 모양 커서가 서고, 끌면
     * 기물이 손을 따라오며, 폰에서 기물을 밀어 쪽을 굴릴 수 없다. 판이 그대로인지만 보면 이것을
     * 놓친다 - 화면은 옮기는 수를 받아도 아무 일도 하지 않는다.
     */
    const 안고정 = () => [...document.querySelectorAll("[data-piece]")].filter((g) => !g.classList.contains("fixed"));
    for (const o of OPENINGS) {
      포진고르기(o.name);
      expect([o.name, "완성", document.querySelectorAll("[data-piece]").length, 안고정()]).toEqual([o.name, "완성", 32, []]);
      fireEvent.click(단추("처음으로"));
      expect([o.name, "처음", 안고정()]).toEqual([o.name, "처음", []]);
    }
    const before = 판기물();
    // 마지막에 고른 양귀상은 마상상마 차림이다. 02 의 마는 83 으로 갈 수 있는 기물이다.
    fireEvent.pointerUp(screen.getByRole("gridcell", { name: "02 초 마" }));
    fireEvent.pointerUp(screen.getByRole("gridcell", { name: "83" }));
    끌기("b1", "c3");
    expect(판기물()).toEqual(before);
  });
});

// --- 읽을거리 화면 -------------------------------------------------------------

describe("읽을거리 화면", () => {
  it("목록에 글 제목이 서고, 누르면 그 글이, 목록으로를 누르면 목록이 선다", () => {
    render(<ReadingsScreen />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "상차림 넷은 무엇이 다른가요",
      "졸은 둘씩 붙여 둡니다",
    ]);
    for (const r of READINGS) {
      fireEvent.click(screen.getByRole("button", { name: r.title }));
      expect(screen.getByRole("heading", { level: 2, name: r.title })).toBeTruthy();
      expect(screen.queryByRole("heading", { level: 2, name: "읽을거리" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
      expect(screen.getByRole("heading", { level: 2, name: "읽을거리" })).toBeTruthy();
    }
  });

  it("글의 문단과 점 목록이 데이터 순서대로 다 선다. 점 목록 줄 앞의 굵은 말도 선다", () => {
    render(<ReadingsScreen />);
    for (const r of READINGS) {
      fireEvent.click(screen.getByRole("button", { name: r.title }));
      const card = document.querySelector(".learn-reading")!;
      const expected = r.blocks.flatMap((b) =>
        "p" in b ? [b.p] : b.list.map((i: ListItem) => (i.lead ? `${i.lead}: ${i.text}` : i.text))
      );
      expect([...card.querySelectorAll("p, li")].map((e) => e.textContent)).toEqual(expected);
      fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    }
  });

  /*
   * 글 1 의 차림 세 줄이 말하는 "이어지기 쉬운 포진" 은 포진 화면의 데이터(그 차림의 수순이 있는
   * 포진)와 같아야 한다. 한쪽만 고치면 두 화면이 다른 말을 한다.
   */
  it("글 1 의 차림 세 줄 - 차림 넷이 한 번씩 나오고, 이어지기 쉬운 포진이 포진 데이터와 같다", () => {
    const rows = READINGS[0].blocks.flatMap((b) => ("list" in b ? b.list.filter((i) => i.lead) : []));
    expect(rows.flatMap((i) => i.lead!.split(" · ")).sort()).toEqual(SETUPS.map((s) => s.name).sort());
    for (const row of rows) {
      const said = [...row.text.matchAll(/(\S+) 포진/g)].map((m) => m[1]).sort();
      for (const setup of row.lead!.split(" · ")) {
        const data = OPENINGS.filter((o) => o.lines.some((l) => l.setup === setup)).map((o) => o.name).sort();
        expect([setup, said]).toEqual([setup, data]);
      }
    }
  });
});
