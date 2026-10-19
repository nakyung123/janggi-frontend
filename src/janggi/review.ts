// 복기 — 어디다 두는 게 좋았는지 가려내고 그 이유를 적는다
//
// 설명은 전부 엔진에서 나온 사실만 엮어서 만든다. 쓰는 재료는 네 가지다.
//   · 엔진이 고른 최선수와 그 이후 수순
//   · 실제로 둔 수
//   · 두기 전과 둔 뒤의 평가치 차이 (= 손해)
//   · 그 수 이후 상대가 무엇을 잡는가
// 포진 이름이나 전략 해설은 붙이지 않는다. 지어내게 되고, 복기에서 틀린 설명은
// 아무 설명도 없는 것보다 해롭다.
//
// 평가치를 장기 점수로 읽어도 되는 근거
// ------------------------------------
// 초기 국면에서 기물을 하나씩 빼고 40만 노드로 평가시켜 눈금을 재봤다.
//   병(2점) → 2.30   마(5점) → 4.54   포(7점) → 5.20   차(13점) → 9.42
// 낮은 쪽에서는 엔진 점수 1.0 이 대략 장기 1점이고, 위로 갈수록 눌린다.
// 그래서 손해를 기물로 옮길 때는 폭을 넓게 잡고 "쯤" 을 붙여 말한다.
//
// 등급은 점수가 아니라 승률로 매긴다
// ----------------------------------
// 둔 쪽의 승률(winChance)이 얼마나 떨어졌는지로 나눈다. 누구에게나 같은 잣대다 - 상대
// 급수에 맞춰 눈높이를 바꾸지 않는다. 점수로 나누면 이미 크게 이기는 판에서 3점 흘린 수와
// 팽팽한 판에서 3점 흘린 수가 같은 악수가 되는데, 앞의 것은 이기는 판이 그대로 이기는
// 판이다. 복기 카드가 보여 주는 "한 35% → 27%" 와도 같은 말을 한다.

import type { ReviewPlan } from "../engine/levels";
import type {
  AnalysisSnapshot,
  PositionProbe,
  PositionRef,
  SearchLimits,
} from "../engine/types";
import type { Board } from "./board";
import { parseFen } from "./board";
import { describeMove, splitMove } from "./notation";
import type { Side } from "./pieces";
import { SIDE_LABEL } from "./pieces";
import { 으로, 을를, 이가 } from "./korean";

/*
 * 등급은 넷이다. 한동안 다섯이었는데(부정확·실수·악수) 줄였다.
 *
 * 나쁜 쪽을 셋으로 쪼개도 두는 사람에게는 '아쉽다' 와 '크게 잃었다' 둘로만 읽힌다.
 * 5%p 와 10%p 를 가르는 선은 재는 쪽의 사정이지 배우는 쪽의 사정이 아니다. 칸이
 * 적을수록 한 칸의 뜻이 또렷해진다.
 *
 * 말도 바꿨다. '부정확' 은 영어(inaccuracy)를 그대로 옮긴 말이라 장기판에서 쓰지 않고,
 * '악수(惡手)' 는 소리가 握手와 같아서 처음 보면 엉뚱하게 읽힌다.
 */
export type MoveGrade =
  /** 엔진과 같은 수 */
  | "best"
  /** 최선은 아니지만 승률이 5%p 도 안 떨어진 수 */
  | "good"
  /** 승률 5%p 이상 - 졸 한 짝쯤 흘린 수 */
  | "inaccuracy"
  /** 승률 20%p 이상 - 마 한 짝쯤, 판이 뒤집힐 손해 */
  | "blunder";

export const GRADE_LABEL: Record<MoveGrade, string> = {
  best: "최선수",
  good: "좋은 수",
  inaccuracy: "아쉬운 수",
  blunder: "큰 실수",
};

/*
 * 등급 기호(★ · ?! ? ??)는 두지 않는다.
 *
 * 체스에서 온 표기라 장기 두는 사람에게는 배경 지식을 요구한다. 게다가 바로 옆에
 * "악수" 라고 이름이 적혀 있어서, 기호는 같은 말을 한 번 더 하는 것이었다.
 * 등급은 이름과 색으로만 말한다.
 */

/**
 * 둔 쪽 승률이 떨어진 폭(0~1)을 등급으로 나누는 경계. chess.com·lichess 처럼 승률로
 * 나눈다. 팽팽한 판이면 점수 손해 약 2.3 / 4.8 점이다 - 졸 한 짝, 마 한 짝쯤. 두는 사람이
 * 아는 말로 옮기면 "졸 하나 흘렸다" 와 "마 하나 날렸다" 다.
 *
 * 가운데에 10%p(실수) 선이 하나 더 있었다. 뺐다 - 5%p 와 10%p 를 가르는 것은 재는 쪽의
 * 사정이지 배우는 쪽의 사정이 아니다.
 *
 * 한때는 점수 0.3 / 1.0 / 3.0 을 상대 급수에 따라 최대 세 배까지 늘려 썼다(18급 ×3 ~ 9단 ×1).
 * 9단 눈높이(×1)면 팽팽한 판에서 승률 1.3%p 만 떨어져도 아쉬운 수라, '빠름' 깊이의 잔값만으로도
 * 대부분의 수에 등급이 붙는다.
 */
const WIN_INACCURACY = 0.05;
const WIN_BLUNDER = 0.2;

/**
 * 외통 점수를 그대로 빼면 손해가 수백이 된다.
 * 이기는 외통에서 더 빠른 외통으로 바뀐 것뿐인데 큰 실수로 찍히면 곤란하니,
 * 양쪽 끝을 잘라 같은 값으로 만든다.
 */
const CAP = 20;

export const clampScore = (score: number, mate: number | null): number =>
  mate !== null
    ? mate > 0
      ? CAP
      : -CAP
    : Math.max(-CAP, Math.min(CAP, score));

/**
 * 승률 곡선의 기울기. 점수 1 이 승률을 얼마나 옮기는지.
 *
 * 체스에서 쓰는 곡선(폰 하나 앞서면 약 59%, 룩 하나면 약 86%)을 위의 눈금에 맞췄다.
 * 병 하나가 엔진 2.30, 차 하나가 9.42 라서 0.18 이면 졸 하나 60%, 마 하나 69%,
 * 차 하나 84% 쯤이다.
 */
const WIN_K = 0.18;

/**
 * 평가치(초 기준)를 초가 이길 가능성(0~1)으로 어림한다.
 *
 * 알파장기의 승률은 실제 대국 결과로 배운 신경망이 내는 값이지만, 이 엔진은 점수만 낸다.
 * 그래서 점수를 로지스틱 곡선 1 / (1 + e^(−k·점수)) 에 얹어 옮긴다 - 어림값이다.
 * 잘라 낸 끝(±CAP, 외통)은 끝난 판으로 보고 1 / 0 이다.
 */
export function winChance(score: number): number {
  if (score >= CAP) return 1;
  if (score <= -CAP) return 0;
  return 1 / (1 + Math.exp(-WIN_K * score));
}

/** 화면에 적는 초의 승률(%, 정수). 한은 100 에서 뺀 값이라 둘의 합이 늘 100 이다. */
export const winPercent = (score: number): number => Math.round(winChance(score) * 100);

/** @param winDrop 둔 쪽 승률이 떨어진 폭(0~1). 오른 수는 0 이다. */
export function gradeOf(winDrop: number, playedBest: boolean): MoveGrade {
  if (playedBest) return "best";
  if (winDrop < WIN_INACCURACY) return "good";
  if (winDrop < WIN_BLUNDER) return "inaccuracy";
  return "blunder";
}

/*
 * 한 수의 정확도(0~100). 승률을 하나도 안 흘렸으면 100 이다.
 *
 * **리체스 공식을 통째로 가져온 것이 아니다.** 그 공식은 두 단계인데 앞 단계(엔진
 * 점수를 승률로 옮기기)가 체스 기물에 묶여 있다. 우리는 그 자리에 위의 winChance 를
 * 쓴다 - k=0.18 은 장기 기물을 하나씩 빼서 재어 맞춘 값이다. 뒤 단계는 입력이
 * "승률이 몇 %p 떨어졌나" 하나뿐이라 종목에 안 묶인다. 그래서 뒤 단계만 가져왔다.
 *
 * **우리 등급 경계와도 맞아떨어진다** - 5%p(아쉬운 수)가 79.8%, 20%p(큰 실수)가
 * 40.0% 다. 그 경계는 장기 기준으로 따로 정한 값인데 둥근 숫자에 떨어졌다.
 *
 * 2026-10-16 에 엔진끼리 11판 994수를 두게 해 재 봤다. 18급 74.7 · 5급 87.7 ·
 * 1급 89.9 · 5단 95.4(단순평균)로 급수를 따라 올랐다. 측정 방법과 한계는
 * docs/DECISIONS.md 에 있다.
 */
function moveAccuracy(winDrop: number): number {
  const pp = Math.max(0, Math.min(100, winDrop * 100));
  const raw = 103.1668 * Math.exp(-0.04354 * pp) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/**
 * 조화평균이 0 으로 나누지 않게 막는 하한.
 *
 * 승률을 80%p 넘게 흘리면 한 수 정확도가 0 이 된다. 위 측정에서 가장 나쁜 수가
 * 8.4% 라 실제로는 한 번도 안 걸렸지만, 안 걸린다고 없어도 되는 것은 아니다.
 */
const ACCURACY_FLOOR = 1;

/**
 * 한 판에서 한 쪽이 둔 수들의 정확도(0~100). 그 쪽이 둔 수가 없으면 `null`.
 *
 * **조화평균이다.** 단순평균은 실수를 묻어 버린다 - 18급은 둔 수의 10.6%가 큰 실수인데도
 * 단순평균이 74.7%를 준다. 조화평균은 62.6%를 주고, 사다리 양 끝을 32.2%p 벌린다
 * (단순평균은 20.7%p). 낮은 값에 끌려가는 성질이 여기서는 바라는 성질이다.
 *
 * **`winDrop` 이 늘 숫자라고 믿는다.** archive.ts 의 `isCurrentReview` 가 그 값이 없는
 * 옛 복기를 '복기 전' 으로 걸러 다시 돌리게 해 준다. 그 검사를 걷어내면 여기가 NaN 이 된다.
 *
 * 소수점은 화면에서 버린다. 표본이 급수마다 판 두셋이라 `88.3%` 는 없는 정밀도다.
 */
export function accuracyOf(rows: ReviewedMove[], side: Side): number | null {
  const mine = rows.filter((r) => r.mover === side);
  if (mine.length === 0) return null;
  const sum = mine.reduce(
    (acc, r) => acc + 1 / Math.max(moveAccuracy(r.winDrop), ACCURACY_FLOOR),
    0
  );
  return mine.length / sum;
}

/** 손해가 기물로 치면 얼마쯤인지. 경계가 흐릿해서 폭을 넓게 잡는다. */
function lossInPieces(loss: number): string | null {
  if (loss >= 8) return "차 한 짝쯤";
  if (loss >= 4.2) return "마나 포 한 짝쯤";
  if (loss >= 2) return "졸 한 짝쯤";
  return null;
}

export interface ReviewInput {
  /** history 안에서 이 수가 만든 국면의 위치 */
  index: number;
  mover: Side;
  /** 두기 직전의 판 */
  before: Board;
  /** 두고 난 뒤의 판 */
  after: Board;
  /** 실제로 둔 수 (엔진 좌표) */
  played: string;
  /** 엔진이 고른 최선수 */
  best: string | null;
  /** 둔 뒤 국면에서 엔진이 보는 상대의 응수 */
  replyPv: string[];
  /** 두기 전 평가 (초 기준, 이미 잘라낸 값) */
  scoreBefore: number;
  /** 둔 뒤 평가 (초 기준, 이미 잘라낸 값) */
  scoreAfter: number;
  /** 최선수를 두면 장군이 되는지. 엔진에 따로 물어본 값. */
  bestGivesCheck: boolean;
}

/**
 * 한 수의 설명. 복기가 줄마다 이름을 붙여 보여준다(AI의 수 / 그 뒤). 화면에서는 엔진을 'AI' 라고 부른다.
 * 한 덩어리 문장으로 두면 무엇이 최선이고 무엇이 벌어지는지 가려 읽기 어려웠다.
 */
export interface MoveNote {
  /** 둔 수를 한마디로. 최선수·좋은 수에만 있다. */
  verdict: string | null;
  /** 엔진이 고른 수(기보 표기). 최선수를 뒀으면 null. */
  best: string | null;
  /** 엔진이 고른 수가 무엇을 하는 자리였는지. 예: "마를 잡는 자리" */
  bestDoes: string | null;
  /** 둔 뒤 벌어지는 일. 예: "초가 43졸33으로 마를 가져갑니다." */
  after: string | null;
}

export interface ReviewedMove {
  index: number;
  mover: Side;
  played: string;
  playedNotation: string;
  /**
   * 좌표를 몰라도 읽히게 풀어 쓴 말. 예) "차를 앞으로 1칸 옮겼습니다."
   * 브라우저에 남아 있는 예전 복기에는 없어서 물음표를 붙인다.
   */
  playedPlain?: string;
  best: string | null;
  bestNotation: string | null;
  scoreBefore: number;
  scoreAfter: number;
  /** 둔 쪽이 본 점수 손해. 최선수면 0. 기물로 치면 얼마쯤인지 말할 때 쓴다. */
  loss: number;
  /**
   * 둔 쪽 승률이 떨어진 폭(0~1). 최선수면 0. 등급은 이것으로 매긴다.
   * 이 값이 없는 복기는 급수 눈높이로 등급을 매기던 때의 것이다(archive.ts 가 복기 전으로 읽는다).
   */
  winDrop: number;
  grade: MoveGrade;
  /**
   * 2차에서 고른 깊이로 다시 본 수인지. 1차(가볍게 훑기)로만 본 수는 false 다.
   * 예전 복기에는 이 값이 없다 - 그때는 모든 수를 같은 깊이로 봤다.
   */
  deep?: boolean;
  /** 화면에 띄우는 설명 */
  note: MoveNote;
}

export function reviewMove(input: ReviewInput): ReviewedMove {
  const {
    index, mover, before, after,
    played, best, replyPv,
    scoreBefore, scoreAfter, bestGivesCheck,
  } = input;

  // 평가치는 언제나 초 기준이다. 한이 둔 수의 손해는 부호가 반대다.
  const raw = mover === "cho" ? scoreBefore - scoreAfter : scoreAfter - scoreBefore;
  const playedBest = Boolean(best) && best === played;
  // 엔진이 고른 수를 그대로 뒀으면 손해는 0이다. 두 국면을 따로 탐색하는 터라
  // 같은 수인데도 잔값이 남는데, 그건 깊이 차이지 손해가 아니다.
  // 그대로 두면 "최선수 -0.29" 같은 말이 안 되는 줄이 뜨고 평균까지 흐려진다.
  const loss = playedBest ? 0 : Math.max(0, raw);
  const choDrop = winChance(scoreBefore) - winChance(scoreAfter);
  const winDrop = playedBest ? 0 : Math.max(0, mover === "cho" ? choDrop : -choDrop);
  const grade = gradeOf(winDrop, playedBest);

  const playedTold = describeMove(played, before);
  const playedNotation = playedTold.short;
  const bestNotation = best ? describeMove(best, before).short : null;

  return {
    index,
    mover,
    played,
    playedNotation,
    playedPlain: playedTold.plain,
    best,
    bestNotation,
    scoreBefore,
    scoreAfter,
    loss,
    winDrop,
    grade,
    note: buildNote({
      grade, loss, mover, before, after,
      played, best, bestGivesCheck, replyPv, playedBest,
    }),
  };
}

interface NoteInput {
  grade: MoveGrade;
  loss: number;
  mover: Side;
  before: Board;
  after: Board;
  played: string;
  best: string | null;
  bestGivesCheck: boolean;
  replyPv: string[];
  playedBest: boolean;
}

function buildNote(c: NoteInput): MoveNote {
  const opponent: Side = c.mover === "cho" ? "han" : "cho";
  const note: MoveNote = { verdict: null, best: null, bestDoes: null, after: null };

  // ① 최선수를 그대로 뒀으면 더 할 말이 없다.
  if (c.playedBest) {
    const played = describeMove(c.played, c.before);
    note.verdict = played.captured
      ? `AI도 같은 수를 골랐습니다. ${을를(played.captured)} 잡는 자리입니다.`
      : "AI도 같은 수를 골랐습니다.";
    return note;
  }

  // ② 크게 잃지 않았으면 굳이 나무라지 않는다.
  if (c.grade === "good") {
    note.verdict = "최선은 아니지만 크게 잃지는 않았습니다.";
  }

  // ③ 최선수가 무엇이었고, 그 수가 무엇을 하는지
  if (c.best) {
    const bestMove = describeMove(c.best, c.before);
    const does: string[] = [];
    if (bestMove.captured) does.push(`${을를(bestMove.captured)} 잡`);
    if (c.bestGivesCheck) does.push("장군을 부르");
    note.best = bestMove.short;
    note.bestDoes = does.length > 0 ? `${does.join("고 ")}는 자리` : null;
  }

  // ④ 둔 수 때문에 무엇을 잃는가 — 상대의 응수에서 그대로 읽는다
  const reply = c.replyPv[0];
  const replyMove = reply ? describeMove(reply, c.after) : null;
  const loses = Boolean(replyMove?.captured && replyMove.short !== reply);
  if (replyMove && loses) {
    note.after =
      `${이가(SIDE_LABEL[opponent])} ${으로(replyMove.short)} ` +
      `${을를(replyMove.captured!)} 가져갑니다.`;
  } else if (c.grade !== "good") {
    // 잡히는 기물이 없는데도 손해라면 자리가 나빠진 것이다. 이것도 엔진이 알려준
    // 사실이므로 그대로 적고, 손해가 기물로 치면 얼마쯤인지 붙인다.
    //
    // 무엇이 잡히는지 말했으면(위) 손해를 기물로 또 환산하지 않는다. 손해에는 놓친
    // 기회까지 섞여 있어서, "포를 가져갑니다 … 차 한 짝쯤" 처럼 앞뒤가 어긋나 보인다.
    const piece = lossInPieces(c.loss);
    note.after = piece
      ? `당장 잡히는 기물은 없지만 자리가 나빠집니다. ${piece} 손해입니다.`
      : "당장 잡히는 기물은 없지만 자리가 나빠집니다.";
  }

  return note;
}

/** 지금 수 대신 뒀어야 할 수. 판에 파란 화살표로 그린다. */
export function bestArrowOf(r: ReviewedMove | null) {
  if (!r?.best) return null;
  const { from, to } = splitMove(r.best);
  if (!from || !to || from === to) return null;
  return { from, to };
}

// --- 기보 한 판 훑기 -----------------------------------------------------

/**
 * 복기가 엔진에게 요구하는 것은 두 가지뿐이라, 클래스를 통째로 받지 않고
 * 이 모양만 받는다. janggi 폴더가 엔진 구현에 매이지 않게 하려는 것이다.
 */
export interface ReviewEngine {
  analyzeOnce(ref: PositionRef, limits: SearchLimits): Promise<AnalysisSnapshot>;
  probe(ref: PositionRef): Promise<PositionProbe>;
}

export interface ReviewProgress {
  /** 끝낸 국면 수 */
  done: number;
  /** 봐야 할 국면 수. 2차가 몇 국면을 볼지는 1차가 끝나야 정해져서, 그때 한 번 줄어든다. */
  total: number;
  /** scan = 기보 전체를 가볍게 훑는 중, deep = 고른 수를 다시 보는 중 */
  stage: "scan" | "deep";
}

export interface RunReviewOptions {
  engine: ReviewEngine;
  startFen: string;
  /** 기보의 모든 수 (엔진 좌표) */
  moves: string[];
  /** 몇 국면을 어떤 탐색량으로 볼지 (engine/levels.ts 의 reviewPlan) */
  plan: ReviewPlan;
  onProgress: (p: ReviewProgress) => void;
  /**
   * 설명이 하나 생기거나 바뀔 때마다 지금까지의 것을 넘긴다.
   * 다 끝나기를 기다리지 않고 화면에 띄우려는 것이다 - 1차가 끝나면 모든 수에 설명이
   * 붙고, 2차는 고른 수의 설명을 더 정확한 것으로 갈아 끼운다.
   */
  onPartial?: (reviewed: ReviewedMove[]) => void;
  /** true 를 돌려주면 그 자리에서 그만둔다 */
  shouldStop: () => boolean;
}

/** 한 수 둔 판. 장기에는 승진이 없어서 기물을 옮기는 게 전부다. */
function advance(board: Board, move: string): Board {
  const { from, to } = splitMove(move);
  if (!from || !board[from]) return board;
  const next = { ...board };
  if (from !== to) {
    next[to] = next[from];
    delete next[from];
  }
  return next;
}

/** 한 국면을 엔진에게 물어 얻은 것. 1차와 2차가 같은 모양으로 담는다. */
interface Look {
  score: number;
  best: string | null;
  pv: string[];
  /** 2차에서 고른 깊이로 본 국면인지 */
  deep: boolean;
}

/**
 * 2차에서 다시 볼 수를 고른다.
 *
 * 1차로 매긴 승률 하락이 큰 순서로 limit 개. 바닥(floor)을 두는 까닭은, 깨끗하게 둔
 * 판에서까지 억지로 limit 개를 채우면 아무 일도 없던 수에 200만 노드를 쓰기 때문이다.
 * 바닥은 부정확(5%p)보다 낮게 잡는다 - 1차는 얕게 본 값이라 경계에 걸친 수가 2차에서
 * 등급을 넘나들 수 있고, 그 수야말로 다시 봐야 할 수다.
 *
 * 돌려주는 것은 수 번호(0부터)이고, 기보 순서로 정렬해 돌려준다.
 */
export function pickDeepMoves(winDrops: number[], limit: number, floor = 0.02): number[] {
  return winDrops
    .map((drop, move) => ({ drop, move }))
    .filter((x) => x.drop >= floor)
    .sort((a, b) => b.drop - a.drop || a.move - b.move)
    .slice(0, Math.max(0, limit))
    .map((x) => x.move)
    .sort((a, b) => a - b);
}

/**
 * 기보를 처음부터 끝까지 한 수씩 훑는다.
 *
 * 국면마다 엔진을 한 번씩 돌린다. 수가 n 개면 국면은 n+1 개다. 한 국면의
 * 평가치는 그 앞 수의 '둔 뒤 점수'이자 다음 수의 '두기 전 점수'라서,
 * 국면당 한 번이면 충분하다.
 *
 * 두 번에 나눠 본다(engine/levels.ts 의 reviewPlan).
 *   1차  기보 전체를 가볍게. 끝나면 모든 수에 설명이 붙는다.
 *   2차  승률이 크게 움직인 수만 골라 고른 깊이로 다시 본다.
 *
 * **한 수의 두 끝은 늘 같은 깊이로 본 값이다.** 등급은 두 국면의 승률 차이로 매기는데,
 * 한쪽만 깊게 보면 깊이가 달라서 생긴 값 차이가 그대로 '손해' 로 읽힌다. 그래서 고른 수는
 * 앞뒤 국면을 둘 다 다시 보고, 고르지 않은 수는 양쪽 다 1차 값으로 둔다.
 *
 * 중간에 멈추면 1차가 끝났을 때까지만 돌려준다(그래야 수마다 설명이 다 있다).
 * 1차 도중에 멈추면 빈 목록이다 - 설명이 반만 있는 복기는 남겨도 쓸 데가 없다.
 */
export async function runReview(opts: RunReviewOptions): Promise<ReviewedMove[]> {
  const { engine, startFen, moves, plan, onProgress, onPartial, shouldStop } = opts;

  const positions = moves.length + 1;
  const looks: Look[] = [];
  const startsWithCho = startFen.split(/\s+/)[1] !== "b";

  // 판은 앞에서부터 한 수씩 둬 가며 만든다. m 번째 수를 두기 직전의 판이 boards[m] 이다.
  const boards: Board[] = [parseFen(startFen).board];
  for (const move of moves) boards.push(advance(boards[boards.length - 1], move));

  const look = async (i: number, nodes: number, deep: boolean): Promise<Look> => {
    const snap = await engine.analyzeOnce({ startFen, moves: moves.slice(0, i) }, { nodes });
    const line = snap.lines[0];
    return {
      // 대국이 끝난 국면에는 둘 수가 없어 줄이 비어 있다. 앞 점수를 이어 쓴다.
      score: line ? clampScore(line.score, line.mate) : (looks[i - 1]?.score ?? 0),
      best: snap.bestmove ?? line?.pv[0] ?? null,
      pv: line?.pv ?? [],
      deep,
    };
  };

  /**
   * m 번째 수의 설명을 짓는다. 양 끝 국면을 이미 본 뒤에만 부른다.
   *
   * 최선수가 장군인지는 판만 봐서는 알 수 없다. 규칙 판정은 전부 엔진 몫이라 그 수를 둔
   * 국면을 따로 한 번 물어본다(실제로 둔 수와 같으면 물을 것도 없다).
   */
  const build = async (m: number): Promise<ReviewedMove> => {
    const played = moves[m];
    const best = looks[m].best;

    let bestGivesCheck = false;
    if (best && best !== played) {
      try {
        const probe = await engine.probe({ startFen, moves: [...moves.slice(0, m), best] });
        bestGivesCheck = probe.checkers.length > 0;
      } catch {
        bestGivesCheck = false;
      }
    }

    return {
      ...reviewMove({
        index: m + 1,
        mover: ((m % 2 === 0) === startsWithCho ? "cho" : "han") as Side,
        before: boards[m],
        after: boards[m + 1],
        played,
        best,
        replyPv: looks[m + 1]?.pv ?? [],
        scoreBefore: looks[m].score,
        scoreAfter: looks[m + 1]?.score ?? looks[m].score,
        bestGivesCheck,
      }),
      deep: looks[m].deep && (looks[m + 1]?.deep ?? false),
    };
  };

  const reviewed: ReviewedMove[] = [];
  let total = positions + plan.deepPositions;
  let done = 0;

  onProgress({ done, total, stage: plan.single ? "deep" : "scan" });

  // --- 1차: 기보 전체 ---------------------------------------------------
  for (let i = 0; i < positions; i++) {
    if (shouldStop()) return [];

    looks[i] = await look(i, plan.scanNodes, plan.single);
    done += 1;
    onProgress({ done, total, stage: plan.single ? "deep" : "scan" });

    // 국면 i 를 보고 나면 그 앞 수(i-1)의 두 끝이 다 채워진다.
    if (i >= 1) {
      reviewed.push(await build(i - 1));
      onPartial?.([...reviewed]);
    }
  }

  if (plan.single) return reviewed;

  // --- 2차: 고른 수만 -----------------------------------------------------
  const picks = pickDeepMoves(
    reviewed.map((r) => r.winDrop),
    plan.deepMoves
  );
  const again = new Set<number>();
  for (const m of picks) {
    again.add(m);
    again.add(m + 1);
  }

  // 1차가 끝나야 2차가 몇 국면인지 정해진다. 그때 분모를 실제 값으로 줄인다.
  total = positions + again.size;
  onProgress({ done, total, stage: "deep" });

  for (const i of [...again].sort((a, b) => a - b)) {
    if (shouldStop()) return reviewed;

    looks[i] = await look(i, plan.deepNodes, true);
    done += 1;
    onProgress({ done, total, stage: "deep" });
  }

  for (const m of picks) {
    if (shouldStop()) return reviewed;
    reviewed[m] = await build(m);
  }
  onPartial?.([...reviewed]);

  return reviewed;
}
