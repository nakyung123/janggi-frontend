// @vitest-environment jsdom
//
// 내 전적 화면 - 정해 둔 서버 목록을 넣으면 화면의 숫자가 계산(computeStats)과 같고, 숫자를 못
// 낼 때는 숫자 대신 까닭이 선다
//
// 화면은 App 이 넘기는 기보 목록과 서버 상태(ScreenProps)만 받는다. 서버 상태는 가짜로 만들어
// 넘긴다 - 여기서 볼 것은 무엇을 그리는가이지 서버와 말하는 길이 아니다(그건
// useServerGames.test.tsx 와 로그인·기보 E2E 가 본다).

import "../../test/browser";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { levelById } from "../../engine/levels";
import type { PlayerStats } from "../../hooks/stats";
import { computeStats } from "../../hooks/stats";
import type { ServerGames } from "../../hooks/useServerGames";
import type { ArchivedGame } from "../../janggi/archive";
import type { Side } from "../../janggi/pieces";
import type { MoveGrade, ReviewedMove } from "../../janggi/review";
import type { ServerSummary } from "../../server/api";
import { StatsScreen } from "./StatsScreen";

afterEach(cleanup);

/** 화면이 받는 서버 상태. 따로 안 주면 로그인했고 빈 목록을 받은 상태다. */
function 서버상태(over: Partial<ServerGames> = {}): ServerGames {
  return {
    loggedIn: true,
    loginPath: "/api/oauth2/authorization/google",
    onServer: () => false,
    rows: [],
    pull: async () => null,
    busy: false,
    error: null,
    summaries: [],
    listError: null,
    reloadList: () => {},
    uploadedHere: () => false,
    signOut: () => {},
    withdraw: () => {},
    ...over,
  };
}

/** 서버 목록 한 줄. 따로 안 주면 12급과 초로 둬서 진 판(기권)이다. */
function 서버판(clientId: string, endedAt: number, over: Partial<ServerSummary> = {}): ServerSummary {
  return {
    id: endedAt,
    clientId,
    endedAt,
    mySide: "cho",
    levelId: "k12",
    levelName: "12급",
    variant: "janggi",
    resultKind: "resign",
    resultWinner: "han",
    moves: 80,
    reviewed: false,
    lastFen: null,
    ...over,
  };
}

/** 복기 한 줄. 화면이 보는 칸(수 번호·둔 쪽·등급·승률 하락)만 뜻이 있다. */
function 수(index: number, mover: Side, grade: MoveGrade, winDrop: number): ReviewedMove {
  return {
    index, mover, played: "a4a5", playedNotation: "71졸61",
    best: "a4a5", bestNotation: "71졸61",
    scoreBefore: 0, scoreAfter: 0, loss: 0, winDrop, grade,
    note: { verdict: null, best: null, bestDoes: null, after: null },
  };
}

/** 이 기기에 있는, 서버 목록의 그 판(같은 번호). 복기가 붙어 있다. */
function 복기한판(s: ServerSummary, reviewed: ReviewedMove[]): ArchivedGame {
  return {
    id: s.clientId,
    endedAt: s.endedAt,
    mySide: s.mySide as Side,
    levelId: s.levelId,
    levelName: s.levelName,
    variant: s.variant,
    result: { kind: s.resultKind as ArchivedGame["result"]["kind"], winner: s.resultWinner as Side | null },
    history: [],
    reviewed,
  };
}

/** 계산 결과. 셀 수 있어야 하는 입력이다. */
function 셈(server: ServerSummary[], local: ArchivedGame[]): PlayerStats {
  const r = computeStats({ server, local, uploaded: () => false });
  if (r.status !== "ok") throw new Error("셀 수 있어야 한다");
  return r.stats;
}

const 글 = () => document.body.textContent ?? "";

describe("숫자가 계산과 같다", () => {
  // 13급 3판(2승 1패), 12급 5판(2승 1무 2패). 그중 셋을 이 기기에서 복기했다.
  const 목록: ServerSummary[] = [
    서버판("a", 1_000, { levelId: "k13", levelName: "13급", resultKind: "checkmate", resultWinner: "cho" }),
    서버판("b", 2_000, { levelId: "k13", levelName: "13급", resultKind: "checkmate", resultWinner: "cho" }),
    서버판("c", 3_000, { levelId: "k13", levelName: "13급" }),
    서버판("d", 4_000, { resultKind: "points", resultWinner: "cho" }),
    서버판("e", 5_000, { resultKind: "flag", resultWinner: "cho" }),
    서버판("f", 6_000, { resultKind: "bikjang", resultWinner: null }),
    서버판("g", 7_000),
    서버판("h", 8_000),
  ];
  const 기기: ArchivedGame[] = [
    복기한판(목록[1], [수(1, "cho", "best", 0), 수(2, "han", "good", 0), 수(3, "cho", "inaccuracy", 0.06), 수(25, "cho", "blunder", 0.3)]),
    복기한판(목록[4], [수(1, "cho", "good", 0.02), 수(21, "cho", "inaccuracy", 0.08), 수(61, "cho", "blunder", 0.25), 수(63, "cho", "best", 0)]),
    복기한판(목록[6], [수(3, "cho", "best", 0), 수(5, "cho", "inaccuracy", 0.07), 수(41, "cho", "good", 0.03)]),
  ];

  it("점수·가까운 급수·센 판 수·급수별 전적·정확도·실수 횟수", () => {
    const 기대 = 셈(목록, 기기);
    render(<StatsScreen games={기기} server={서버상태({ summaries: 목록 })} />);

    // 점수 카드
    expect(screen.getByText(String(기대.rating!.value))).toBeTruthy();
    expect(screen.getByText(`${levelById(기대.rating!.nearestLevelId).name}과 비슷`)).toBeTruthy();
    expect(screen.getByText(`AI 와 둔 ${기대.counted}판으로 셌습니다.`)).toBeTruthy();
    expect(기대.counted).toBe(8);
    expect(screen.getByText("처음 10판은 점수가 크게 움직입니다.")).toBeTruthy();

    // 급수별 전적: 약한 급수부터, 판 수로. 퍼센트는 없다.
    const 줄 = [...document.querySelectorAll(".record-levels > div")].map((d) => d.textContent);
    expect(줄).toEqual(
      기대.byLevel.map((l) => `${l.levelName}${l.played}판 · ${l.won}승 ${l.drawn ? `${l.drawn}무 ` : ""}${l.lost}패`)
    );
    expect(줄).toEqual(["13급3판 · 2승 1패", "12급5판 · 2승 1무 2패"]);

    // 정확도: 판마다 막대 하나, 마지막 판과 평균을 정수 % 로
    expect(document.querySelectorAll(".record-bars > span")).toHaveLength(기대.accuracy.length);
    const 값 = 기대.accuracy.map((p) => p.value);
    const 평균 = 값.reduce((s, v) => s + v, 0) / 값.length;
    expect(
      screen.getByText(`최근 판 ${Math.round(값[값.length - 1])}% · ${값.length}판 평균 ${Math.round(평균)}%`)
    ).toBeTruthy();
    const 막대 = [...document.querySelectorAll<HTMLElement>(".record-bars i")].map((i) => i.style.height);
    expect(막대).toEqual(값.map((v) => `${v}%`));
    expect(글()).not.toMatch(/\d+승률|승률/);

    // 실수 횟수: 한 판 평균(소수 한 자리)과 구간 표(판들을 더한 수)
    const n = 기대.mistakes.length;
    const 큰실수 = 기대.mistakes.reduce((s, g) => s + g.blunders, 0);
    const 아쉬운수 = 기대.mistakes.reduce((s, g) => s + g.inaccuracies, 0);
    expect(
      screen.getByText(`한 판에 큰 실수 ${(큰실수 / n).toFixed(1)}번 · 아쉬운 수 ${(아쉬운수 / n).toFixed(1)}번`)
    ).toBeTruthy();
    const 표 = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((r) => [...r.children].map((c) => c.textContent));
    expect(표).toEqual(
      기대.mistakes[0].byPhase.map((p, i) => [
        p.to === null ? `${p.from}수~` : `${p.from}~${p.to}수`,
        ...(["myMoves", "blunders", "inaccuracies"] as const).map((k) =>
          String(기대.mistakes.reduce((s, g) => s + g.byPhase[i][k], 0))
        ),
      ])
    );
    // 손으로 센 값: 1~20수에 내 수 5(1·3·1·3·5), 큰 실수 0, 아쉬운 수 2(3·5).
    expect(표[0]).toEqual(["1~20수", "5", "0", "2"]);
  });

  it("다른 기기에서만 복기한 판은 정확도에서 빠지고, 그렇다고 적어 둔다", () => {
    render(<StatsScreen games={[]} server={서버상태({ summaries: 목록 })} />);

    expect(screen.getAllByText("복기한 판이 없습니다. 기보에서 판을 열고 복기를 돌리면 여기에 쌓입니다.")).toHaveLength(2);
    expect(screen.getByText("정확도와 실수 횟수는 이 기기에서 복기한 최근 30판으로 셉니다.")).toBeTruthy();
  });
});

describe("판이 적을 때", () => {
  it("0판이면 점수 칸을 그리지 않고, 무엇을 하면 생기는지 적는다", () => {
    render(<StatsScreen games={[]} server={서버상태({ summaries: [] })} />);

    expect(screen.getByText("아직 점수에 센 판이 없습니다.")).toBeTruthy();
    expect(글()).toContain("10수 이상 두다 새 대국으로 버린 판은 진 판으로 셉니다.");
    expect(screen.queryByText("실력 점수")).toBeNull();
    expect(document.querySelector(".record-score-num")).toBeNull();
    expect(글()).not.toMatch(/\b0%|0판으로/);
  });

  it("1판이면 점수와 '처음 10판' 을 적고, 정확도는 막대 없이 숫자 하나다", () => {
    // 12급(316)에게 처음 점수(316)로 졌다: 316 + 40 × (0 − 0.5) = 296, 보이는 수 1296.
    const 판 = 서버판("only", 1_000);
    const 기기 = [복기한판(판, [수(1, "cho", "good", 0.02), 수(3, "cho", "blunder", 0.25), 수(30, "cho", "inaccuracy", 0.06)])];
    const 기대 = 셈([판], 기기);
    render(<StatsScreen games={기기} server={서버상태({ summaries: [판] })} />);

    expect(screen.getByText("1296")).toBeTruthy();
    expect(screen.getByText("12급과 비슷")).toBeTruthy();
    expect(screen.getByText("AI 와 둔 1판으로 셌습니다.")).toBeTruthy();
    expect(screen.getByText("처음 10판은 점수가 크게 움직입니다.")).toBeTruthy();
    expect(글()).toContain("12급1판 · 0승 1패");

    expect(document.querySelector(".record-bars")).toBeNull();
    expect(screen.getByText(`1판 ${Math.round(기대.accuracy[0].value)}%`)).toBeTruthy();
    expect(screen.getByText("판이 쌓이면 변화가 보입니다.")).toBeTruthy();

    expect(screen.getByText("큰 실수 1번 · 아쉬운 수 1번")).toBeTruthy();
    // 61수까지 간 판이 없다. 0 이 아니라 "-".
    const 마지막줄 = within(screen.getByRole("table")).getAllByRole("row").at(-1)!;
    expect([...마지막줄.children].map((c) => c.textContent)).toEqual(["61수~", "-", "-", "-"]);
  });

  it("11판부터는 '처음 10판' 을 적지 않는다", () => {
    const 목록 = Array.from({ length: 11 }, (_, i) => 서버판(`g${i}`, (i + 1) * 1_000));
    render(<StatsScreen games={[]} server={서버상태({ summaries: 목록 })} />);

    expect(screen.getByText("AI 와 둔 11판으로 셌습니다.")).toBeTruthy();
    expect(screen.queryByText("처음 10판은 점수가 크게 움직입니다.")).toBeNull();
  });
});

describe("숫자를 못 낼 때는 숫자 대신 까닭이 선다", () => {
  it("로그인 상태를 확인하는 중", () => {
    render(<StatsScreen games={[]} server={서버상태({ loggedIn: null, summaries: null })} />);
    expect(screen.getByText("로그인 상태를 확인하는 중입니다…")).toBeTruthy();
    expect(document.querySelector(".record-score-num, .record-levels")).toBeNull();
  });

  it("로그인하지 않았으면 로그인하라고 적고, 화면 안에 로그인 단추를 하나 더 두지 않는다", () => {
    render(<StatsScreen games={[]} server={서버상태({ loggedIn: false, summaries: null })} />);
    expect(screen.getByText("로그인하면 내 전적과 실력 점수를 볼 수 있습니다.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector(".record-score-num")).toBeNull();
  });

  it("서버 목록을 받는 중이면 이 기기의 판으로 숫자를 대신 내지 않는다", () => {
    const 판 = 서버판("local", 1_000);
    render(
      <StatsScreen games={[복기한판(판, [])]} server={서버상태({ summaries: null, uploadedHere: () => true })} />
    );
    expect(screen.getByText("서버에서 기보 목록을 받는 중입니다…")).toBeTruthy();
    expect(document.querySelector(".record-score-num")).toBeNull();
  });

  it("서버 목록을 못 받았으면 까닭을 적고, [다시 받기] 가 다시 받는다", () => {
    const reloadList = vi.fn();
    render(
      <StatsScreen
        games={[]}
        server={서버상태({ summaries: null, listError: "서버가 받지 않았습니다. (502) (E-1A2B)", reloadList })}
      />
    );
    const 알림 = screen.getByRole("alert");
    expect(알림.textContent).toContain("기보 목록을 받지 못해 숫자를 낼 수 없습니다.");
    expect(알림.textContent).toContain("(E-1A2B)");
    expect(document.querySelector(".record-score-num")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "다시 받기" }));
    expect(reloadList).toHaveBeenCalledTimes(1);
  });
});

describe("서버 쪽 사정", () => {
  it("서버 목록이 500판이면 그 뒤 판은 점수에 안 들어간다고 적는다", () => {
    const 목록 = Array.from({ length: 500 }, (_, i) => 서버판(`g${i}`, (i + 1) * 1_000));
    render(<StatsScreen games={[]} server={서버상태({ summaries: 목록 })} />);
    expect(
      screen.getByText("서버에 남길 수 있는 500판이 찼습니다. 그 뒤에 둔 판은 점수에 들어가지 않습니다.")
    ).toBeTruthy();
  });

  it("499판이면 그 말이 없다", () => {
    const 목록 = Array.from({ length: 499 }, (_, i) => 서버판(`g${i}`, (i + 1) * 1_000));
    render(<StatsScreen games={[]} server={서버상태({ summaries: 목록 })} />);
    expect(글()).not.toContain("판이 찼습니다");
  });

  it("기보를 서버에 올리지 못했으면 그 까닭을 띄운다 - 그 판은 점수에서 빠진다", () => {
    render(<StatsScreen games={[]} server={서버상태({ error: "로그인이 풀려 기보를 올리지 못했습니다." })} />);
    expect(screen.getByRole("alert").textContent).toBe("로그인이 풀려 기보를 올리지 못했습니다.");
  });
});
