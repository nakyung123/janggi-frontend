// 끝내기·국면 연습 - 정해진 국면에서 AI 와 이어 두는 연습의 데이터, 목표 판정, 깬 기록의 모양
//
// 국면은 책·사이트에서 옮기지 않았다. scripts/endgame-data.mjs 가 끝내기는 기물 조합을 시드로 놓아,
// 국면 연습은 엔진끼리 둔 판에서 뽑아 만들고, 엔진끼리 끝까지 세 판을 둬서 세 판 모두 목표를 이룬
// 것만 담는다(데이터의 check 에 그 결과가 있다). 데이터(endgames.json)는 그 스크립트만 쓴다.
//
// **이기기는 외통으로만 이룬다.** 현대 규칙에서도 양쪽 한수쉼 점수승이 난다. 그것을 이룬 것으로 치면
// "8수 안에 외통" 이 "한수쉼 두 번" 이 된다. 규칙은 국면마다 데이터에 있고 이번 국면은 모두 현대
// (빅장 없음)다 - 표준에서는 빅장 점수승이, 전통에서는 AI 의 빅장 무승부가 외통보다 먼저 왔다
// (2026-11-09 엔진 실험, docs/report-endgame.md 5절).
//
// 판정은 대국과 같은 gameStatus·outcomeOf 가 하고, 여기서는 그 결과와 둔 수의 개수로 목표를 본다.

import type { Variant } from "../engine/types";
import { parseFen } from "./board";
import { 을를 } from "./korean";
import type { PieceChar, Side } from "./pieces";
import { SIDE_LABEL, pieceInfo, sideOf, typeOf } from "./pieces";
import type { Outcome } from "./status";
import { outcomeMessage, scoreBoard } from "./status";
import data from "./endgames.json";

export type EndgameGroup = "endgame" | "middle";

/**
 * 목표. win 은 내 수 n 개 안에 외통으로 이기기, hold 는 AI 의 수 n 개를 지지 않고 버티기.
 * 수는 한쪽만 센다(외통 문제의 "몇 수 외통" 과 같다). 한수쉼도 한 수다.
 */
export interface EndgameGoal {
  kind: "win" | "hold";
  n: number;
}

export interface EndgamePosition {
  /** 국면 + 규칙 + 목표의 SHA-256 앞 10자리. 깬 기록이 이 값을 쓴다. 목표를 고치면 다른 국면이 된다. */
  id: string;
  group: EndgameGroup;
  variant: Variant;
  /** 시작 국면. 둘 차례가 내 쪽이다. */
  fen: string;
  goal: EndgameGoal;
  /** 엔진으로 확인한 결과(스크립트가 적는다). 화면은 읽지 않는다. */
  check: unknown;
}

export const ENDGAMES: readonly EndgamePosition[] = data as EndgamePosition[];

/** 한 묶음의 국면. 데이터 순서(쉬운 것 먼저) 그대로다. */
export const positionsOf = (group: EndgameGroup): EndgamePosition[] => ENDGAMES.filter((p) => p.group === group);

/** 내 쪽. 시작 국면에서 둘 차례다. */
export const mySideOf = (p: EndgamePosition): Side => parseFen(p.fen).turn;

/** 묶음 안에서 몇 번인지. 1부터. */
export const numberOf = (p: EndgamePosition): number => positionsOf(p.group).indexOf(p) + 1;

/** 묶음 안의 다음 국면. 마지막이면 null. */
export function nextOf(p: EndgamePosition): EndgamePosition | null {
  const list = positionsOf(p.group);
  return list[list.indexOf(p) + 1] ?? null;
}

// --- 화면 글 ------------------------------------------------------------------------

/** 기물 이름을 차·포·마·상·사·졸 순으로. 궁은 양쪽에 늘 있어 적지 않는다. */
const ORDER = ["r", "c", "n", "b", "a", "p"];
function piecesText(board: Record<string, PieceChar>, side: Side): string {
  const names = Object.values(board)
    .filter((c) => sideOf(c) === side && typeOf(c) !== "k")
    .sort((a, b) => ORDER.indexOf(typeOf(a)) - ORDER.indexOf(typeOf(b)))
    .map((c) => pieceInfo(c).name);
  return names.length ? names.join("·") : "궁";
}

/**
 * 목록과 두는 화면의 제목. 끝내기는 남은 기물("차·졸 대 사·사"), 국면 연습은 "국면 3".
 * 끝내기 제목에 궁만 남은 쪽은 "궁" 으로 적는다("차·졸 대 궁").
 */
export function titleOf(p: EndgamePosition): string {
  if (p.group === "middle") return `국면 ${numberOf(p)}`;
  const { board } = parseFen(p.fen);
  const me = mySideOf(p);
  return `${piecesText(board, me)} 대 ${piecesText(board, me === "cho" ? "han" : "cho")}`;
}

/** 국면 연습 목록의 덧말. 기물 점수(한의 덤 포함)로 어느 쪽이 얼마나 앞섰는지. */
export function materialText(p: EndgamePosition): string {
  const s = scoreBoard(parseFen(p.fen));
  return `기물 점수 초 ${s.cho} · 한 ${s.han}`;
}

/** 목표를 짧게. 목록 줄에 선다. */
export const goalShort = (g: EndgameGoal): string => (g.kind === "win" ? `${g.n}수 안에 외통` : `AI의 수 ${g.n}개 버티기`);

/** 두는 화면 위의 한 줄. "초를 잡고 8수 안에 외통을 거세요." */
export function goalSentence(p: EndgamePosition): string {
  const side = 을를(SIDE_LABEL[mySideOf(p)]);
  return p.goal.kind === "win"
    ? `${side} 잡고 ${p.goal.n}수 안에 외통을 거세요.`
    : `${side} 잡고 AI의 수 ${p.goal.n}개를 지지 않고 버티세요.`;
}

// --- 목표 판정 ------------------------------------------------------------------------

export type GoalState =
  | { done: false; /** 남은 수(이기기는 내 수, 버티기는 AI 의 수) */ left: number }
  | { done: true; achieved: boolean; /** 어떻게 끝났는지 한 줄 */ reason: string };

export interface GoalInput {
  goal: EndgameGoal;
  me: Side;
  /** 지금 국면에서 판이 끝났으면 어떻게(outcomeOf). 끝나지 않았으면 null. */
  outcome: Outcome | null;
  /** 지금 국면까지 내가 둔 수 / AI 가 둔 수 */
  myMoves: number;
  aiMoves: number;
  /** 지금 국면의 엔진 답(합법수·장군)을 받았는지. 받기 전에는 외통인지 모르므로 끝을 미룬다. */
  ready: boolean;
}

/**
 * 목표를 이뤘는지. 판이 끝나는 것보다 수가 다 되는 것을 늦게 본다 - 내 n 번째 수로 외통이 되면
 * 이룬 것이다. 그래서 그 국면의 엔진 답을 받기 전에는 "수가 다 됨" 으로 끝내지 않는다.
 */
export function goalState(input: GoalInput): GoalState {
  const { goal, me, outcome, myMoves, aiMoves, ready } = input;
  if (outcome) {
    const iWon = outcome.winner === me;
    if (goal.kind === "win") {
      if (outcome.kind === "checkmate" && iWon) return { done: true, achieved: true, reason: `외통입니다. ${myMoves}수 만에 이겼습니다.` };
      if (outcome.kind === "checkmate") return { done: true, achieved: false, reason: "외통을 당했습니다." };
      return {
        done: true,
        achieved: false,
        reason: iWon ? `${outcomeMessage(outcome)} 외통이 아니라 목표를 이루지 못했습니다.` : outcomeMessage(outcome),
      };
    }
    const lost = outcome.winner !== null && !iWon;
    return lost
      ? { done: true, achieved: false, reason: outcome.kind === "checkmate" ? "외통을 당했습니다." : outcomeMessage(outcome) }
      : { done: true, achieved: true, reason: `${outcomeMessage(outcome)} 지지 않았습니다.` };
  }
  if (goal.kind === "win") {
    if (myMoves >= goal.n && ready) return { done: true, achieved: false, reason: `${goal.n}수 안에 외통을 걸지 못했습니다.` };
    return { done: false, left: Math.max(0, goal.n - myMoves) };
  }
  if (aiMoves >= goal.n && ready) return { done: true, achieved: true, reason: `AI의 수 ${goal.n}개를 버텼습니다.` };
  return { done: false, left: Math.max(0, goal.n - aiMoves) };
}

// --- 깬 기록 --------------------------------------------------------------------------

/**
 * 이 기기에 남기는 깬 기록(janggi:endgame-cleared). 힌트·무르기 없이 목표를 이룬 국면의 id.
 *
 * 객체로 감쌌다. 칸을 더할 때 키 이름과 모양을 바꾸지 않아도 된다 - 이 키는 한 번 나가면 바꿀 수
 * 없다(외통 문제의 janggi:mate-solved 와 같은 까닭). 데이터에 없는 id 는 지우지 않는다.
 */
export interface ClearedRecord {
  cleared: string[];
}

export const NO_CLEARED: ClearedRecord = { cleared: [] };

export function isClearedRecord(value: unknown): value is ClearedRecord {
  if (typeof value !== "object" || value === null) return false;
  const cleared = (value as { cleared?: unknown }).cleared;
  return Array.isArray(cleared) && cleared.every((id) => typeof id === "string");
}

/**
 * 두 기록을 합친다(앞 기록의 순서 뒤에 뒤 기록에만 있는 것). 다른 탭이 그사이에 쓴 기록을 지우지
 * 않으려고, 남기기 직전에 저장된 값을 다시 읽어 이것으로 합친다.
 */
export function mergeCleared(a: ClearedRecord, b: ClearedRecord): ClearedRecord {
  const extra = b.cleared.filter((id) => !a.cleared.includes(id));
  return extra.length ? { ...a, cleared: [...a.cleared, ...extra] } : a;
}
