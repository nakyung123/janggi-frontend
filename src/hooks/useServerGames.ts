// 로그인 상태와 "서버에도 남기기" 를 한 곳에서 맡는다.
//
// **판을 저장하는 자리는 둘이다** - 판이 끝날 때(App.tsx)와 복기를 돌린 뒤
// (useGames.ts). 두 군데에 "서버에도 올려라" 를 각각 붙이면 같은 판단이 둘로
// 갈라진다. 그래서 여기서는 **목록이 바뀌는 것만 보고** 올린다. 둘 다 같은 길로
// 처리되고, 서버는 같은 판 번호를 덮어쓴다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArchivedGame, ArchivedResult, ArchivedKind } from "../janggi/archive";
import type { ServerSummary } from "../server/api";
import type { Side } from "../janggi/pieces";
import {
  fetchGame,
  fetchGames,
  fetchLoginState,
  LOGIN_PATH,
  logout,
  uploadGame,
  withdraw as leave,
} from "../server/api";
import { noteTrouble } from "../report/errors";
import { usePersisted } from "./usePersisted";

/**
 * 올린 판을 적어 두는 자리. 쪽을 다시 열어도 다시 올리지 않게.
 *
 * <b>"janggi:" 를 붙이지 않는다.</b> `usePersisted` 가 붙인다 - 붙여서 주면
 * `janggi:janggi:uploaded` 가 된다.
 */
const KEY = "uploaded";

/**
 * 판의 지문. **복기를 돌리면 달라져야 한다** - 그래야 덮어쓰기가 한 번 더 간다.
 *
 * 수의 개수와 복기 여부만 본다. 판의 내용 전체를 해시하는 것보다 싸고, 이 둘 말고
 * 바뀌는 칸이 없다(끝난 판이다).
 */
function fingerprint(game: ArchivedGame): string {
  return `${game.history.length}:${game.reviewed ? 1 : 0}`;
}

function isRecord(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 목록 카드 한 줄. **기기에 있는 판과 서버에만 있는 판을 같은 모양으로** 세운다.
 *
 * 카드가 쓰는 칸만 있다. 내용(`history`)은 없다 - 서버에만 있는 판은 열기 전까지
 * 내용이 없기 때문이다. 열 때 받아 온다.
 */
export interface GameRow {
  /** 브라우저가 만든 번호. 양쪽에서 같은 판을 가리킨다. */
  id: string;
  endedAt: number;
  mySide: Side;
  levelName: string;
  result: ArchivedResult;
  /** 수의 개수. */
  moves: number;
  reviewed: boolean;
  /** 끝났을 때의 판. 카드의 작은 그림이 이것으로 그려진다. */
  lastFen: string | null;
  /** 이 기기에 있나. 없으면 열 때 서버에서 받아 온다. */
  local: boolean;
  /** 서버에도 있나. 없으면 "이 기기에만 있음" 이 붙는다. */
  onServer: boolean;
  /** 서버 번호. 서버에 없으면 `null`. */
  serverId: number | null;
}

/**
 * 기기의 목록과 서버의 목록을 한 줄로 합친다.
 *
 * <b>같은 판을 두 줄로 세우지 않는다.</b> 브라우저가 만든 번호(`id`)가 같으면 같은
 * 판이다. 둘 다 있으면 <b>기기 쪽을 쓴다</b> - 내용이 들어 있어 열 때 기다리지 않는다.
 *
 * <b>순서는 끝난 때 내림차순이다.</b> 서버도 같은 순서로 주지만, 섞고 나면 다시
 * 세워야 한다 - 기기에만 있는 판이 중간에 끼어든다.
 *
 * <b>서버 목록만 보고 "서버에 있나" 를 정하지 않는다.</b> 그 목록은 쪽을 열 때 한 번
 * 받아 둔 것이라, <b>방금 올린 판이 들어 있지 않다.</b> 올린 기록도 같이 본다 - 안
 * 그러면 올라간 판에 "이 기기에만 있음" 이 그대로 남는다(2026-10-14 로컬 확인).
 */
export function mergeRows(
  기기: ArchivedGame[],
  서버: ServerSummary[],
  올렸나: (id: string) => boolean = () => false
): GameRow[] {
  const 줄: GameRow[] = 기기.map((g) => ({
    id: g.id,
    endedAt: g.endedAt,
    mySide: g.mySide,
    levelName: g.levelName,
    result: g.result,
    moves: g.history.length - 1,
    reviewed: g.reviewed !== null,
    lastFen: g.history[g.history.length - 1]?.fen ?? null,
    local: true,
    onServer: 올렸나(g.id),
    serverId: null,
  }));
  const 자리 = new Map(줄.map((r) => [r.id, r]));

  for (const s of 서버) {
    const 이미있다 = 자리.get(s.clientId);
    if (이미있다) {
      이미있다.onServer = true;
      이미있다.serverId = s.id;
      continue;
    }
    const 새줄: GameRow = {
      id: s.clientId,
      endedAt: s.endedAt,
      mySide: s.mySide as Side,
      levelName: s.levelName,
      result: { kind: s.resultKind as ArchivedKind, winner: (s.resultWinner as Side) ?? null },
      moves: s.moves,
      reviewed: s.reviewed,
      lastFen: s.lastFen,
      local: false,
      onServer: true,
      serverId: s.id,
    };
    줄.push(새줄);
    자리.set(새줄.id, 새줄);
  }

  // 끝난 때가 같으면 번호로 가른다. 순서가 들쭉날쭉하면 쪽을 넘길 때 같은 판이 두 번
  // 보이거나 건너뛴다.
  줄.sort((a, b) => b.endedAt - a.endedAt || (a.id < b.id ? 1 : -1));
  return 줄;
}

export interface ServerGames {
  /** 로그인되어 있나. 아직 물어보는 중이면 `null` 이다. */
  loggedIn: boolean | null;
  /** 로그인하러 가는 주소. 화면은 이것을 링크로 건다(컴포넌트는 `server/` 를 모른다). */
  loginPath: string;
  /** 이 판이 서버에도 있나. 표시를 붙일지 정할 때 쓴다. */
  onServer: (id: string) => boolean;
  /** 기기와 서버를 합친 목록. 화면이 그대로 그린다. */
  rows: GameRow[];
  /**
   * 서버에만 있는 판을 받아 온다. 받은 판은 기기 목록에 들어간다.
   *
   * 기기에 있는 판에는 쓰지 않는다 - 부르는 쪽이 먼저 가린다.
   */
  pull: (serverId: number) => Promise<ArchivedGame | null>;
  /** 올리는 중. 단추를 잠그는 데 쓴다. */
  busy: boolean;
  /** 마지막으로 어긋난 일. 한국어다. */
  error: string | null;
  signOut: () => void;
  /**
   * 탈퇴. 서버의 기보가 사라진다.
   *
   * **이 기기의 기보는 안 지운다.** 서버에 둔 것만 가고, 30일 안에 다시 로그인하면
   * 돌아온다. 화면의 글이 그렇게 적혀 있어야 한다.
   */
  withdraw: () => void;
}

export function useServerGames(games: ArchivedGame[]): ServerGames {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [uploaded, setUploaded] = usePersisted<Record<string, string>>(KEY, {}, isRecord);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 앱이 뜰 때 이미 있던 판. **이것이 (ㄷ) 규칙이다** - 로그인한 뒤에 새로 둔 판만
   * 올린다. 로그인은 구글로 쪽을 옮겼다 돌아오는 일이라 앱이 다시 뜨므로, 로그인
   * 전에 둔 판은 여기 들어가 올라가지 않는다. 시각을 적어 둘 필요가 없다.
   */
  const before = useRef<Set<string> | null>(null);
  if (before.current === null) before.current = new Set(games.map((g) => g.id));

  /** 서버가 가진 목록. 로그인했을 때 한 번 받아 둔다. */
  const [서버목록, set서버목록] = useState<ServerSummary[]>([]);

  useEffect(() => {
    let 살아있다 = true;
    fetchLoginState()
      .then((yes) => {
        if (살아있다) setLoggedIn(yes);
      })
      .catch((err) => {
        // 서버가 안 뜨거나 못 닿는 때. **로그인 안 된 것으로 둔다** - 로그인 단추가
        // 보이고, 눌러 보면 그때 제대로 된 까닭을 알게 된다.
        if (살아있다) setLoggedIn(false);
        noteTrouble("로그인 상태 확인", err);
      });
    return () => {
      살아있다 = false;
    };
  }, []);

  /*
   * 로그인했으면 서버 목록을 받아 둔다.
   *
   * **올린 판을 여기서 적어 둔다.** 그러지 않으면 로그아웃했다 다시 로그인한 사람의
   * 화면에서, 서버에 있는 판이 "이 기기에만 있음" 으로 보인다 - 로그아웃이 적어 둔
   * 기록을 지우기 때문이다. 서버가 말해 주는 것이 기록보다 정확하다.
   */
  useEffect(() => {
    if (loggedIn !== true) return;
    let 살아있다 = true;
    fetchGames()
      .then((목록) => {
        if (!살아있다) return;
        set서버목록(목록);
        const 적을것: Record<string, string> = {};
        for (const s of 목록) {
          적을것[s.clientId] = `${s.moves + 1}:${s.reviewed ? 1 : 0}`;
        }
        setUploaded((before) => ({ ...before, ...적을것 }));
      })
      .catch((err) => {
        // **목록을 못 받아도 올리기는 돈다.** 받아 오는 것은 "다른 기기의 판을 보여
        // 주는" 일이라, 실패하면 이 기기의 판만 보이는 상태로 간다.
        if (살아있다) setError(noteTrouble("기보 목록 받기", err).message);
      });
    return () => {
      살아있다 = false;
    };
  }, [loggedIn, setUploaded]);

  /** 올려야 할 판. 새로 생긴 판이거나, 올린 뒤 복기가 붙은 판이다. */
  const 올릴것 = useMemo(() => {
    if (loggedIn !== true) return [];
    const 기준선 = before.current;
    return games.filter((g) => !(기준선?.has(g.id) ?? false) && uploaded[g.id] !== fingerprint(g));
  }, [games, loggedIn, uploaded]);

  /**
   * **한 번에 하나씩 올린다.** 서버가 같은 사람의 올리기가 겹치면 거절한다
   * (한도를 세는 동안 끼어들지 못하게 잠그고, 기다리지 않는다). 판이 끝나고 바로
   * 복기를 돌리면 둘이 겹칠 수 있다.
   */
  const 보내는중 = useRef(false);

  useEffect(() => {
    if (보내는중.current || 올릴것.length === 0) return;
    보내는중.current = true;
    setBusy(true);

    void (async () => {
      /*
       * **모아 두었다가 한 번에 적는다.** 한 판 올릴 때마다 적으면 그때마다 다시
       * 그려지고, 그러면 이 효과가 다시 불린다. 그런데 앞의 것이 아직 돌고 있어서
       * 새로 불린 쪽은 그냥 돌아가고, 돌던 쪽은 "그만두라" 는 신호를 받는다.
       * 그 사이에 올라간 판은 **올라갔는데 적히지 않은** 상태가 된다 - 서버에 있는데
       * 화면에는 "이 기기에만 있음" 이 남았다. 2026-10-14 에 로컬에서 그렇게 됐다.
       */
      const 적을것: Record<string, string> = {};
      let 어긋난말: string | null = null;

      try {
        for (const game of 올릴것) {
          await uploadGame(game);
          적을것[game.id] = fingerprint(game);
        }
      } catch (err) {
        // **멈춘다.** 하나가 실패하면 나머지도 같은 까닭일 때가 많다. 다음 판이
        // 끝나면 다시 해 본다 - 그때 이 판들도 같이 올라간다.
        어긋난말 = noteTrouble("기보 올리기", err).message;
      }

      if (Object.keys(적을것).length > 0) {
        setUploaded((before) => ({ ...before, ...적을것 }));
      }
      setError(어긋난말);
      보내는중.current = false;
      setBusy(false);
    })();
  }, [올릴것, setUploaded]);

  const onServer = useCallback((id: string) => uploaded[id] !== undefined, [uploaded]);

  /** 화면이 그대로 그릴 한 벌. 기기 목록과 서버 목록을 합친 것이다. */
  const rows = useMemo(() => mergeRows(games, 서버목록, onServer), [games, 서버목록, onServer]);

  /**
   * 서버에만 있는 판을 받아 온다.
   *
   * **받은 판은 이 기기의 목록에 들어간다.** 그래야 되짚기·복기·파일 저장이 기기에
   * 있던 판과 똑같이 돈다 - 서버에서 온 판만 따로 다루는 길을 만들지 않는다.
   */
  const pull = useCallback(
    async (serverId: number) => {
      setBusy(true);
      try {
        const game = await fetchGame(serverId);
        // **방금 받은 것을 "올릴 것" 으로 세지 않는다.** 지문을 같이 적어 두지 않으면
        // 받자마자 그대로 서버에 도로 올린다.
        setUploaded((before) => ({ ...before, [game.id]: fingerprint(game) }));
        setError(null);
        return game;
      } catch (err) {
        setError(noteTrouble("기보 받기", err).message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [setUploaded],
  );

  const signOut = useCallback(() => {
    setBusy(true);
    logout()
      .then(() => {
        setLoggedIn(false);
        setError(null);
        // **올린 기록을 지운다.** 다음에 다른 사람이 로그인할 수 있다 - 남의 판을
        // "서버에 있음" 으로 표시하면 거짓이다.
        setUploaded({});
        set서버목록([]);
      })
      .catch((err) => setError(noteTrouble("로그아웃", err).message))
      .finally(() => setBusy(false));
  }, [setUploaded]);

  const withdraw = useCallback(() => {
    setBusy(true);
    leave()
      .then(() => {
        setLoggedIn(false);
        setError(null);
        // 로그아웃과 같은 뒷정리다. 올린 기록이 남으면 다음 사람의 판에 "서버에 있음"
        // 이 붙는다. **기기 목록(games)은 건드리지 않는다** - 서버 것만 가는 일이다.
        setUploaded({});
        set서버목록([]);
      })
      .catch((err) => setError(noteTrouble("탈퇴", err).message))
      .finally(() => setBusy(false));
  }, [setUploaded]);

  return { loggedIn, loginPath: LOGIN_PATH, onServer, rows, pull, busy, error, signOut, withdraw };
}
