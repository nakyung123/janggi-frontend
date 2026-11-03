// 외통 문제 - 정해진 수 안에 외통을 거는 문제의 데이터, 정답 판정, 푼 기록의 모양
//
// 문제는 엔진끼리 둔 판에서 뽑았고, 정답이 하나뿐인 것을 세 규칙(표준·현대·전통)에서 증명한 것만
// 쓴다(docs 의 조사 보고서). 데이터(mates.json)는 scripts/mate-data.mjs 가 만든다.
//
// 화면에는 엔진이 없다. 둘 수 있는 수는 데이터에 담긴 엔진의 합법수이고, 마지막 정답 뒤가 외통인지도
// 데이터가 보장한다. 그 둘이 앱의 엔진과 같은지는 mate.test.ts 가 진짜 엔진으로 본다.
//
// 수비 쪽은 주 수순의 응수만 둔다. 그 응수는 가장 오래 버티는 수다. 곁가지 응수 뒤에는 답이 둘
// 이상인 문제도 있어서(조사 보고서 10번), 다른 응수를 두게 만들면 안 된다.

import type { Position, Square } from "./board";
import { applyMove, parseFen } from "./board";
import { splitMove } from "./notation";
import type { Side } from "./pieces";
import data from "./mates.json";

export interface MatePuzzle {
  /** FEN 의 판 + 둘 차례의 SHA-256 앞 10자리. 푼 기록이 이 값을 쓴다 - 순서가 바뀌어도 같은 문제를 가리킨다. */
  id: string;
  /** 몇 수 외통인지(공격 쪽 수만 센다) */
  n: number;
  /** 첫 수가 장군이 아니다. 사람에게 더 어려운 문제라 목록에 따로 적는다. */
  quiet: boolean;
  /** 문제 국면. 둘 차례가 공격 쪽이다. */
  fen: string;
  /** 주 수순. 공격·수비가 번갈아 두고 공격으로 끝난다(길이 2n-1). */
  line: string[];
  /** 공격 차례마다 둘 수 있는 수(엔진의 합법수, 한수쉼 뺌). 길이 n. */
  legal: string[][];
}

/** 화면 순서(1수 → 2수 → 3수, 묶음 안은 쉬운 것 먼저)로 놓인 문제 전부. */
export const MATES: readonly MatePuzzle[] = data;

/** 공격 쪽. 문제 국면에서 둘 차례다. */
export const attackerOf = (p: MatePuzzle): Side => parseFen(p.fen).turn;

/** 주 수순을 앞에서 plies 수만큼 둔 국면. */
export function positionAt(p: MatePuzzle, plies: number): Position {
  let pos = parseFen(p.fen);
  for (const move of p.line.slice(0, plies)) {
    const { from, to } = splitMove(move);
    pos = applyMove(pos, from, to);
  }
  return pos;
}

/** 공격 쪽 step 번째(0부터) 수의 정답. */
export const answerAt = (p: MatePuzzle, step: number): string => p.line[step * 2];

/** 공격 쪽 step 번째 수 뒤 수비의 응수. 마지막 수 뒤에는 없다(외통이다). */
export const replyAt = (p: MatePuzzle, step: number): string | null => p.line[step * 2 + 1] ?? null;

/** 공격 쪽 step 번째 수를 둘 국면에서 둘 수 있는 수. */
export const legalAt = (p: MatePuzzle, step: number): ReadonlySet<string> => new Set(p.legal[step]);

/** 같은 묶음(같은 수의 외통) 안에서 몇 번인지. 1부터. */
export function numberOf(p: MatePuzzle): number {
  return MATES.filter((q) => q.n === p.n).indexOf(p) + 1;
}

/** 전체 순서에서 다음 문제. 마지막이면 null. */
export function nextOf(p: MatePuzzle): MatePuzzle | null {
  return MATES[MATES.indexOf(p) + 1] ?? null;
}

// --- 푼 기록 --------------------------------------------------------------------

/**
 * 이 기기에 남기는 푼 기록(janggi:mate-solved). 정답을 보지 않고 끝까지 둔 문제의 id.
 *
 * 배열 하나가 아니라 객체로 감쌌다. 칸을 더할 때 키 이름과 모양을 바꾸지 않아도 된다 - 이 키는
 * 한 번 나가면 바꿀 수 없다(바꾸면 이미 쌓인 기록이 안 읽힌다). 모양을 꼭 바꿔야 하면 새 키를
 * 만들고 이 키를 한 번 읽어 옮긴다.
 *
 * 데이터에 없는 id 는 지우지 않는다. 문제를 다시 만들다 빠졌던 것이 돌아오면 기록도 돌아온다.
 */
export interface SolvedRecord {
  solved: string[];
}

export const NO_SOLVED: SolvedRecord = { solved: [] };

/** 읽어 온 값이 푼 기록 모양인지. 아니면 빈 기록으로 시작한다(usePersisted 의 accept). */
export function isSolvedRecord(value: unknown): value is SolvedRecord {
  if (typeof value !== "object" || value === null) return false;
  const solved = (value as { solved?: unknown }).solved;
  return Array.isArray(solved) && solved.every((id) => typeof id === "string");
}

/** id 를 더한 기록. 이미 있으면 그대로 돌려준다. */
export function withSolved(record: SolvedRecord, id: string): SolvedRecord {
  return record.solved.includes(id) ? record : { ...record, solved: [...record.solved, id] };
}

/** 이 목록에 있는 문제 가운데 푼 것의 id. */
export function solvedIn(record: SolvedRecord, list: readonly MatePuzzle[]): Set<string> {
  const ids = new Set(record.solved);
  return new Set(list.filter((p) => ids.has(p.id)).map((p) => p.id));
}

/** 외통을 맞은 궁의 자리. 마지막 정답 뒤 판에 장군 테를 두르는 데 쓴다. */
export function kingOf(pos: Position, side: Side): Square | null {
  const king = side === "cho" ? "K" : "k";
  return Object.entries(pos.board).find(([, piece]) => piece === king)?.[0] ?? null;
}
