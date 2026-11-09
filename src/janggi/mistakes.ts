// 내 실수 문제 - 복기한 판에서 내가 둔 큰 실수 자리를 모으고, 그 자리에서 둔 수를 판정한다
//
// 문제는 이 기기의 기보 목록(archive.ts)에서 그때그때 만든다. 저장하지 않는다 - 판이 목록에서 빠지면
// (100판 한도) 그 판의 문제도 같이 빠진다.
//
// **어느 자리를 내나.** 기보 탭의 [이 수 전부터 다시 두기]와 같은 잣대(review.ts 의 canPracticeFrom):
// 내가 둔 수이고 등급이 큰 실수. 아쉬운 수는 내지 않는다(거의 매 수가 문제가 된다). 불러온 기보는
// 내지 않는다 - 불러올 때 내 쪽을 짐작하므로(record.ts) 남이 둔 판일 수 있다.
//
// **무엇이 정답인가(2026-11-09 사용자 결정).** 한 자리에 AI 의 수만큼 좋은 수가 여럿인 일이 잦다
// (엔진끼리 둔 20판의 큰 실수 45곳 중 16곳). 그래서 복기의 등급 잣대를 그대로 쓴다.
//   복기에 적힌 AI 의 수      → 맞음. 엔진을 기다리지 않는다(기보 탭 복기와 말이 어긋나지 않게)
//   그때 둔 수                → 틀림. 엔진을 기다리지 않는다
//   그 밖                     → 엔진이 두 국면(문제 국면, 둔 뒤 국면)을 같은 탐색량으로 재서,
//                               둔 쪽 승률이 떨어진 폭이 gradeOf 의 "좋은 수" 면 맞음
// 두 국면을 같은 탐색량으로 재는 까닭은 runReview 주석과 같다. 복기에 적힌 점수는 수마다 깊이가
// 달라(1차·2차) 섞지 않는다.

import type { ArchivedGame, ArchivedResult } from "./archive";
import type { HistoryEntry } from "./history";
import { movesOf } from "./history";
import { splitMove } from "./notation";
import type { Side } from "./pieces";
import type { MoveGrade } from "./review";
import { canPracticeFrom, clampScore, gradeOf, winPercent, winChance } from "./review";

/** 문제 하나. 기보 목록의 한 판, 그 판의 한 수다. */
export interface Mistake {
  /** `<판 id>:<수 번호>`. 화면 안에서만 쓴다(저장하지 않는다). */
  id: string;
  gameId: string;
  /** 그 판 기보에서 큰 실수가 만든 국면의 번호(ReviewedMove.index). 문제 국면은 그 앞 칸이다. */
  index: number;
  /** 내가 둔 수만 센 번호. "12번째 수". 연습 칸(usePractice 의 nth)과 같은 셈이다. */
  nth: number;
  mySide: Side;
  /** 그 판을 둔 규칙. 엔진에 이 규칙으로 묻는다. */
  variant: string;
  /** 엔진에 넘길 시작 국면과 문제 국면까지의 수순. 수순을 통째로 넘겨야 같은 수 되풀이·빅장 판정이 원래 판과 같다. */
  startFen: string;
  moves: string[];
  /** 문제 국면(큰 실수를 두기 직전) */
  fen: string;
  /** 그때 둔 수(엔진 좌표)와 기보 표기 */
  played: string;
  playedNotation: string;
  /** 복기에 적힌 AI 의 수와 기보 표기 */
  best: string;
  bestNotation: string;
}

/** 목록의 카드 하나. 판 하나와 그 판에서 나온 문제들(수 순서). */
export interface MistakeGroup {
  gameId: string;
  endedAt: number;
  levelName: string;
  mySide: Side;
  result: ArchivedResult;
  mistakes: Mistake[];
}

export interface MistakeList {
  /** 최근 판부터. 문제가 없는 판은 들지 않는다. */
  groups: MistakeGroup[];
  /** 문제를 낼 수 있는 판(이 앱에서 둔 판) 가운데 복기한 판의 수. 빈 목록 글이 고른다. */
  reviewedGames: number;
}

/** 불러온 기보. 내 쪽이 짐작이라 내 실수를 가려낼 수 없다. */
const isLoaded = (g: ArchivedGame) => g.result.kind === "record" || g.result.kind === "abandoned";

const isPass = (move: string) => {
  const { from, to } = splitMove(move);
  return from === to;
};

/** 같은 국면인지 가리는 열쇠. FEN 의 판 + 둘 차례(외통 문제 id 와 같은 기준, 수 세기 칸은 뺀다). */
const positionKey = (fen: string) => fen.split(" ").slice(0, 2).join(" ");

/**
 * 기보 목록에서 문제를 고른다. games 는 최근 판부터 놓여 있다(readArchive). 같은 국면이 여러 판에
 * 있으면 가장 최근 판의 것 하나만 낸다.
 *
 * AI 의 수가 한수쉼인 자리는 내지 않는다. 이 화면에 한수쉼 단추가 없다.
 */
export function mistakesOf(games: readonly ArchivedGame[]): MistakeList {
  const seen = new Set<string>();
  const groups: MistakeGroup[] = [];
  let reviewedGames = 0;

  const ordered = [...games].sort((a, b) => b.endedAt - a.endedAt);
  for (const g of ordered) {
    if (isLoaded(g) || g.reviewed === null) continue;
    reviewedGames += 1;

    const mistakes: Mistake[] = [];
    for (const r of g.reviewed) {
      if (!canPracticeFrom(r, g.mySide) || !r.best || isPass(r.best)) continue;
      const before: HistoryEntry | undefined = g.history[r.index - 1];
      const after: HistoryEntry | undefined = g.history[r.index];
      // 복기와 기보가 어긋나면(손으로 고친 값 등) 내지 않는다. 엉뚱한 국면에 엉뚱한 답이 선다.
      if (!before || after?.move !== r.played) continue;
      const key = positionKey(before.fen);
      if (seen.has(key)) continue;
      seen.add(key);

      const history = g.history.slice(0, r.index);
      mistakes.push({
        id: `${g.id}:${r.index}`,
        gameId: g.id,
        index: r.index,
        nth: g.history.slice(1, r.index + 1).filter((h) => h.mover === g.mySide).length,
        mySide: g.mySide,
        variant: g.variant,
        startFen: g.history[0].fen,
        moves: movesOf(history),
        fen: before.fen,
        played: r.played,
        playedNotation: r.playedNotation,
        best: r.best,
        bestNotation: r.bestNotation ?? r.best,
      });
    }
    if (mistakes.length === 0) continue;
    groups.push({
      gameId: g.id,
      endedAt: g.endedAt,
      levelName: g.levelName,
      mySide: g.mySide,
      result: g.result,
      mistakes,
    });
  }
  return { groups, reviewedGames };
}

/** 목록 순서(최근 판부터, 판 안에서는 수 순서)로 편 문제 전부. 다음 문제를 고를 때 쓴다. */
export const flatMistakes = (list: MistakeList): Mistake[] => list.groups.flatMap((g) => g.mistakes);

// --- 판정 ------------------------------------------------------------------------

/** 엔진이 잰 두 국면의 점수(초 기준, 엔진이 낸 그대로). 판정이 자른다(clampScore). */
export interface Look {
  score: number;
  mate: number | null;
}

export type Verdict =
  /** 복기에 적힌 AI 의 수와 같다 */
  | { kind: "best" }
  /** 그때 둔 수와 같다 */
  | { kind: "again" }
  /**
   * 엔진이 잰 수. grade 가 "good" 이면 맞음이다. before·after 는 둔 쪽 승률(%, 정수) - 복기 카드의
   * "한 35% → 27%" 와 같은 값이다.
   */
  | { kind: "measured"; grade: Exclude<MoveGrade, "best">; before: number; after: number };

/** 맞음인지. 좋은 수까지 맞음으로 센다. */
export const isRight = (v: Verdict): boolean =>
  v.kind === "best" || (v.kind === "measured" && v.grade === "good");

/** 엔진을 기다리지 않고 판정할 수 있는 수면 그 판정. 아니면 null(엔진이 재야 한다). */
export function quickVerdict(m: Mistake, move: string): Verdict | null {
  if (move === m.best) return { kind: "best" };
  if (move === m.played) return { kind: "again" };
  return null;
}

/** 둔 쪽에서 본 승률(%). winPercent 는 초의 것이라 한은 100 에서 뺀다. */
const percentFor = (side: Side, score: number) => (side === "cho" ? winPercent(score) : 100 - winPercent(score));

/**
 * 문제 국면(before)과 내 수를 둔 국면(after)의 점수로 판정한다. 둘은 같은 탐색량으로 잰 것이어야 한다.
 * 승률이 오른 수는 떨어진 폭 0 이다(review.ts 의 reviewMove 와 같다).
 */
export function measuredVerdict(side: Side, before: Look, after: Look): Verdict {
  const b = clampScore(before.score, before.mate);
  const a = clampScore(after.score, after.mate);
  const choDrop = winChance(b) - winChance(a);
  const drop = Math.max(0, side === "cho" ? choDrop : -choDrop);
  const grade = gradeOf(drop, false) as Exclude<MoveGrade, "best">;
  return { kind: "measured", grade, before: percentFor(side, b), after: percentFor(side, a) };
}
