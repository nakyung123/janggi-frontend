// 우리 서버와 말하는 유일한 자리 - 로그인 상태 · 기보 올리기 · 로그아웃
//
// 주소를 `/api/` 로 시작하는 까닭은 CSP 의 `connect-src 'self'` 다. 그 뒤는 이 앱이
// 아니라 기보·측정 서버이고, 배포본에서는 `vercel.json` 의 되돌림이, 로컬에서는
// `vite.config.ts` 의 proxy 가 넘긴다. 둘 중 하나라도 빠지면 그쪽에서만 안 간다.
// `src/report/events.ts` 와 같은 길이다.

import type { ArchivedGame } from "../janggi/archive";
import { isArchivedGame } from "../janggi/archive";

const BASE = "/api";

/**
 * 답을 얼마나 기다리나.
 *
 * 서버는 쉬다 깨어나는 데 몇 초 걸린다(무료 한도라 늘 깨어 있게 두지 않는다).
 * 기다리지 않으면 **첫 올리기가 거의 늘 실패**한다.
 */
const TIMEOUT = 20_000;

/**
 * CSRF 토큰. 서버가 쿠키로 주고, 우리가 머리글로 되돌려 줘야 쓰기가 통한다. 읽을 수
 * 있는 쿠키다(HttpOnly 가 아니다) - 그래야 이 일이 된다.
 *
 * **토큰 없이 보내면 404 가 온다.** 서버가 거절을 404 로 바꾸기 때문에 "그런 주소가
 * 없다" 처럼 보인다. 서버 쪽 검사를 만들 때 그걸로 한참 헤맸다.
 */
const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";

/**
 * 로그인하러 가는 주소.
 *
 * **fetch 로는 안 된다.** 구글 동의 화면을 사람이 봐야 하므로 쪽 전체가 옮겨갔다
 * 돌아온다. 그래서 단추가 아니라 링크로 둔다.
 */
export const LOGIN_PATH = `${BASE}/oauth2/authorization/google`;

/** 서버가 거절했다. `message` 는 서버가 준 한국어 설명이다. */
export class ServerError extends Error {}

function csrfToken(): string | null {
  // "a=1; b=2" 에서 찾는다. 토큰 값에 '=' 가 들어갈 수 있어 첫 '=' 에서만 끊는다.
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === CSRF_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return null;
}

/** 서버가 준 까닭. 화면에 그대로 내보낼 수 있게 **한국어로만** 돌려준다. */
async function reason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail) return body.detail;
  } catch {
    // 본문이 JSON 이 아닐 수 있다. 그때는 아래 한 줄로 답한다.
  }
  return `서버가 받지 않았습니다. (${res.status})`;
}

function read(path: string): Promise<Response> {
  return fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT) });
}

/**
 * 쓰기. 토큰이 없으면 읽기를 한 번 해서 받아 온다.
 *
 * 첫 쓰기가 바로 올 수 있다 - 쪽을 열고 바로 한 판 끝내는 경우다. 그때 토큰이 없으면
 * 그 한 번이 영문도 모르고 404 가 된다.
 */
async function write(path: string, body?: unknown, method = "POST"): Promise<Response> {
  let token = csrfToken();
  if (!token) {
    await read("/me").catch(() => undefined);
    token = csrfToken();
  }

  const headers: Record<string, string> = {};
  if (token) headers[CSRF_HEADER] = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  return fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
}

/** 지금 로그인되어 있나. 이 주소는 로그인하지 않아도 열린다 - 거절이 아니라 false 로 답한다. */
export async function fetchLoginState(): Promise<boolean> {
  const res = await read("/me");
  if (!res.ok) throw new ServerError(await reason(res));
  const body = (await res.json()) as { loggedIn?: unknown };
  return body.loggedIn === true;
}

/**
 * 판 하나를 올린다. 같은 판 번호면 서버가 덮어쓴다 - 복기를 돌린 뒤 다시 올리는 길이다.
 *
 * **판을 그대로 보낸다.** `ArchivedGame` 의 칸 이름이 서버가 받는 이름과 같게 맞춰져
 * 있다. 다만 서버는 **모르는 칸을 조용히 버리므로**, 여기에 칸을 하나 더하는 날
 * 서버 쪽(`GameUpload`)도 같이 고쳐야 한다. 판의 내용(`history`·`reviewed`)은 모양을
 * 보지 않고 통째로 보관하므로 그쪽은 괜찮다.
 *
 * @returns 서버가 매긴 번호
 */
export async function uploadGame(game: ArchivedGame): Promise<number> {
  const res = await write("/games", game);
  if (res.status === 404) {
    // 로그인이 풀렸거나 토큰이 없다. 서버는 둘을 가르지 않는다(가르면 "거기 뭔가
    // 있다" 를 알려주는 셈이다).
    throw new ServerError("로그인이 풀려 기보를 올리지 못했습니다.");
  }
  if (!res.ok) throw new ServerError(await reason(res));
  const body = (await res.json()) as { id?: unknown };
  if (typeof body.id !== "number") throw new ServerError("서버가 번호를 주지 않았습니다.");
  return body.id;
}

/**
 * 서버가 주는 목록 한 줄.
 *
 * **판의 내용이 없다.** 끝났을 때의 판(`lastFen`) 하나만 온다 - 목록 카드의 작은
 * 그림에 필요한 것이 그것뿐이고, 내용까지 실으면 스무 판에 수백 KB가 오간다. 한 판을
 * 열 때 {@link fetchGame} 으로 그때 받아 온다.
 */
export interface ServerSummary {
  /** 서버가 매긴 번호. 한 판을 열 때 쓴다. */
  id: number;
  /** 브라우저가 만든 번호. 기기에 있는 판과 같은 판인지 이것으로 가른다. */
  clientId: string;
  endedAt: number;
  mySide: string;
  levelId: string;
  levelName: string;
  variant: string;
  resultKind: string;
  resultWinner: string | null;
  moves: number;
  reviewed: boolean;
  lastFen: string | null;
}

/**
 * 서버가 한 사람에게 받아 두는 기보 수. 넘으면 올리기를 거절하고, 목록도 이만큼까지만 준다.
 * 백엔드 `GameStore.한도` 와 같은 값이다 - 거기를 바꾸면 여기도 바꾼다. 전적 화면이 "다
 * 찼다" 를 알리는 데 쓴다(그 뒤 판은 서버에 없어 점수에 안 들어간다).
 */
export const SERVER_GAME_LIMIT = 500;

/** 내 기보 목록. 서버가 끝난 순서로 준다. */
export async function fetchGames(): Promise<ServerSummary[]> {
  const res = await read("/games");
  if (res.status === 404) throw new ServerError("로그인이 풀려 기보를 받지 못했습니다.");
  if (!res.ok) throw new ServerError(await reason(res));
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new ServerError("서버가 목록을 주지 않았습니다.");
  return body as ServerSummary[];
}

/**
 * 한 판의 내용.
 *
 * **기기에 없는 판을 열 때만 부른다.** 기기에 있으면 그것을 쓴다 - 같은 것을 또 받을
 * 까닭이 없고, 받는 동안 기다리게 된다.
 */
export async function fetchGame(id: number): Promise<ArchivedGame> {
  const res = await read(`/games/${id}`);
  if (res.status === 404) throw new ServerError("그 기보를 찾지 못했습니다.");
  if (!res.ok) throw new ServerError(await reason(res));
  const 받은것 = (await res.json()) as Record<string, unknown>;

  /*
   * **서버의 모양을 기기의 모양으로 되돌린다.** 서버는 결과를 두 칸으로 펴서
   * 두는데(`resultKind`·`resultWinner`), 기기 쪽은 `result` 한 덩이다. 올릴 때 편
   * 것을 여기서 다시 묶는다.
   *
   * 번호도 바꿔 끼운다. 서버 번호가 아니라 **브라우저가 만든 번호**라야 기기에 있는
   * 같은 판과 한 줄로 합쳐진다.
   */
  const game = {
    id: 받은것.clientId,
    endedAt: 받은것.endedAt,
    mySide: 받은것.mySide,
    levelId: 받은것.levelId,
    levelName: 받은것.levelName,
    variant: 받은것.variant,
    result: { kind: 받은것.resultKind, winner: 받은것.resultWinner ?? null },
    history: 받은것.history,
    reviewed: 받은것.reviewed ?? null,
  };

  // 받은 것을 믿지 않는다. 모양이 아니면 여기서 멈춘다 - 반쪽짜리 판을 화면에 올리면
  // 되짚기가 빈 판을 그린다.
  if (!isArchivedGame(game)) throw new ServerError("기보 모양이 올바르지 않습니다.");
  return game;
}

/** 로그아웃. 서버가 쿠키를 지운다. */
export async function logout(): Promise<void> {
  const res = await write("/logout");
  if (!res.ok) throw new ServerError(await reason(res));
}

/**
 * 탈퇴. 서버의 기보가 사라지고 쿠키가 지워진다.
 *
 * **이 기기의 기보는 건드리지 않는다.** 서버에 둔 것만 간다. 부르는 쪽이 지우지 않게
 * 여기 적어 둔다 - 로그아웃과 달라 보여서 "다 지우는 것" 으로 읽기 쉽다.
 *
 * 서버는 줄을 바로 지우지 않고 탈퇴한 때만 찍는다. 30일 안에 다시 로그인하면 기보가
 * 돌아온다. 화면의 글도 그렇게 적혀 있어야 한다.
 */
export async function withdraw(): Promise<void> {
  const res = await write("/me", undefined, "DELETE");
  // 404 는 이미 탈퇴했거나 쿠키가 낡은 것이다. 쓰는 사람이 할 일은 같다 - 다시
  // 로그인하는 것이고, 지금 상태로는 어차피 로그인이 풀려 있다.
  if (!res.ok) throw new ServerError(await reason(res));
}
