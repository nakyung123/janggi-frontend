// @vitest-environment jsdom
//
// 서버에 올리는 규칙 - 무엇을 올리고 무엇을 안 올리는가
//
// 이 훅의 일은 "언제 올릴지" 를 정하는 것 하나다. 그 규칙이 조용히 깨지면 두 가지로
// 나타난다. 올리지 말아야 할 것이 올라가거나(로그인 전에 둔 판), 올라가야 할 것이
// 안 올라간다(복기를 돌린 판). 둘 다 화면으로는 잘 안 보인다 - 서버를 봐야 안다.
//
// 서버와 말하는 자리(server/api.ts)는 가짜로 바꿔 끼운다. 여기서 볼 것은 **몇 번
// 부르는가와 무엇을 들고 부르는가**이지 HTTP 가 아니다.

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArchivedGame } from "../janggi/archive";
import type { ServerSummary } from "../server/api";
import { fetchGames, fetchLoginState, uploadGame, withdraw } from "../server/api";
import { mergeRows, useServerGames } from "./useServerGames";

vi.mock("../server/api", () => ({
  LOGIN_PATH: "/api/oauth2/authorization/google",
  fetchLoginState: vi.fn(),
  fetchGames: vi.fn(),
  fetchGame: vi.fn(),
  uploadGame: vi.fn(),
  logout: vi.fn(),
  withdraw: vi.fn(),
}));

const 로그인확인 = vi.mocked(fetchLoginState);
const 목록받기 = vi.mocked(fetchGames);
const 올리기 = vi.mocked(uploadGame);
const 탈퇴하기 = vi.mocked(withdraw);

/** 서버가 주는 목록 한 줄. 끝난 때와 번호만 다르게 쓴다. */
function 서버판(clientId: string, endedAt = 1760000000000, 복기 = false): ServerSummary {
  return {
    id: Math.abs(clientId.length * 7),
    clientId,
    endedAt,
    mySide: "cho",
    levelId: "k12",
    levelName: "12급",
    variant: "janggi",
    resultKind: "resign",
    resultWinner: "han",
    moves: 1,
    reviewed: 복기,
    lastFen: "마지막판",
  };
}

/** 끝난 판 하나. 올릴지 말지를 가르는 데 쓰이는 칸만 맞춰 둔다. */
function 판(id: string, 복기 = false): ArchivedGame {
  return {
    id,
    endedAt: 1760000000000,
    mySide: "cho",
    levelId: "k12",
    levelName: "12급",
    variant: "janggi",
    result: { kind: "resign", winner: "han" },
    history: [{ fen: "판" }, { fen: "판2" }] as unknown as ArchivedGame["history"],
    reviewed: 복기 ? ([{ ply: 1 }] as unknown as ArchivedGame["reviewed"]) : null,
  };
}

/** 올린 판의 번호만 뽑는다. */
function 올린것(): string[] {
  return 올리기.mock.calls.map((c) => (c[0] as ArchivedGame).id);
}

/** 잠깐 둔다. "안 간다" 를 보는 검사는 기다려 봐야 한다. */
function 잠깐() {
  return new Promise((r) => setTimeout(r, 50));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  로그인확인.mockResolvedValue(true);
  목록받기.mockResolvedValue([]);
  올리기.mockResolvedValue(1);
  // 실패를 일부러 내는 검사가 있다. 콘솔 기록은 여기서 볼 것이 아니다.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("로그인한 뒤에 둔 판만 올린다", () => {
  it("앱이 뜰 때 이미 있던 판은 안 올라간다", async () => {
    const { result } = renderHook(() => useServerGames([판("예전판")]));

    await waitFor(() => expect(result.current.loggedIn).toBe(true));
    await 잠깐();

    expect(올리기).not.toHaveBeenCalled();
    // 서버에 없으므로 화면에는 "이 기기에만 있음" 이 붙어야 한다.
    expect(result.current.onServer("예전판")).toBe(false);
  });

  it("뜬 뒤에 새로 생긴 판은 올라간다", async () => {
    const { result, rerender } = renderHook(({ games }) => useServerGames(games), {
      initialProps: { games: [판("예전판")] },
    });
    await waitFor(() => expect(result.current.loggedIn).toBe(true));

    rerender({ games: [판("새판"), 판("예전판")] });

    await waitFor(() => expect(올린것()).toEqual(["새판"]));
    await waitFor(() => expect(result.current.onServer("새판")).toBe(true));
  });

  it("로그인하지 않았으면 아무것도 안 올라간다", async () => {
    로그인확인.mockResolvedValue(false);
    const { result, rerender } = renderHook(({ games }) => useServerGames(games), {
      initialProps: { games: [] as ArchivedGame[] },
    });
    await waitFor(() => expect(result.current.loggedIn).toBe(false));

    rerender({ games: [판("새판")] });
    await 잠깐();

    expect(올리기).not.toHaveBeenCalled();
  });

  it("서버에 못 닿으면 로그인 안 한 것으로 둔다 - 로그인 단추가 보여야 한다", async () => {
    로그인확인.mockRejectedValue(new Error("Failed to fetch"));

    const { result } = renderHook(() => useServerGames([]));

    await waitFor(() => expect(result.current.loggedIn).toBe(false));
  });

  it("로그인하러 가는 주소를 화면에 넘긴다 - 컴포넌트는 server/ 를 모른다", async () => {
    로그인확인.mockResolvedValue(false);

    const { result } = renderHook(() => useServerGames([]));

    await waitFor(() => expect(result.current.loggedIn).toBe(false));
    expect(result.current.loginPath).toBe("/api/oauth2/authorization/google");
  });
});

describe("복기를 돌리면 다시 올린다", () => {
  it("같은 판이라도 복기가 붙으면 한 번 더 간다", async () => {
    const { result, rerender } = renderHook(({ games }) => useServerGames(games), {
      initialProps: { games: [] as ArchivedGame[] },
    });
    await waitFor(() => expect(result.current.loggedIn).toBe(true));

    rerender({ games: [판("새판")] });
    await waitFor(() => expect(올린것()).toEqual(["새판"]));

    rerender({ games: [판("새판", true)] });

    // **두 번이어야 한다.** 한 번이면 복기 등급이 서버에 영원히 안 들어간다.
    await waitFor(() => expect(올린것()).toEqual(["새판", "새판"]));
  });

  it("아무것도 안 바뀌면 다시 올리지 않는다", async () => {
    const { result, rerender } = renderHook(({ games }) => useServerGames(games), {
      initialProps: { games: [] as ArchivedGame[] },
    });
    await waitFor(() => expect(result.current.loggedIn).toBe(true));

    rerender({ games: [판("새판")] });
    await waitFor(() => expect(올린것()).toEqual(["새판"]));

    // 같은 내용으로 다시 그려지는 일은 흔하다 - 다른 상태가 바뀔 때마다 그렇다.
    rerender({ games: [판("새판")] });
    await 잠깐();

    expect(올린것()).toEqual(["새판"]);
  });
});

describe("어긋났을 때", () => {
  it("실패한 판은 기록에 안 남고, 다음 판이 끝날 때 같이 올라간다", async () => {
    올리기.mockRejectedValueOnce(new Error("서버가 받지 않았습니다. (502)"));

    const { result, rerender } = renderHook(({ games }) => useServerGames(games), {
      initialProps: { games: [] as ArchivedGame[] },
    });
    await waitFor(() => expect(result.current.loggedIn).toBe(true));

    rerender({ games: [판("실패판")] });

    await waitFor(() => expect(result.current.error).toContain("502"));
    expect(result.current.onServer("실패판")).toBe(false);

    rerender({ games: [판("다음판"), 판("실패판")] });

    await waitFor(() => expect(올린것()).toEqual(["실패판", "다음판", "실패판"]));
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.onServer("실패판")).toBe(true);
  });

  it("여럿을 올릴 때 하나씩 간다 - 서버가 겹치는 올리기를 거절한다", async () => {
    let 보내는중 = 0;
    let 겹친적있다 = false;
    올리기.mockImplementation(async () => {
      보내는중 += 1;
      if (보내는중 > 1) 겹친적있다 = true;
      await new Promise((r) => setTimeout(r, 10));
      보내는중 -= 1;
      return 1;
    });

    const { result, rerender } = renderHook(({ games }) => useServerGames(games), {
      initialProps: { games: [] as ArchivedGame[] },
    });
    await waitFor(() => expect(result.current.loggedIn).toBe(true));

    rerender({ games: [판("가"), 판("나"), 판("다")] });

    await waitFor(() => expect(올린것()).toHaveLength(3));
    // 셋 다 적혀야 한다. 하나라도 빠지면 화면이 거짓말을 한다.
    // 셋째 올리기는 불린 뒤 10ms 가 지나야 끝나므로 적힐 때까지 기다린다. 불린 횟수만 보고
    // 바로 보면, 컴퓨터가 바쁠 때 그 틈에 걸려 가끔 실패했다(2026-10-26, 4번 중 2번).
    await waitFor(() => expect(["가", "나", "다"].every((id) => result.current.onServer(id))).toBe(true));
    expect(겹친적있다).toBe(false);
  });
});

describe("기기와 서버를 합친다", () => {
  it("같은 판은 한 줄이다 - 번호가 같으면 같은 판이다", () => {
    const 줄 = mergeRows([판("가")], [서버판("가")]);

    expect(줄).toHaveLength(1);
    expect(줄[0].local).toBe(true);
    expect(줄[0].onServer).toBe(true);
    // 기기에 있는 쪽을 쓴다 - 내용이 있어 열 때 기다리지 않는다.
    expect(줄[0].moves).toBe(1);
  });

  it("서버에만 있는 판도 한 줄로 선다", () => {
    const 줄 = mergeRows([], [서버판("서버것")]);

    expect(줄).toHaveLength(1);
    expect(줄[0].local).toBe(false);
    expect(줄[0].serverId).toBeGreaterThan(0);
    // 작은 그림을 그릴 수 있어야 한다. 이것이 없으면 카드가 빈 판이 된다.
    expect(줄[0].lastFen).toBe("마지막판");
  });

  it("방금 올린 판은 서버 목록에 없어도 올라간 것으로 센다", () => {
    // 서버 목록은 쪽을 열 때 한 번 받아 둔 것이라 방금 올린 판이 들어 있지 않다.
    // 올린 기록까지 보지 않으면 올라간 판에 "이 기기에만 있음" 이 남는다.
    const 줄 = mergeRows([판("방금올린것")], [], (id) => id === "방금올린것");

    expect(줄[0].onServer).toBe(true);
    expect(줄[0].local).toBe(true);
  });

  it("끝난 순서로 선다 - 기기 것과 서버 것이 섞여도", () => {
    const 줄 = mergeRows(
      [
        { ...판("기기-오래된것"), endedAt: 100 },
        { ...판("기기-새것"), endedAt: 300 },
      ],
      [서버판("서버-중간것", 200)],
    );

    expect(줄.map((r) => r.id)).toEqual(["기기-새것", "서버-중간것", "기기-오래된것"]);
  });
});

describe("로그아웃했다 다시 로그인하면", () => {
  it("서버 목록이 표시를 바로잡는다 - 올린 기록이 지워져 있어도", async () => {
    // 기록은 비어 있는데(로그아웃이 지웠다) 서버에는 그 판이 있는 상태다.
    목록받기.mockResolvedValue([서버판("예전판")]);

    const { result } = renderHook(() => useServerGames([판("예전판")]));

    await waitFor(() => expect(result.current.onServer("예전판")).toBe(true));
    expect(result.current.rows[0].onServer).toBe(true);
    // 서버가 가진 것을 다시 올리지 않는다.
    await 잠깐();
    expect(올리기).not.toHaveBeenCalled();
  });

  it("탈퇴하면 로그인이 풀리고 서버 표시가 사라진다 - 기기 목록은 그대로다", async () => {
    로그인확인.mockResolvedValue(true);
    목록받기.mockResolvedValue([서버판("예전판")]);
    탈퇴하기.mockResolvedValue(undefined);

    const { result } = renderHook(() => useServerGames([판("예전판")]));
    await waitFor(() => expect(result.current.onServer("예전판")).toBe(true));

    result.current.withdraw();

    await waitFor(() => expect(result.current.loggedIn).toBe(false));
    // **기기 목록은 그대로다.** 서버에 둔 것만 가는 일이다.
    expect(result.current.rows.map((r) => r.id)).toEqual(["예전판"]);
    // 서버에 있다는 표시는 사라져야 한다 - 이제 없으니까.
    expect(result.current.onServer("예전판")).toBe(false);
    expect(result.current.rows[0].onServer).toBe(false);
  });

  it("탈퇴가 어긋나면 로그인이 풀리지 않는다 - 안 된 것을 된 것처럼 보이면 안 된다", async () => {
    로그인확인.mockResolvedValue(true);
    목록받기.mockResolvedValue([서버판("예전판")]);
    탈퇴하기.mockRejectedValue(new Error("서버가 받지 않았습니다. (502)"));

    const { result } = renderHook(() => useServerGames([판("예전판")]));
    await waitFor(() => expect(result.current.onServer("예전판")).toBe(true));

    result.current.withdraw();

    await waitFor(() => expect(result.current.error).toContain("502"));
    expect(result.current.loggedIn).toBe(true);
    expect(result.current.onServer("예전판")).toBe(true);
  });

  it("목록을 못 받아도 올리기는 돈다", async () => {
    목록받기.mockRejectedValue(new Error("서버가 받지 않았습니다. (502)"));

    const { result, rerender } = renderHook(({ games }) => useServerGames(games), {
      initialProps: { games: [] as ArchivedGame[] },
    });
    await waitFor(() => expect(result.current.error).toContain("502"));

    rerender({ games: [판("새판")] });

    await waitFor(() => expect(올린것()).toEqual(["새판"]));
  });
});
