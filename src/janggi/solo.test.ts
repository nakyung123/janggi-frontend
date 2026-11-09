// 혼자 장기 - 규칙(잡는 수만, 상대 편만, 막힘·풂)과 문제 데이터 전수 시험
//
// 데이터의 모든 문제가 풀린다는 것을 앱의 규칙 코드(solo.ts)로 끝까지 찾아 본다. 데이터를 만든
// 스크립트(scripts/solo-data.mjs)도 같은 코드를 쓰지만, 손으로 고치거나 규칙을 바꾼 뒤 데이터를 다시
// 만들지 않으면 어긋난다 - 그것을 여기서 잡는다.

import { describe, expect, it } from "vitest";
import type { Board } from "./board";
import { FILES, RANKS, palaceOf, parseFen, rankOf, sq, toFen } from "./board";
import type { SoloPuzzle } from "./solo";
import { SOLOS, boardOf, capturesOf, explore, nextOf, numberOf, pieceCount, playCapture, solvedIdsIn, stateOf } from "./solo";

const 정렬 = (list: string[]) => [...list].sort();

describe("규칙 - 잡는 수만, 상대 편만", () => {
  it("상대 편 기물을 잡는 수만 낸다. 빈 자리로 가는 수는 없다", () => {
    // 초 차 e5: 한 졸 e8 은 잡고, 초 졸 c5 앞에서 멈춘다. 빈 자리(e6 등)는 수가 아니다.
    expect(capturesOf({ e5: "R", e8: "p", c5: "P" })).toEqual(["e5e8"]);
  });

  it("같은 편은 잡지 못한다 - 초끼리, 한끼리", () => {
    expect(capturesOf({ e5: "R", e8: "P" })).toEqual([]);
    expect(capturesOf({ e5: "r", e8: "p" })).toEqual([]);
  });

  it("어느 편 기물이든 둔다 - 차례가 없다", () => {
    // 초 차가 한 차를, 한 차가 초 차를 잡을 수 있다.
    expect(정렬(capturesOf({ a1: "R", a9: "r" }))).toEqual(["a1a9", "a9a1"]);
  });

  it("행마는 대국 그대로 - 포는 포를 넘지도 잡지도 못한다", () => {
    expect(capturesOf({ b3: "C", b5: "P", b8: "c" })).toEqual([]);
    expect(capturesOf({ b3: "C", b5: "c", b8: "r" })).toEqual([]);
    // 초 졸 b5 를 넘어 한 차 b8 을 잡는다. 한 차 b8 도 초 졸 b5 를 잡을 수 있다.
    expect(정렬(capturesOf({ b3: "C", b5: "P", b8: "r" }))).toEqual(["b3b8", "b8b5"]);
  });

  it("행마는 대국 그대로 - 마는 멱에 막힌다", () => {
    expect(capturesOf({ b1: "N", c3: "p" })).toEqual(["b1c3"]);
    expect(capturesOf({ b1: "N", b2: "P", c3: "p" })).toEqual([]);
  });

  it("둔 판: 잡은 기물이 그 자리에 서고 잡힌 기물은 없어진다", () => {
    expect(playCapture({ e5: "R", e8: "p", c5: "P" }, "e5e8")).toEqual({ e8: "R", c5: "P" });
  });

  it("하나 남으면 풀림, 둘 이상인데 잡을 수 없으면 막힘", () => {
    expect(stateOf({ e8: "R" })).toBe("solved");
    expect(stateOf({ e5: "R", e8: "P" })).toBe("stuck");
    expect(stateOf({ e5: "R", e8: "p" })).toBe("open");
  });

  it("끝까지 찾기: 길 수와 아무렇게나 둘 때 풀릴 확률", () => {
    // 초 차 a1·한 차 a9·초 졸 i9. 어느 수를 두어도 남은 둘이 같은 편이거나 서로 닿지 않는다.
    expect(explore({ a1: "R", a9: "r", i9: "P" })).toEqual({ solutions: 0, chance: 0 });
    // 초 차 a1·한 졸 a5·한 차 a9. 둘 수 있는 수는 a1a5 하나(한 차는 한 졸에 막힌다). 그 뒤 a5 의
    // 초 차와 a9 의 한 차가 서로 잡을 수 있어 두 길 모두 풀린다.
    const r = explore({ a1: "R", a9: "r", a5: "p" });
    expect(r.solutions).toBe(2);
    expect(r.chance).toBe(1);
  });
});

// --- 문제 데이터 ------------------------------------------------------------------

/** 한 편이 가진 수(대국 차림). 데이터가 대국에서 나올 법한 판이어야 한다. */
const MAX: Record<string, number> = { r: 2, c: 2, n: 2, b: 2, a: 2, p: 5 };

/** 문제 id 를 판에서 다시 계산한다(scripts/solo-data.mjs 와 같은 값이어야 한다). */
async function idOf(board: Board): Promise<string> {
  const text = new TextEncoder().encode(toFen({ board, turn: "cho", halfmove: 0, fullmove: 1 }).split(" ")[0]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", text));
  return [...hash].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10);
}

/**
 * 문제 데이터를 검사한다. 어긋난 곳을 말로 돌려준다(없으면 빈 배열).
 * 일부러 망가뜨린 사본도 같은 함수로 넣어 본다 - 검사가 실제로 무언가를 잡는지 보려고.
 */
async function problemsOf(list: readonly SoloPuzzle[]): Promise<string[]> {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of list) {
    const where = `${p.id}(묶음 ${p.level})`;
    const board = boardOf(p);
    if (p.id !== (await idOf(board))) problems.push(`${where}: id 가 판으로 계산한 값과 다름`);
    if (ids.has(p.id)) problems.push(`${where}: id 겹침`);
    ids.add(p.id);

    for (const [square, piece] of Object.entries(board)) {
      const type = piece.toLowerCase();
      const side = piece === piece.toUpperCase() ? "cho" : "han";
      if (type === "k") problems.push(`${where}: 궁이 있음(${square})`);
      if (type === "a" && palaceOf(square) !== side) problems.push(`${where}: 사가 제 궁성 밖(${square})`);
      if (type === "p" && (side === "cho" ? rankOf(square) < 4 : rankOf(square) > 7)) {
        problems.push(`${where}: 졸이 제 진영 뒤 세 줄 안(${square})`);
      }
    }
    for (const piece of new Set(Object.values(board))) {
      const count = Object.values(board).filter((c) => c === piece).length;
      if (count > (MAX[piece.toLowerCase()] ?? 0)) problems.push(`${where}: ${piece} 가 ${count}개`);
    }

    // 답 하나(line)가 규칙대로 하나를 남기는지.
    if (p.line.length !== pieceCount(board) - 1) problems.push(`${where}: 답의 길이가 ${p.line.length}`);
    let at = board;
    for (const [i, move] of p.line.entries()) {
      if (!capturesOf(at).includes(move)) {
        problems.push(`${where}: 답의 ${i + 1}째 수 ${move} 를 둘 수 없음`);
        break;
      }
      at = playCapture(at, move);
    }
    if (stateOf(at) !== "solved") problems.push(`${where}: 답대로 두어도 하나가 남지 않음`);

    // 답과 상관없이 끝까지 찾아도 풀리는지.
    if (explore(board).solutions === 0) problems.push(`${where}: 끝까지 찾아도 풀리지 않음`);
  }
  return problems;
}

describe("문제 데이터", () => {
  it("36개, 묶음마다 12개, 쉬움 → 보통 → 어려움 차례", () => {
    expect(SOLOS).toHaveLength(36);
    expect(SOLOS.map((p) => p.level)).toEqual([...Array(12).fill(1), ...Array(12).fill(2), ...Array(12).fill(3)]);
  });

  it("FEN 이 판 칸 + 둘 차례 w 꼴이고, 앱이 읽어 다시 쓰면 같은 글이 된다", () => {
    for (const p of SOLOS) {
      expect(p.fen).toBe(`${toFen(parseFen(p.fen)).split(" ")[0]} w - - 0 1`);
    }
  });

  it("모든 문제가 검사를 통과한다(id, 궁 없음, 사·졸 자리, 기물 수, 답, 끝까지 찾기)", async () => {
    expect(await problemsOf(SOLOS)).toEqual([]);
  });

  it("기물 수는 쉬움 4~5, 보통 6~7, 어려움 8~10", () => {
    const range = { 1: [4, 5], 2: [6, 7], 3: [8, 10] } as const;
    for (const p of SOLOS) {
      const n = pieceCount(boardOf(p));
      expect(n).toBeGreaterThanOrEqual(range[p.level][0]);
      expect(n).toBeLessThanOrEqual(range[p.level][1]);
    }
  });

  describe("망가뜨린 사본은 검사에 걸린다", () => {
    it("기물 하나를 옮겨 풀리지 않게 하면", async () => {
      const p = SOLOS[0];
      const board = boardOf(p);
      // 첫 기물을 다른 빈 자리로 옮겨 풀리지 않는 판을 찾는다.
      const [from] = Object.keys(board);
      let broken: Board | null = null;
      for (let f = 0; f < FILES && !broken; f++) {
        for (let r = 1; r <= RANKS && !broken; r++) {
          const to = sq(f, r);
          if (board[to]) continue;
          const moved: Board = { ...board, [to]: board[from] };
          delete moved[from];
          if (explore(moved).solutions === 0) broken = moved;
        }
      }
      expect(broken).not.toBeNull();
      const copy = { ...p, id: await idOf(broken!), fen: `${toFen({ board: broken!, turn: "cho", halfmove: 0, fullmove: 1 }).split(" ")[0]} w - - 0 1` };
      const problems = await problemsOf([copy]);
      expect(problems.some((m) => m.includes("끝까지 찾아도 풀리지 않음"))).toBe(true);
    });

    it("id 를 바꾸면", async () => {
      const problems = await problemsOf([{ ...SOLOS[0], id: "0000000000" }]);
      expect(problems.some((m) => m.includes("id 가 판으로 계산한 값과 다름"))).toBe(true);
    });
  });
});

describe("번호와 다음 문제", () => {
  it("묶음 안 번호는 1부터, 다음 문제는 전체 순서의 다음이고 마지막 뒤에는 없다", () => {
    expect(numberOf(SOLOS[0])).toBe(1);
    expect(numberOf(SOLOS[12])).toBe(1);
    expect(numberOf(SOLOS[11])).toBe(12);
    expect(nextOf(SOLOS[11])).toBe(SOLOS[12]);
    expect(nextOf(SOLOS[35])).toBeNull();
  });

  it("푼 기록에서 데이터에 있는 id 만 센다", () => {
    expect(solvedIdsIn([SOLOS[0].id, "없는id", SOLOS[5].id], SOLOS)).toEqual(new Set([SOLOS[0].id, SOLOS[5].id]));
  });
});
