// 내 전적과 실력 점수 - 서버에 올라간 판으로 계산한다
//
// **훅이 아니라 순수 함수다.** 서버 목록(server/)·이 기기의 기보(janggi/)·급수 기준 점수
// (engine/)를 같이 써야 해서 셋을 다 볼 수 있는 이 폴더에 둔다. janggi/ 는 엔진을 모르고,
// engine/ 은 기보를 모른다. 화면은 나중에 훅을 거쳐 이 결과를 그대로 그린다.
//
// **서버에 올라간 판만 센다.** 로그인 전에 둔 판은 서버에 안 올라간다. 그 판까지 세면
// 기기마다 점수가 달라진다. 서버에 있는 판만 세면 어느 기기에서나 같다(2026-10-27 사용자
// 결정). 그래서 **서버 목록을 못 받았으면 계산하지 않는다** - 이 기기의 판만으로 낸 숫자는
// 진짜 점수처럼 보이지만 아니다.
//
// 결과 모양(PlayerStats)은 서버가 계산해 JSON 으로 내려 주는 경우에도 그대로 쓸 수 있게
// 칸 이름과 값만으로 두었다. 다른 기기에서만 복기한 판까지 세야 할 날 계산을 서버로 옮겨도
// 화면은 바뀌지 않는다. 그 길을 지금 고르지 않은 까닭은 docs/DECISIONS.md 에 있다.
//
// **점수는 저장하지 않는다.** 볼 때마다 처음부터 다시 센다. 같은 기보면 언제나 같은 점수다.
// 판을 지우면 다음에 볼 때 그 판 없이 다시 계산된다.

import type { ArchivedGame, ArchivedKind } from "../janggi/archive";
import type { Side } from "../janggi/pieces";
import { accuracyOf } from "../janggi/review";
import { nearestLevelId, ratingOf, START_RATING } from "../engine/ratings";
import { LEVELS } from "../engine/levels";
import type { ServerSummary } from "../server/api";

/**
 * 화면에 보이는 점수 = 계산한 점수 + 이 값.
 *
 * 18급의 기준 점수가 -13 이라 그대로 보이면 음수가 나온다. 더하는 수는 계산에 영향이 없다
 * (2026-10-27 사용자 결정: 18급 987, 12급 1316, 9단 3883).
 */
export const SHOWN_OFFSET = 1000;

/**
 * 한 판에 점수가 움직이는 크기(Elo 의 K). 처음 몇 판은 크게, 그 뒤로는 작게.
 *
 * node 로 2,000번 모의해 골랐다. 실제 실력이 9급인 사람이 12급 점수에서 시작해 9급과 계속
 * 두면, 급 한 칸(55점) 안에 처음 드는 판이 K=20 만 31판, K=40 만 14판, 처음 10판 40 뒤 20 이
 * 18판이었다. 30판 뒤 흔들림(10%~90%)은 각각 98점, 154점, 114점이다.
 */
export const K_EARLY = 40;
export const K_LATER = 20;
/** 처음 이만큼은 K_EARLY 로 센다. */
export const EARLY_GAMES = 10;

/**
 * 점수에 세는 결과. 표로 두어 결과 종류가 늘면 타입 검사가 여기를 가리킨다.
 *
 * - 끝나는 일곱 가지는 센다. 기권도 진 판이다 - 대국 중 '새 대국' 을 누르면 판이 남지
 *   않으므로 기권은 일부러 한 것이다.
 * - 불러온 기보(record)는 뺀다. 상대 급수가 파일에 적힌 값이라 믿을 수 없고, 끝난 때가
 *   불러온 시각이다.
 * - 안 끝난 판(abandoned)은 뺀다.
 */
const COUNTED: Record<ArchivedKind, boolean> = {
  checkmate: true,
  stalemate: true,
  points: true,
  bikjang: true,
  passes: true,
  resign: true,
  flag: true,
  record: false,
  abandoned: false,
};

/**
 * 실수가 몇 수째에 났는지 나누는 구간. 수 번호는 양쪽 수를 이어 센 번호(1부터)다.
 * `to` 가 `null` 이면 끝까지.
 */
export const PHASES: readonly { from: number; to: number | null }[] = [
  { from: 1, to: 20 },
  { from: 21, to: 60 },
  { from: 61, to: null },
];

/** 셀 판 하나. 서버 목록 한 줄과 이 기기의 판에서 같은 모양으로 뽑는다. */
interface CountedGame {
  clientId: string;
  endedAt: number;
  mySide: Side;
  levelId: string;
  /** 1 이김 · 0.5 비김 · 0 짐 */
  score: number;
}

export interface RatingPoint {
  clientId: string;
  endedAt: number;
  levelId: string;
  /** 이 판을 센 뒤의 점수. 화면에 보이는 숫자(SHOWN_OFFSET 을 더하고 반올림)다. */
  value: number;
}

export interface Rating {
  /** 지금 점수. 화면에 보이는 숫자다. */
  value: number;
  /** 지금 점수에 가장 가까운 급수. "9급과 비슷" 처럼 적는 데 쓴다. */
  nearestLevelId: string;
  /** 판마다 점수. 오래된 판부터. 길이가 센 판 수다. */
  history: RatingPoint[];
}

/** 급수별 전적. **퍼센트로 나누지 않는다** - "1판 1승" 이 "100%" 로 보이지 않게 화면이 정한다. */
export interface LevelRecord {
  levelId: string;
  levelName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
}

export interface AccuracyPoint {
  clientId: string;
  endedAt: number;
  levelId: string;
  /** 0~100. review.ts 의 accuracyOf 그대로. 소수점은 화면에서 버린다. */
  value: number;
}

export interface PhaseCount {
  from: number;
  to: number | null;
  blunders: number;
  inaccuracies: number;
  /** 이 구간에서 내가 둔 수. 0 이면 이 구간까지 판이 가지 않았다. */
  myMoves: number;
}

export interface MistakeCount {
  clientId: string;
  endedAt: number;
  levelId: string;
  /** 큰 실수 */
  blunders: number;
  /** 아쉬운 수 */
  inaccuracies: number;
  myMoves: number;
  byPhase: PhaseCount[];
}

export interface PlayerStats {
  /** 점수에 센 판 수 */
  counted: number;
  /** 센 판이 없으면 `null`. 처음 점수로 채우지 않는다. */
  rating: Rating | null;
  /** 사다리 순서(약한 급수부터). 둔 급수만. */
  byLevel: LevelRecord[];
  /** 복기한 판만. 오래된 판부터. */
  accuracy: AccuracyPoint[];
  /** 복기한 판 중 내가 둔 수가 있는 판만(정확도와 같은 판). 오래된 판부터. */
  mistakes: MistakeCount[];
}

/**
 * 계산 결과. 셀 수 없을 때는 숫자 대신 그 까닭을 준다.
 *
 * - `no-server-list`: 서버 목록을 못 받았다(아직 받는 중이거나 실패). 이 기기의 판만으로
 *   점수를 내지 않는다. 판이 0개인 것(`ok` 이고 `counted: 0`)과 다르다.
 */
export type StatsResult =
  | { status: "ok"; stats: PlayerStats }
  | { status: "no-server-list" };

export interface StatsInput {
  /**
   * 서버 목록(`GET /games`). **못 받았으면 `null`** 이다 - 빈 목록(`[]`)은 "서버에 판이
   * 없다" 는 뜻이라 둘을 섞으면 실패가 0판으로 보인다.
   */
  server: readonly ServerSummary[] | null;
  /** 이 기기의 기보. 복기 내용은 여기에만 있다. */
  local: readonly ArchivedGame[];
  /**
   * 이 기기의 판이 서버에 올라갔나(useServerGames 의 `onServer`). 방금 올린 판은 서버
   * 목록을 다시 받기 전까지 거기 없어서 이것으로 센다.
   */
  uploaded: (clientId: string) => boolean;
}

const isSide = (v: string | null): v is Side => v === "cho" || v === "han";

/** 결과를 이 판의 점수(1·0.5·0)로. 셀 판이 아니면 `null`. */
function countable(
  clientId: string,
  endedAt: number,
  mySide: string,
  levelId: string,
  kind: string,
  winner: string | null
): CountedGame | null {
  if (!Object.hasOwn(COUNTED, kind) || !COUNTED[kind as ArchivedKind]) return null;
  if (!isSide(mySide) || ratingOf(levelId) === null) return null;
  if (winner !== null && !isSide(winner)) return null;
  const score = winner === null ? 0.5 : winner === mySide ? 1 : 0;
  return { clientId, endedAt, mySide, levelId, score };
}

/**
 * 셀 판을 모은다. 서버 목록과 이 기기의 올린 판을 합치고, 같은 판(같은 clientId)은 하나로.
 * 둘 다 있으면 이 기기 쪽을 쓴다 - 서버 목록은 쪽을 열 때 받아 둔 것이라 더 오래됐을 수 있다.
 *
 * 순서는 끝난 때, 같으면 clientId. 끝난 때는 브라우저 시각이라 기기 시계가 틀리면 순서가
 * 틀린다 - 점수가 몇 점 달라질 뿐 계산이 깨지지는 않는다.
 */
function collect(server: readonly ServerSummary[], input: StatsInput): CountedGame[] {
  const byId = new Map<string, CountedGame | null>();
  for (const s of server) {
    byId.set(
      s.clientId,
      countable(s.clientId, s.endedAt, s.mySide, s.levelId, s.resultKind, s.resultWinner)
    );
  }
  for (const g of input.local) {
    if (!input.uploaded(g.id) && !byId.has(g.id)) continue;
    byId.set(
      g.id,
      countable(g.id, g.endedAt, g.mySide, g.levelId, g.result.kind, g.result.winner)
    );
  }
  return [...byId.values()]
    .filter((g): g is CountedGame => g !== null)
    .sort((a, b) => a.endedAt - b.endedAt || (a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0));
}

/** Elo. AI 의 점수는 고정이고 내 점수만 움직인다. */
function rate(games: CountedGame[]): Rating | null {
  if (games.length === 0) return null;
  let r = START_RATING;
  const history: RatingPoint[] = games.map((g, i) => {
    const ai = ratingOf(g.levelId)!;
    const expected = 1 / (1 + 10 ** ((ai - r) / 400));
    const k = i < EARLY_GAMES ? K_EARLY : K_LATER;
    r += k * (g.score - expected);
    return { clientId: g.clientId, endedAt: g.endedAt, levelId: g.levelId, value: Math.round(r + SHOWN_OFFSET) };
  });
  return { value: Math.round(r + SHOWN_OFFSET), nearestLevelId: nearestLevelId(r), history };
}

function byLevel(games: CountedGame[]): LevelRecord[] {
  return LEVELS.flatMap((l) => {
    const mine = games.filter((g) => g.levelId === l.id);
    if (mine.length === 0) return [];
    return [{
      levelId: l.id,
      levelName: l.name,
      played: mine.length,
      won: mine.filter((g) => g.score === 1).length,
      drawn: mine.filter((g) => g.score === 0.5).length,
      lost: mine.filter((g) => g.score === 0).length,
    }];
  });
}

function mistakesOf(game: CountedGame, local: ArchivedGame): MistakeCount {
  const mine = local.reviewed!.filter((r) => r.mover === game.mySide);
  const count = (rows: typeof mine) => ({
    blunders: rows.filter((r) => r.grade === "blunder").length,
    inaccuracies: rows.filter((r) => r.grade === "inaccuracy").length,
    myMoves: rows.length,
  });
  return {
    clientId: game.clientId,
    endedAt: game.endedAt,
    levelId: game.levelId,
    ...count(mine),
    byPhase: PHASES.map((p) => ({
      ...p,
      ...count(mine.filter((r) => r.index >= p.from && (p.to === null || r.index <= p.to))),
    })),
  };
}

/**
 * 전적 화면에 보일 숫자를 한 번에 낸다.
 *
 * 정확도와 실수 횟수는 **점수에 센 판 중에서 이 기기에 복기가 있고 내가 둔 수가 그
 * 복기에 있는 판**으로만 낸다. 서버 목록에는 "복기했나" 만 있고 내용이 없어서, 다른
 * 기기에서만 복기한 판은 빠진다(사용자가 받아들인 것). 점수에 안 세는 판(불러온 기보 등)은
 * 복기가 있어도 넣지 않는다 - 한 화면의 숫자가 모두 같은 판 묶음에서 나와야 서로 견줄 수
 * 있다. 내가 둔 수가 없는 판은 둘 다에서 뺀다 - "큰 실수 0회" 로 넣으면 표본 0 이 0 으로 보인다.
 */
export function computeStats(input: StatsInput): StatsResult {
  if (input.server === null) return { status: "no-server-list" };
  const games = collect(input.server, input);
  const localById = new Map(input.local.map((g) => [g.id, g]));
  const reviewed = games.flatMap((g) => {
    const local = localById.get(g.clientId);
    if (!local?.reviewed) return [];
    const value = accuracyOf(local.reviewed, g.mySide);
    return value === null ? [] : [{ game: g, local, value }];
  });

  return {
    status: "ok",
    stats: {
      counted: games.length,
      rating: rate(games),
      byLevel: byLevel(games),
      accuracy: reviewed.map(({ game, value }) => ({
        clientId: game.clientId, endedAt: game.endedAt, levelId: game.levelId, value,
      })),
      mistakes: reviewed.map(({ game, local }) => mistakesOf(game, local)),
    },
  };
}
