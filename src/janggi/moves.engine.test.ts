// 행마 계산(moves.ts)이 엔진과 같은지 - 무작위 국면에서 견준다
//
// moves.ts 는 장군을 보지 않는 행마 계산이다. 배우기 화면은 기물 하나의 움직임을 보이는 데 쓰고, 혼자
// 장기(solo.ts)는 그 결과를 그대로 "둘 수 있는 수" 로 쓴다 - 혼자 장기의 판에는 궁이 없어서 장군을
// 따질 일이 없기 때문이다. 그래서 moves.ts 의 행마가 대국(엔진)과 같아야 한다. 다르면 대국에서
// 안 되는 움직임이 혼자 장기에서 되거나, 그 반대가 된다.
//
// 엔진은 궁이 있어야 판을 받는다. 그래서 두 궁을 궁성에 놓은 무작위 국면에서 둘 차례 쪽의
// pieceMoves 와 엔진 합법수(한수쉼 뺌)를 견주고, 차이는 궁 때문인 것만 있어야 한다:
//   - 엔진에만 있는 수: 없어야 한다.
//   - moves.ts 에만 있는 수: 두고 나면 내 궁이 장군이거나(그 국면에 내 차례를 다시 주고 엔진에 묻는다),
//     두 궁이 마주 본 채(빅장) 그것을 풀지 않는 수여야 한다. 빅장이 있는 규칙(표준·전통)에서 엔진은
//     빅장을 받은 쪽이 풀지 않는 수를 막는다. 현대 규칙에는 빅장이 없어 이 차이가 없다(status.ts 의
//     variantRules).
//
// 씨앗을 정해 두어 늘 같은 국면을 본다. 엔진 패키지 판이 오르거나 moves.ts 를 고치면 다시 돌아
// 어긋남을 잡는다. 엔진은 앱이 싣는 것과 같은 패키지다(test/nodeEngine.ts).

import { beforeAll, describe, expect, it } from "vitest";
import { openNodeEngine } from "../test/nodeEngine";
import type { NodeEngine } from "../test/nodeEngine";
import type { Board, Position, Square } from "./board";
import { FILES, RANKS, applyMove, palaceOf, rankOf, sq, toFen } from "./board";
import { pieceMoves } from "./moves";
import { splitMove } from "./notation";
import type { PieceChar, Side } from "./pieces";
import { sideOf } from "./pieces";
import { variantRules } from "./status";

const VARIANTS = ["janggi", "janggimodern", "janggitraditional"] as const;
/** 규칙마다 볼 국면 수. 2026-11-09 에 1,500 국면 × 씨앗 둘로 잰 것을 작게 줄였다(어긋남 0). */
const PER_VARIANT = 300;

const SQUARES: Square[] = [];
for (let f = 0; f < FILES; f++) for (let r = 1; r <= RANKS; r++) SQUARES.push(sq(f, r));
const PALACE: Record<Side, Square[]> = {
  cho: SQUARES.filter((s) => palaceOf(s) === "cho"),
  han: SQUARES.filter((s) => palaceOf(s) === "han"),
};
const TYPES = ["r", "c", "n", "b", "a", "p"];

/** 정해진 씨앗의 난수. */
function randomOf(seed: number) {
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return { rand, pick: <T,>(list: T[]): T => list[Math.floor(rand() * list.length)] };
}

/** 두 궁 + 기물 4~13개. 사는 제 궁성에 놓는다(대국과 같다). */
function randomPosition(r: ReturnType<typeof randomOf>): Position {
  const board: Board = { [r.pick(PALACE.cho)]: "K" };
  const hanKing = r.pick(PALACE.han.filter((s) => !board[s]));
  board[hanKing] = "k";
  const n = 4 + Math.floor(r.rand() * 10);
  for (let k = 0; k < n; k++) {
    const side: Side = r.rand() < 0.5 ? "cho" : "han";
    const type = r.pick(TYPES);
    const at = type === "a" ? r.pick(PALACE[side]) : r.pick(SQUARES);
    if (!board[at]) board[at] = (side === "cho" ? type.toUpperCase() : type) as PieceChar;
  }
  return { board, turn: r.rand() < 0.5 ? "cho" : "han", halfmove: 0, fullmove: 1 };
}

const kingOf = (board: Board, side: Side) =>
  Object.keys(board).find((s) => board[s] === (side === "cho" ? "K" : "k"));

/** 두 궁이 같은 세로줄에서 사이에 아무것도 없이 마주 보는지(빅장). */
function facing(board: Board): boolean {
  const cho = kingOf(board, "cho");
  const han = kingOf(board, "han");
  if (!cho || !han || cho[0] !== han[0]) return false;
  for (let r = rankOf(cho) + 1; r < rankOf(han); r++) if (board[cho[0] + r]) return false;
  return true;
}

const isPass = (m: string) => m.slice(0, m.length / 2) === m.slice(m.length / 2);

interface Result {
  positions: number;
  captures: number;
  /** moves.ts 에만 있고 두면 내 궁이 장군인 수 */
  selfCheck: number;
  /** moves.ts 에만 있고 빅장을 풀지 않는 수 */
  bikjang: number;
  problems: string[];
}

async function compare(engine: NodeEngine, variant: string, seed: number): Promise<Result> {
  engine.variant(variant);
  const r = randomOf(seed);
  const result: Result = { positions: 0, captures: 0, selfCheck: 0, bikjang: 0, problems: [] };
  while (result.positions < PER_VARIANT) {
    const pos = randomPosition(r);
    const mine = (c: PieceChar) => sideOf(c) === pos.turn;
    const pseudo: string[] = [];
    for (const [from, piece] of Object.entries(pos.board)) {
      if (mine(piece)) for (const to of pieceMoves(pos.board, from)) pseudo.push(from + to);
    }
    // 상대 궁을 바로 잡을 수 있는 국면은 대국에서 나오지 않는다(앞 수가 장군을 두고 둔 것). 뺀다.
    const enemyKing = kingOf(pos.board, pos.turn === "cho" ? "han" : "cho");
    if (pseudo.some((m) => splitMove(m).to === enemyKing)) continue;
    result.positions += 1;

    const fen = toFen(pos);
    const engineMoves = new Set((await engine.probe(fen)).legal.filter((m) => !isPass(m)));
    result.captures += pseudo.filter((m) => pos.board[splitMove(m).to]).length;
    for (const m of engineMoves) if (!pseudo.includes(m)) result.problems.push(`${variant} ${fen}: ${m} 은 엔진에만 있음`);
    for (const m of pseudo) {
      if (engineMoves.has(m)) continue;
      const { from, to } = splitMove(m);
      // 두고 나서 내 차례를 다시 주면, 엔진의 Checkers 가 내 궁에 장군을 거는 기물을 말한다.
      const after = { ...applyMove(pos, from, to), turn: pos.turn };
      if ((await engine.probe(toFen(after))).checkers.length > 0) result.selfCheck += 1;
      else if (facing(pos.board) && facing(after.board)) result.bikjang += 1;
      else result.problems.push(`${variant} ${fen}: ${m} 은 moves.ts 에만 있고 궁 때문도 아님`);
    }
  }
  return result;
}

describe("moves.ts 와 엔진의 행마", () => {
  let engine: NodeEngine;
  beforeAll(async () => {
    engine = await openNodeEngine();
  }, 30_000);

  it.each(VARIANTS)("%s - 무작위 국면에서 차이는 궁 때문(장군·빅장)인 것뿐이다", async (variant) => {
    const result = await compare(engine, variant, 7);
    expect(result.problems).toEqual([]);
    // 시험이 헛돌지 않는지: 국면을 다 봤고, 잡는 수와 궁 때문에 갈린 수가 실제로 나왔다.
    expect(result.positions).toBe(PER_VARIANT);
    expect(result.captures).toBeGreaterThan(100);
    expect(result.selfCheck).toBeGreaterThan(0);
    // 빅장 때문에 갈린 수는 빅장이 있는 규칙에서만 나온다.
    if (variantRules(variant).bikjangRule) expect(result.bikjang).toBeGreaterThan(0);
    else expect(result.bikjang).toBe(0);
  }, 60_000);
});
