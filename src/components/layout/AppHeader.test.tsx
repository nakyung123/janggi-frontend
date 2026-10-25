// @vitest-environment jsdom
//
// 폰 헤더 - ☰ 메뉴와 로그인 자리
//
// 폭 900 이하에서는 탭과 업데이트 내역이 ☰ 메뉴로 들어간다. 그 메뉴가 조용히 깨지면
// 폰에서는 **기보 탭으로 갈 길이 없어진다.** 넓은 화면의 탭은 그대로라 데스크톱에서
// 보면 아무 일도 없어 보인다. 그래서 메뉴로 하는 일을 여기서 하나씩 눌러 본다.
//
// 어느 폭에서 무엇이 보이는지는 CSS 가 정하고 jsdom 은 CSS 를 읽지 않는다. 여기서는
// 누르면 무슨 일이 생기는지만 본다. 보이는 모양은 폰 폭에서 눈으로 확인한다.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LOGIN_PATH } from "../../server/api";
import { AppHeader } from "./AppHeader";

afterEach(cleanup);

function 헤더(over: Partial<Parameters<typeof AppHeader>[0]> = {}) {
  const props = {
    mode: "play" as const,
    onMode: vi.fn(),
    problems: null,
    spoken: "",
    onUpdates: vi.fn(),
    onNotice: vi.fn(),
    loggedIn: false as boolean | null,
    busy: false,
    onSignOut: vi.fn(),
    ...over,
  };
  render(<AppHeader {...props} />);
  return props;
}

const 메뉴열기 = () => fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
const 메뉴 = () => screen.getByRole("dialog", { name: "메뉴" });

describe("☰ 메뉴", () => {
  it("누르기 전에는 닫혀 있고, 누르면 열린다", () => {
    헤더();
    expect(screen.queryByRole("dialog", { name: "메뉴" })).toBeNull();
    메뉴열기();
    expect(메뉴()).toBeTruthy();
    expect(screen.getByRole("button", { name: "메뉴 열기" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("기보를 누르면 기보 탭으로 옮기고 닫힌다", () => {
    const p = 헤더();
    메뉴열기();
    fireEvent.click(within(메뉴()).getByRole("button", { name: "기보" }));
    expect(p.onMode).toHaveBeenCalledWith("games");
    expect(screen.queryByRole("dialog", { name: "메뉴" })).toBeNull();
  });

  it("지금 탭에 표시가 붙는다", () => {
    헤더({ mode: "games" });
    메뉴열기();
    expect(within(메뉴()).getByRole("button", { name: "기보" }).getAttribute("aria-current")).toBe("page");
    expect(within(메뉴()).getByRole("button", { name: "대국" }).getAttribute("aria-current")).toBeNull();
  });

  it("업데이트 내역과 고지는 각자의 창을 열고 닫힌다", () => {
    const p = 헤더();
    메뉴열기();
    fireEvent.click(within(메뉴()).getByRole("button", { name: "업데이트 내역" }));
    expect(p.onUpdates).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "메뉴" })).toBeNull();

    메뉴열기();
    fireEvent.click(within(메뉴()).getByRole("button", { name: "고지" }));
    expect(p.onNotice).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "메뉴" })).toBeNull();
  });

  it("개인정보처리방침은 새 탭으로 연다", () => {
    헤더();
    메뉴열기();
    const link = within(메뉴()).getByRole("link", { name: "개인정보처리방침" });
    expect(link.getAttribute("href")).toBe("/privacy/");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("Esc · 바깥 · 닫기 단추로 닫힌다. 아무 탭도 옮기지 않는다", () => {
    const p = 헤더();
    메뉴열기();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "메뉴" })).toBeNull();

    메뉴열기();
    fireEvent.click(메뉴().parentElement as HTMLElement);
    expect(screen.queryByRole("dialog", { name: "메뉴" })).toBeNull();

    메뉴열기();
    fireEvent.click(screen.getByRole("button", { name: "메뉴 닫기" }));
    expect(screen.queryByRole("dialog", { name: "메뉴" })).toBeNull();

    expect(p.onMode).not.toHaveBeenCalled();
  });

  it("메뉴 안을 눌러도 닫히지 않는다", () => {
    헤더();
    메뉴열기();
    fireEvent.click(메뉴());
    expect(메뉴()).toBeTruthy();
  });
});

describe("헤더 오른쪽 로그인 자리", () => {
  it("로그인하지 않았으면 구글 로그인으로 가는 링크", () => {
    헤더({ loggedIn: false });
    expect(screen.getByRole("link", { name: "로그인" }).getAttribute("href")).toBe(LOGIN_PATH);
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });

  it("로그인했으면 로그아웃. 누르면 로그아웃한다", () => {
    const p = 헤더({ loggedIn: true });
    expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(p.onSignOut).toHaveBeenCalledTimes(1);
  });

  it("서버와 주고받는 중에는 로그아웃이 잠긴다", () => {
    헤더({ loggedIn: true, busy: true });
    expect((screen.getByRole("button", { name: "로그아웃" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("확인하는 중에는 아무것도 세우지 않는다", () => {
    헤더({ loggedIn: null });
    expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });

  it("탈퇴는 헤더에 두지 않는다", () => {
    헤더({ loggedIn: true });
    expect(screen.queryByRole("button", { name: "탈퇴" })).toBeNull();
  });
});
