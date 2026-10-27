// @vitest-environment jsdom
//
// 메뉴 목록(screens.ts) - 한 줄을 넣으면 폰 메뉴와 왼쪽 메뉴에 다 뜨고, 누르면 그 화면이 선다
//
// 새 화면을 더하는 세션은 이 목록에 한 줄만 넣고 App.tsx 를 건드리지 않는다. 그 약속이
// 깨지면(어느 한 메뉴가 목록 대신 제 목록을 들면) 한쪽에만 화면이 뜬다. 넓은 화면에서
// 보면 멀쩡하고 폰에서만 갈 길이 없어지는 식이라, 눈으로는 놓치기 쉽다.
//
// 여기서는 진짜 목록 뒤에 임시 화면 둘(같은 묶음)을 붙여 App 을 띄운다. 기대하는 메뉴는
// 목록에서 만든다(menuOf) - 다른 세션이 목록에 화면을 더해도 이 시험은 고치지 않는다.
// 어느 폭에서 어느
// 메뉴가 보이는지는 CSS 가 정하고 jsdom 은 CSS 를 읽지 않는다 - 그래서 두 메뉴가 다 붙어
// 있고, 각각 안에서 찾는다.

import "./test/browser";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { GROUPS, SCREENS, menuOf } from "./screens";
import type { Screen } from "./screens";

vi.mock("./engine/engine", async () => ({
  JanggiEngine: (await import("./test/fakeEngine")).FakeEngine,
}));

vi.mock("./report/events", () => ({ track: () => {} }));

vi.mock("./screens", async (importOriginal) => {
  const real = await importOriginal<typeof import("./screens")>();
  return {
    ...real,
    SCREENS: [
      ...real.SCREENS,
      { id: "temp-a", group: "learn", label: "임시 하나", Component: () => <p>임시 하나 화면</p> },
      { id: "temp-b", group: "learn", label: "임시 둘", Component: () => <p>임시 둘 화면</p> },
    ],
  };
});

afterEach(cleanup);

async function start() {
  render(<App />);
  // 엔진이 뜨면 대국 패널이 선다.
  await waitFor(() => expect(screen.getByRole("button", { name: "새 대국" })).toBeTruthy());
}

const 왼쪽메뉴 = () => screen.getByRole("complementary", { name: "왼쪽 메뉴" });
function 폰메뉴() {
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  return screen.getByRole("dialog", { name: "메뉴" });
}
const 항목들 = (box: HTMLElement) =>
  within(within(box).getByRole("navigation", { name: "모드" }))
    .getAllByRole("button")
    .map((b) => b.textContent);

describe("메뉴 목록에 한 줄", () => {
  it("목록의 화면이 폰 메뉴와 왼쪽 메뉴에 같은 순서로 다 뜬다", async () => {
    await start();
    const 기대 = menuOf(SCREENS).flatMap((g) => g.items.map((i) => i.label));
    expect(기대).toEqual(expect.arrayContaining(["대국", "기보", "임시 하나", "임시 둘"]));
    expect(항목들(왼쪽메뉴())).toEqual(기대);
    expect(항목들(폰메뉴())).toEqual(기대);
  });

  it("묶음 이름은 menuOf 가 정한 것만 두 메뉴에 선다", async () => {
    await start();
    const 묶음이름 = (box: HTMLElement) =>
      Array.from(box.querySelectorAll(".menu-heading")).map((e) => e.textContent);
    const 기대 = menuOf(SCREENS).flatMap((g) => (g.heading ? [g.heading] : []));
    // 임시 화면 둘이 같은 묶음이라 적어도 그 이름은 선다.
    expect(기대).toContain("배우기");
    expect(묶음이름(왼쪽메뉴())).toEqual(기대);
    expect(묶음이름(폰메뉴())).toEqual(기대);
  });

  it("왼쪽 메뉴에서 누르면 그 화면이 서고 판은 내려가며, 대국을 누르면 판이 돌아온다", async () => {
    await start();
    fireEvent.click(within(왼쪽메뉴()).getByRole("button", { name: "임시 하나" }));
    expect(screen.getByText("임시 하나 화면")).toBeTruthy();
    expect(screen.queryByRole("grid", { name: "장기판" })).toBeNull();
    expect(within(왼쪽메뉴()).getByRole("button", { name: "임시 하나" }).getAttribute("aria-current")).toBe("page");

    fireEvent.click(within(왼쪽메뉴()).getByRole("button", { name: "대국" }));
    expect(screen.queryByText("임시 하나 화면")).toBeNull();
    expect(screen.getByRole("grid", { name: "장기판" })).toBeTruthy();
  });

  it("폰 메뉴에서 누르면 그 화면이 서고 메뉴는 닫힌다", async () => {
    await start();
    fireEvent.click(within(폰메뉴()).getByRole("button", { name: "임시 둘" }));
    expect(screen.getByText("임시 둘 화면")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "메뉴" })).toBeNull();
  });
});

describe("menuOf", () => {
  const 화면 = (id: string, group: Screen["group"]): Screen => ({
    id,
    group,
    label: id,
    Component: () => null,
  });

  it("묶음 순서(GROUPS)대로 서고, 항목이 없는 묶음은 빠진다", () => {
    const menu = menuOf([화면("기보", "record"), 화면("기물", "learn"), 화면("규칙", "learn")]);
    expect(GROUPS.map((g) => g.id)).toEqual(["play", "puzzle", "learn", "practice", "record"]);
    expect(menu).toEqual([
      {
        heading: "배우기",
        items: [
          { id: "기물", label: "기물" },
          { id: "규칙", label: "규칙" },
        ],
      },
      { heading: null, items: [{ id: "기보", label: "기보" }] },
    ]);
  });

  it("항목이 하나뿐인 묶음은 이름 없이, 둘 이상이면 이름과 함께 선다", () => {
    const menu = menuOf([화면("대국", "play"), 화면("기물", "learn"), 화면("규칙", "learn")]);
    expect(menu.map((g) => g.heading)).toEqual([null, "배우기"]);
  });
});
