// 기보 목록(지난 판) — 모양, 넣고 바꾸기, 읽어 온 값 검사, 결과 표시, 쪽 번호
//
// 판이 끝나면 그 판을 통째로 남긴다. 끝나지 않은 판은 남기지 않는다 - 두던 중에 새 대국을
// 누르면 그 판은 사라진다. 다만 RESIGN_ON_ABANDON_PLIES 수 이상 둔 판은 기권패로 남는다.
// 기보 탭은 이 목록에서 한 판을 골라 연다 - 대국 탭의 두던 판과는 따로 든다.
//
// 저장은 브라우저(localStorage)라 크기에 한도가 있다. 복기까지 돌린 100수짜리
// 판이 4만 자 남짓이라 100판이면 한도(대개 500만 자)에 가깝다. 그래서 최근
// ARCHIVE_LIMIT 판만 두고, 그래도 넘치면 hooks/useArchive.ts 가 오래된 판부터 버린다.

import type { HistoryEntry } from "./history";
import { canDraw, hangulHistory, isHistoryEntry } from "./history";
import type { Side } from "./pieces";
import type { ReviewedMove } from "./review";
import { gradeOf } from "./review";
import type { Outcome } from "./status";

/**
 * 판이 어떻게 끝났는지.
 *
 * 끝나는 길 다섯과 '불러온 기보'(Outcome 주석) 말고 하나가 더 있다. 끝나지 않은 채
 * 저장된 파일을 불러오면 '중단' 이다.
 *
 * 앱이 스스로 '중단' 을 만들지는 않는다. 두던 판을 새 대국 때 목록에 넣던 때가 있었는데,
 * 목록이 '기보' 인 이상 거기 선 것은 다 둔 판으로 읽혀서 뺐다(지금은 오래 둔 판만 '중단' 이
 * 아니라 기권패로 넣는다 - RESIGN_ON_ABANDON_PLIES). 그래도 이 값은 남는다 -
 * 사람이 일부러 가져온 끝나지 않은 기보와, 그때 남은 판들이 아직 목록에 있다.
 */
export type ArchivedKind = Outcome["kind"] | "abandoned";

export interface ArchivedResult {
  kind: ArchivedKind;
  /** 이긴 쪽. 비겼거나 끝나지 않았으면 null */
  winner: Side | null;
}

export interface ArchivedGame {
  id: string;
  /** 끝난 때(ms). 목록은 이 순서로 선다. */
  endedAt: number;
  mySide: Side;
  levelId: string;
  /** 급수 이름. 급수 사다리가 바뀌어도 그때 이름으로 남도록 따로 적는다. */
  levelName: string;
  variant: string;
  result: ArchivedResult;
  history: HistoryEntry[];
  /** 복기를 돌렸으면 그 결과. 다시 열 때 또 돌리지 않는다. */
  reviewed: ReviewedMove[] | null;
}

export const ARCHIVE_LIMIT = 100;

/**
 * 두던 판을 '새 대국' 으로 버릴 때 기권패로 남기는 기준. 기보 길이(양쪽 수를 이어 센 수,
 * 엔진의 수와 무르기로 되감은 수도 든다)가 이만큼 이상이면 기권패로 남기고, 그보다 짧으면
 * 지금처럼 남기지 않는다.
 *
 * 지는 판을 새 대국으로 버리면 전적에서 빠져 점수가 높게 나온다(hooks/stats.ts). 그래서
 * 남긴다(2026-10-27 사용자 결정). 처음 몇 수는 급수·쪽을 잘못 골라 다시 시작하는 때라
 * 남기지 않는다. 10수는 양쪽이 다섯 수씩 둔 때다(2026-11-02 사용자 결정).
 */
export const RESIGN_ON_ABANDON_PLIES = 10;

/** 판마다 붙는 이름표. 시각과 난수를 붙여 같은 밀리초에 두 판이 생겨도 갈린다. */
export function newGameId(now = Date.now(), rand = Math.random): string {
  return now.toString(36) + "-" + Math.floor(rand() * 36 ** 4).toString(36);
}

/**
 * 판을 목록에 넣는다. 같은 id 가 있으면 바꾼다.
 *
 * 한 판이 여러 번 들어올 수 있다. 끝나는 순간 한 번, 복기를 돌리면 또 한 번,
 * 끝난 뒤 무르고 다시 두어 다르게 끝나면 또 한 번. 그때마다 새 줄이 생기면
 * 같은 판이 목록에 여럿 선다.
 */
export function upsertGame(
  list: ArchivedGame[],
  game: ArchivedGame,
  limit = ARCHIVE_LIMIT
): ArchivedGame[] {
  const rest = list.filter((g) => g.id !== game.id);
  return [game, ...rest].sort((a, b) => b.endedAt - a.endedAt).slice(0, limit);
}

/** 진 쪽이 어떻게 졌는지. 이긴 쪽은 '패' 를 '승' 으로 바꿔 읽는다. */
const HOW: Record<ArchivedKind, string> = {
  checkmate: "외통",
  stalemate: "",
  points: "점수",
  bikjang: "빅장",
  // 양쪽 한수쉼은 점수로 갈린 것이라 목록에서는 점수승·점수패로 적는다.
  passes: "점수",
  resign: "기권",
  flag: "시간",
  abandoned: "",
  record: "",
};

export interface ResultTag {
  /** "기권패", "외통승", "무승부", "중단" */
  text: string;
  tone: "win" | "lose" | "draw" | "none";
}

/**
 * 목록에 적을 승부. 늘 '내' 쪽에서 본다.
 *
 * 카카오장기의 "楚 기권패" 처럼 어떻게 끝났는지까지 붙인다. 이겼는지만 적으면
 * 목록을 훑으며 '시간에 쫓겨 진 판' 을 골라낼 수 없다.
 */
export function resultTag(game: Pick<ArchivedGame, "result" | "mySide">): ResultTag {
  const { kind, winner } = game.result;
  if (kind === "abandoned") return { text: "중단", tone: "none" };
  if (winner === null) return { text: "무승부", tone: "draw" };
  const won = winner === game.mySide;
  return { text: HOW[kind] + (won ? "승" : "패"), tone: won ? "win" : "lose" };
}

/**
 * 끝난 때를 사람 말로. "방금 전", "12분 전", "3시간 전", "어제", "8월 28일".
 * 한 해가 지나면 연도까지 적는다.
 */
export function whenLabel(endedAt: number, now = Date.now()): string {
  const min = Math.floor((now - endedAt) / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}시간 전`;

  const d = new Date(endedAt);
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "어제";
  }
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return d.getFullYear() === today.getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
}

// --- 읽어 온 값 확인 ----------------------------------------------------------
//
// 목록은 사람이 고칠 수도 있는 자리(localStorage)에서 온다. 한 판이 깨졌다고
// 목록 전체를 버리면 안 되므로, 판마다 따져서 멀쩡한 것만 남긴다.

const SIDES = ["cho", "han"];
/*
 * 받아 줄 결과 종류. 배열로 적어 두었을 때는 끝나는 길(빅장·양쪽 한수쉼)을 늘리면서
 * 여기를 빠뜨려, 그렇게 끝난 판이 새로고침하면 목록에서 사라질 뻔했다. 종류마다
 * 키를 두는 표로 두면 하나라도 빠질 때 타입 검사가 잡는다.
 */
const KIND_TABLE: Record<ArchivedKind, true> = {
  checkmate: true,
  stalemate: true,
  points: true,
  bikjang: true,
  passes: true,
  resign: true,
  flag: true,
  abandoned: true,
  record: true,
};
const KINDS = Object.keys(KIND_TABLE) as ArchivedKind[];

/**
 * 지난 판의 기보가 멀쩡한지.
 *
 * 한 칸씩 보는 잣대는 두던 판과 **같은 것**을 쓴다(history.ts 의 isHistoryEntry). 한동안
 * 여기에 따로 느슨한 검사가 있었고, 주입을 막을 때 두던 판 쪽만 고쳐서 여기만 뚫려
 * 있었다. 같은 모양을 두 군데서 따로 보면 반드시 어긋난다.
 *
 * 국면이 실제로 그려지는지는 **첫 칸과 마지막 칸만** 본다. parseFen 은 10만 번에 1초라,
 * 지난 판 100개의 모든 칸(최대 10만 칸)에 걸면 앱이 뜨는 데 1초가 더 든다. 목록은 마지막
 * 칸을 그리고(MiniBoard), 판을 열면 마지막 칸부터 보여 준다. 가운데 칸이 깨져 있으면
 * 그 수로 건너뛸 때 터지는데, 그때는 오류 경계가 받는다(ErrorBoundary).
 */
function isPlyList(v: unknown[]): boolean {
  if (!v.every(isHistoryEntry)) return false;
  const first = v[0] as HistoryEntry;
  const last = v[v.length - 1] as HistoryEntry;
  return canDraw(first.fen) && canDraw(last.fen);
}

/**
 * 화면에 그대로 찍히는 짧은 글자인지. 길이를 보는 까닭은 record.ts 의 MAX_TEXT 와 같다 -
 * 이름 하나가 10만 자면 목록이 무너지고 저장 공간이 찬다. 브라우저에 남은 값도
 * 사람이 직접 고칠 수 있으니 파일과 똑같이 본다.
 */
const MAX_TEXT = 60;
const isShortText = (v: unknown): v is string =>
  typeof v === "string" && v.length <= MAX_TEXT;

export function isArchivedGame(v: unknown): v is ArchivedGame {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  const r = g.result as Record<string, unknown> | null;
  return (
    isShortText(g.id) &&
    typeof g.endedAt === "number" &&
    SIDES.includes(g.mySide as string) &&
    isShortText(g.levelId) &&
    isShortText(g.levelName) &&
    isShortText(g.variant) &&
    typeof r === "object" &&
    r !== null &&
    KINDS.includes(r.kind as ArchivedKind) &&
    (r.winner === null || SIDES.includes(r.winner as string)) &&
    Array.isArray(g.history) &&
    g.history.length >= 2 &&
    g.history.length <= 1000 &&
    isPlyList(g.history) &&
    (g.reviewed === null || Array.isArray(g.reviewed))
  );
}

/**
 * 읽어 온 목록에서 멀쩡한 판만 새 순서로. 목록 모양조차 아니면 빈 목록.
 *
 * 예전 판을 지금 모양으로 고쳐 읽는 것이 셋 있다.
 * - 지금 잣대로 매기지 않은 복기는 '복기 전' 으로 되돌린다(isCurrentReview).
 * - 한자로 적힌 기보 표기(73卒63)는 한글(73졸63)로 바꾼다(history.ts 의 hangulHistory).
 * - 등급은 저장된 글자를 믿지 않고 승률 하락에서 다시 매긴다(아래).
 */
export function readArchive(v: unknown): ArchivedGame[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isArchivedGame)
    .map((g) => {
      const reviewed = isCurrentReview(g.reviewed, g.history.length - 1)
        ? g.reviewed.map(regrade)
        : null;
      return { ...g, history: hangulHistory(g.history), reviewed };
    })
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, ARCHIVE_LIMIT);
}

/**
 * 등급을 저장된 글자가 아니라 승률 하락에서 다시 매긴다.
 *
 * 등급 칸이 늘고 줄기 때문이다. 다섯이던 때의 복기에는 `mistake`(실수)가 들어 있는데,
 * 지금 표에는 그 칸이 없어서 그대로 읽으면 이름도 색도 비어 나온다. 승률 하락(winDrop)은
 * 그때나 지금이나 같은 값이라, 그 값으로 다시 매기면 예전 복기도 지금 잣대로 읽힌다.
 *
 * 최선수 여부는 따로 저장하지 않는다 - 저장된 등급이 `best` 면 그때 엔진과 같은 수였다.
 */
function regrade(r: ReviewedMove): ReviewedMove {
  return { ...r, grade: gradeOf(r.winDrop, r.grade === "best") };
}

/**
 * 이 복기를 그대로 보여 줘도 되는지. 아니면 그 판은 '복기 전' 으로 읽어 다시 돌리게 한다.
 *
 * - 수보다 결과가 적은 복기: 중간에 멈춘 복기가 그대로 저장되던 때(2945fdb 까지)의 것이다.
 *   두면 '복기함' 이 붙은 채 빈 성적이 뜬다.
 * - 승률 하락(winDrop)이 없는 복기: 상대 급수에 맞춰 눈높이를 바꿔 가며 점수로 등급을 매기던
 *   때의 것이다. 등급을 지금 잣대로 다시 매기면 그 등급을 두고 쓴 설명("손해는 없습니다")과
 *   어긋나서, 고쳐 읽지 않고 다시 돌리게 한다. 한자 표기·한 덩어리 설명이던 복기도 여기 든다.
 */
function isCurrentReview(reviewed: ReviewedMove[] | null, moves: number): reviewed is ReviewedMove[] {
  return (
    reviewed !== null &&
    reviewed.length === moves &&
    reviewed.every((r) => typeof r.winDrop === "number")
  );
}

/**
 * 기보 목록 아래의 쪽 번호. 0 부터 센 쪽 번호와 줄임표("gap")를 늘어놓는다.
 *
 * 쪽이 일곱 이하면 다 보인다. 그보다 많으면 처음·끝과 지금 쪽 앞뒤 하나씩만
 * 두고 사이를 줄임표로 접는다(1 … 4 5 6 … 9). 줄임표가 쪽 하나만 가리게
 * 되면 줄임표 대신 그 쪽을 그냥 보인다 - "1 … 3" 보다 "1 2 3" 이 짧다.
 * 칸 수가 일곱으로 늘 같아서 쪽을 넘겨도 번호 줄의 폭이 흔들리지 않는다.
 */
export function pageItems(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const run = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  // 앞쪽 끝 가까이면 앞 다섯, 뒤쪽 끝 가까이면 뒤 다섯을 붙여 보인다.
  if (current <= 3) return [...run(0, 4), "gap", total - 1];
  if (current >= total - 4) return [0, "gap", ...run(total - 5, total - 1)];
  return [0, "gap", current - 1, current, current + 1, "gap", total - 1];
}
