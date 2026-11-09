// 혼자 장기 - 판의 기물끼리 잡아 하나만 남기는 혼자 푸는 문제의 규칙과 데이터
//
// 규칙(2026-11-09 사용자 결정):
//   - 판에 초·한 기물이 섞여 있다. 초 기물은 한 기물만, 한 기물은 초 기물만 잡는다.
//   - 잡는 수만 둔다. 빈 자리로는 옮기지 못한다.
//   - 차례가 없다. 어느 편 기물이든 먼저 둔다.
//   - 궁이 없다. 그래서 장군·빅장을 따질 일이 없다.
//   - 기물마다 잡는 횟수에 한도가 없다.
//   - 기물이 하나 남으면 풀린다. 둘 이상 남았는데 잡을 수가 없으면 막힌 것이다.
//
// 기물 움직임은 대국 그대로이고 행마 계산(moves.ts)을 그대로 쓴다. 그 계산은 장군을 보지 않는데,
// 궁이 없는 판에서는 그것이 곧 둘 수 있는 수다. moves.ts 가 엔진과 같다는 것은
// moves.engine.test.ts 가 무작위 국면으로 본다.
//
// 문제 데이터(solos.json)는 scripts/solo-data.mjs 가 만든다. 그 스크립트도 이 파일의 규칙을 그대로
// 불러 쓴다 - 문제를 만들 때와 화면에서 둘 때의 규칙이 한 벌이다.
//
// 화면에는 정해진 답이 없다. 어느 길로든 하나가 남으면 풀린 것이다. 데이터의 line 은 답 하나일
// 뿐이고, 시험과 E2E 가 그 길로 끝까지 둔다.

import type { Board, Square } from "./board";
import { parseFen } from "./board";
import { pieceMoves } from "./moves";
import { splitMove } from "./notation";
import data from "./solos.json";

export type SoloLevel = 1 | 2 | 3;

export interface SoloPuzzle {
  /** 판 칸(FEN 첫 칸)의 SHA-256 앞 10자리. 푼 기록이 이 값을 쓴다 - 순서가 바뀌어도 같은 문제를 가리킨다. */
  id: string;
  /** 1 쉬움, 2 보통, 3 어려움 */
  level: SoloLevel;
  /** 문제 국면. parseFen 이 그대로 읽게 둘 차례 칸이 붙어 있지만(늘 w) 이 규칙에서는 뜻이 없다. */
  fen: string;
  /** 답 하나. 잡는 수의 차례이고 길이는 기물 수 - 1. */
  line: string[];
}

/** 화면 순서(쉬움 → 보통 → 어려움, 묶음 안은 쉬울 것 먼저)로 놓인 문제 전부. */
export const SOLOS: readonly SoloPuzzle[] = data as SoloPuzzle[];

export const LEVEL_LABEL: Record<SoloLevel, string> = { 1: "쉬움", 2: "보통", 3: "어려움" };

export const boardOf = (p: SoloPuzzle): Board => parseFen(p.fen).board;

export const pieceCount = (board: Board): number => Object.keys(board).length;

/** 지금 판에서 둘 수 있는 수(a4a5 꼴) 전부. 모두 상대 편 기물을 잡는 수다. */
export function capturesOf(board: Board): string[] {
  const out: string[] = [];
  for (const from of Object.keys(board) as Square[]) {
    for (const to of pieceMoves(board, from)) {
      if (board[to]) out.push(from + to);
    }
  }
  return out;
}

/** 수를 둔 판. 둘 수 있는 수인지는 보지 않는다 - 부르는 쪽이 capturesOf 로 고른 수만 넘긴다. */
export function playCapture(board: Board, move: string): Board {
  const { from, to } = splitMove(move);
  const next: Board = { ...board };
  next[to] = next[from];
  delete next[from];
  return next;
}

export type SoloState = "solved" | "stuck" | "open";

/** 풀렸나(하나 남음), 막혔나(둘 이상인데 잡을 수 없음), 아직 둘 수가 있나. */
export function stateOf(board: Board): SoloState {
  if (pieceCount(board) === 1) return "solved";
  return capturesOf(board).length === 0 ? "stuck" : "open";
}

/**
 * 끝까지 찾는다. 같은 판은 한 번만 센다.
 *
 * - solutions: 하나가 남는 길의 수
 * - chance: 둘 수 있는 수 가운데 하나를 고르게 골라 끝까지 둘 때 하나가 남을 확률. 문제를 만들 때
 *   어려움을 나누는 데 쓴다(사람이 느끼는 어려움과 같은지는 재지 않았다).
 *
 * 문제가 기물 10개 이하라 몇 ms 면 끝난다. 화면은 쓰지 않는다(스크립트와 시험이 쓴다).
 */
export function explore(board: Board): { solutions: number; chance: number } {
  const memo = new Map<string, { solutions: number; chance: number }>();
  const go = (b: Board): { solutions: number; chance: number } => {
    const key = Object.keys(b).sort().map((s) => s + b[s]).join(",");
    const hit = memo.get(key);
    if (hit) return hit;
    let result = { solutions: 0, chance: 0 };
    if (pieceCount(b) === 1) result = { solutions: 1, chance: 1 };
    else {
      const moves = capturesOf(b);
      for (const m of moves) {
        const r = go(playCapture(b, m));
        result = { solutions: result.solutions + r.solutions, chance: result.chance + r.chance / moves.length };
      }
    }
    memo.set(key, result);
    return result;
  };
  return go(board);
}

/** 같은 묶음 안에서 몇 번인지. 1부터. */
export function numberOf(p: SoloPuzzle): number {
  return SOLOS.filter((q) => q.level === p.level).indexOf(p) + 1;
}

/** 전체 순서에서 다음 문제. 마지막이면 null. */
export function nextOf(p: SoloPuzzle): SoloPuzzle | null {
  return SOLOS[SOLOS.indexOf(p) + 1] ?? null;
}

/**
 * 이 목록에 있는 문제 가운데 푼 것의 id. 데이터에 없는 id 는 세지 않는다(기록에서 지우지도 않는다).
 *
 * 푼 기록(janggi:solo-solved)은 외통 문제와 같은 모양 {"solved": [...]} 이라 모양 검사와 더하기는
 * mate.ts 의 isSolvedRecord·withSolved 를 같이 쓴다. 키는 따로다 - 두 기능의 기록이 한 키에 섞이면
 * 나중에 한쪽만 지우거나 모양을 바꿀 때 다른 쪽까지 옮겨야 한다.
 */
export function solvedIdsIn(solved: readonly string[], list: readonly SoloPuzzle[]): Set<string> {
  const ids = new Set(solved);
  return new Set(list.filter((p) => ids.has(p.id)).map((p) => p.id));
}
