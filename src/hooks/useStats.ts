// 내 전적 화면에 보일 상태 - 로그인·서버 목록·계산 결과를 한 갈래로 모은다
//
// 화면(components/record/StatsScreen.tsx)은 state 를 보고 그 모양만 그린다. 숫자는 computeStats
// (stats.ts) 그대로다. 여기서는 "숫자를 낼 수 있나, 못 내면 왜" 만 가른다.
//
// **못 내는 까닭을 숫자로 때우지 않는다.** 로그인을 확인하는 중, 로그인하지 않음, 서버 목록을
// 받는 중, 받지 못함은 저마다 다른 상태로 준다. 하나라도 0판이나 빈 칸으로 그리면 실패가
// "아직 둔 판이 없다" 로 보인다.

import { useMemo } from "react";
import { levelById } from "../engine/levels";
import type { ArchivedGame } from "../janggi/archive";
import { SERVER_GAME_LIMIT } from "../server/api";
import type { PlayerStats } from "./stats";
import { computeStats } from "./stats";
import type { ServerGames } from "./useServerGames";

export type StatsView =
  /** 로그인 상태를 묻는 중 */
  | { state: "checking" }
  | { state: "signed-out" }
  /** 로그인했고 서버 목록을 받는 중 */
  | { state: "loading" }
  /** 서버 목록을 받지 못했다. message 는 한국어(오류 코드 포함), retry 는 다시 받기 */
  | { state: "failed"; message: string; retry: () => void }
  | {
      state: "ok";
      stats: PlayerStats;
      /** 지금 점수에 가장 가까운 급수의 이름. 센 판이 없으면 null */
      nearestLevelName: string | null;
      /** 서버 목록이 한도만큼 찼다. 그 뒤 판은 서버에 없어 점수에 안 들어간다 */
      full: boolean;
      /** 서버가 한 사람에게 받아 두는 판 수(SERVER_GAME_LIMIT). 화면이 server/ 를 모르게 여기서 준다 */
      limit: number;
      /**
       * 서버 일이 마지막으로 어긋난 까닭(ServerGames.error). 기보 올리기만이 아니라 서버의 판
       * 받기·로그아웃·탈퇴 실패도 든다. 올리기 실패면 그 판은 점수에서 빠진다
       */
      syncError: string | null;
    };

/** 이 훅이 서버 상태에서 읽는 것만. 시험이 가짜를 짧게 만들 수 있게 좁혀 둔다. */
export type StatsSource = Pick<
  ServerGames,
  "loggedIn" | "summaries" | "listError" | "reloadList" | "uploadedHere" | "error"
>;

export function useStats(server: StatsSource, games: readonly ArchivedGame[]): StatsView {
  const { loggedIn, summaries, listError, reloadList, uploadedHere, error } = server;

  return useMemo((): StatsView => {
    if (loggedIn === null) return { state: "checking" };
    if (!loggedIn) return { state: "signed-out" };
    if (listError !== null) return { state: "failed", message: listError, retry: reloadList };

    // 목록이 아직 없으면(null) computeStats 가 숫자를 내지 않는다 - 그때가 받는 중이다.
    const result = computeStats({ server: summaries, local: games, uploaded: uploadedHere });
    if (result.status === "no-server-list" || summaries === null) return { state: "loading" };

    const { stats } = result;
    return {
      state: "ok",
      stats,
      nearestLevelName: stats.rating ? levelById(stats.rating.nearestLevelId).name : null,
      full: summaries.length >= SERVER_GAME_LIMIT,
      limit: SERVER_GAME_LIMIT,
      syncError: error,
    };
  }, [loggedIn, summaries, listError, reloadList, uploadedHere, error, games]);
}
