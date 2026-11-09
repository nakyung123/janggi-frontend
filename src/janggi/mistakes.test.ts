// 내 실수 문제 - 어느 자리가 문제가 되나, 둔 수를 어떻게 판정하나

import { describe, expect, it } from "vitest";
import type { ArchivedGame, ArchivedKind } from "./archive";
import { START_FEN } from "./board";
import type { HistoryEntry } from "./history";
import { nextEntry, startHistory } from "./history";
import type { Mistake } from "./mistakes";
import { flatMistakes, isRight, measuredVerdict, mistakesOf, quickVerdict } from "./mistakes";
import { splitMove } from "./notation";
import type { Side } from "./pieces";
import type { MoveGrade, ReviewedMove } from "./review";

/** 졸만 한 칸씩 올리는 수순. 초 → 한 → 초 … */
const MOVES = ["a4a5", "a7a6", "c4c5", "c7c6", "e4e5", "e7e6", "g4g5", "g7g6"];

function historyOf(moves: string[]): HistoryEntry[] {
  const h = startHistory(START_FEN);
  for (const m of moves) {
    const { from, to } = splitMove(m);
    h.push(nextEntry(h[h.length - 1].fen, from, to));
  }
  return h;
}

interface Mark {
  grade: MoveGrade;
  /** AI 의 수. 없으면 둔 수(최선수) */
  best?: string | null;
  /** 복기에 적힌 둔 수. 없으면 기보의 수 */
  played?: string;
}

/**
 * 복기한 판. marks 에 없는 수는 최선수다. 수 번호(index)는 기보 번호 - 1 이 첫 수다.
 */
function 판(
  id: string,
  endedAt: number,
  marks: Record<number, Mark>,
  over: { mySide?: Side; kind?: ArchivedKind; moves?: string[]; reviewed?: null } = {}
): ArchivedGame {
  const moves = over.moves ?? MOVES;
  const history = historyOf(moves);
  const reviewed: ReviewedMove[] = moves.map((m, i) => {
    const index = i + 1;
    const mark = marks[index] ?? { grade: "best" };
    const best = mark.best === undefined ? m : mark.best;
    return {
      index,
      mover: history[index].mover!,
      played: mark.played ?? m,
      playedNotation: history[index].notation,
      best,
      bestNotation: best ? `${best}표기` : null,
      scoreBefore: 0,
      scoreAfter: 0,
      loss: 0,
      winDrop: mark.grade === "blunder" ? 0.3 : mark.grade === "inaccuracy" ? 0.1 : 0,
      grade: mark.grade,
      note: { verdict: null, best: null, bestDoes: null, after: null },
    };
  });
  return {
    id,
    endedAt,
    mySide: over.mySide ?? "cho",
    levelId: "k12",
    levelName: "12급",
    variant: "janggi",
    result: { kind: over.kind ?? "resign", winner: "han" },
    history,
    reviewed: over.reviewed === null ? null : reviewed,
  };
}

const ids = (games: ArchivedGame[]) => flatMistakes(mistakesOf(games)).map((m) => m.id);

describe("어느 자리가 문제가 되나", () => {
  it("내가 둔 큰 실수만 낸다 - 상대의 수, 아쉬운 수, 최선수는 내지 않는다", () => {
    const g = 판("g1", 10, {
      1: { grade: "blunder", best: "c4c5" }, // 초(나)의 큰 실수
      2: { grade: "blunder", best: "c7c6" }, // 한(AI)의 큰 실수
      3: { grade: "inaccuracy", best: "e4e5" }, // 초의 아쉬운 수
      5: { grade: "blunder", best: "g4g5" }, // 초의 큰 실수
    });
    expect(ids([g])).toEqual(["g1:1", "g1:5"]);
  });

  it("한을 잡은 판은 한의 수가 내 수다", () => {
    const g = 판("g1", 10, { 1: { grade: "blunder", best: "c4c5" }, 4: { grade: "blunder", best: "e7e6" } }, { mySide: "han" });
    expect(ids([g])).toEqual(["g1:4"]);
  });

  it("복기하지 않은 판은 문제가 되지 않고, 복기한 판으로 세지도 않는다", () => {
    const list = mistakesOf([판("g1", 10, { 1: { grade: "blunder", best: "c4c5" } }, { reviewed: null })]);
    expect(list.groups).toEqual([]);
    expect(list.reviewedGames).toBe(0);
  });

  it("불러온 기보(결과 record·abandoned)는 문제가 되지 않고, 복기한 판으로 세지도 않는다", () => {
    const blunder = { 1: { grade: "blunder" as const, best: "c4c5" } };
    const list = mistakesOf([판("g1", 10, blunder, { kind: "record" }), 판("g2", 20, blunder, { kind: "abandoned" })]);
    expect(list.groups).toEqual([]);
    expect(list.reviewedGames).toBe(0);
  });

  it("10수 넘게 두다 버려 기권패로 남은 판(resign)은 낸다", () => {
    expect(ids([판("g1", 10, { 1: { grade: "blunder", best: "c4c5" } }, { kind: "resign" })])).toEqual(["g1:1"]);
  });

  it("복기한 판에 큰 실수가 없으면 목록은 비고, 복기한 판으로는 센다", () => {
    const list = mistakesOf([판("g1", 10, {}), 판("g2", 20, { 1: { grade: "inaccuracy", best: "c4c5" } })]);
    expect(list.groups).toEqual([]);
    expect(list.reviewedGames).toBe(2);
  });

  it("AI 의 수가 한수쉼이거나 없는 자리는 내지 않는다(이 화면에 한수쉼 단추가 없다)", () => {
    const g = 판("g1", 10, {
      1: { grade: "blunder", best: "e2e2" },
      3: { grade: "blunder", best: null },
      5: { grade: "blunder", best: "g4g5" },
    });
    expect(ids([g])).toEqual(["g1:5"]);
  });

  it("복기에 적힌 둔 수가 기보의 수와 다르면 내지 않는다", () => {
    const g = 판("g1", 10, { 1: { grade: "blunder", best: "c4c5", played: "i4i5" }, 3: { grade: "blunder", best: "a5a6" } });
    expect(ids([g])).toEqual(["g1:3"]);
  });

  it("같은 국면이 여러 판에 있으면 가장 최근 판의 것 하나만 낸다", () => {
    const old = 판("old", 10, { 1: { grade: "blunder", best: "c4c5" }, 3: { grade: "blunder", best: "e4e5" } });
    const recent = 판("new", 20, { 1: { grade: "blunder", best: "c4c5" } });
    // 넘기는 순서와 상관없이 끝난 때로 고른다.
    expect(ids([old, recent])).toEqual(["new:1", "old:3"]);
  });

  it("최근 판부터, 판 안에서는 수 순서로 선다. 카드에는 그 판의 급수·끝난 때·결과가 붙는다", () => {
    const a = 판("a", 10, { 5: { grade: "blunder", best: "g4g5" } }, { moves: ["i4i5", ...MOVES.slice(1)] });
    const b = 판("b", 30, { 3: { grade: "blunder", best: "e4e5" }, 1: { grade: "blunder", best: "c4c5" } });
    const list = mistakesOf([a, b]);
    expect(list.groups.map((g) => [g.gameId, g.endedAt, g.levelName, g.result.kind])).toEqual([
      ["b", 30, "12급", "resign"],
      ["a", 10, "12급", "resign"],
    ]);
    expect(ids([a, b])).toEqual(["b:1", "b:3", "a:5"]);
  });

  it("문제 국면은 그 수를 두기 직전이고, 엔진에 넘길 수순은 그 앞 수 전부다. 번호는 내 수만 센다", () => {
    const g = 판("g1", 10, { 5: { grade: "blunder", best: "g4g5" } });
    const [m] = flatMistakes(mistakesOf([g]));
    const history = historyOf(MOVES);
    expect(m).toMatchObject<Partial<Mistake>>({
      index: 5,
      nth: 3,
      mySide: "cho",
      variant: "janggi",
      startFen: START_FEN,
      moves: MOVES.slice(0, 4),
      fen: history[4].fen,
      played: "e4e5",
      playedNotation: history[5].notation,
      best: "g4g5",
      bestNotation: "g4g5표기",
    });
  });
});

// --- 판정 ------------------------------------------------------------------------

/** 초 승률이 p 가 되는 점수(winChance 를 거꾸로). */
const scoreFor = (p: number) => Math.log(p / (1 - p)) / 0.18;
const look = (score: number, mate: number | null = null) => ({ score, mate });

describe("판정", () => {
  const [m] = flatMistakes(mistakesOf([판("g1", 10, { 1: { grade: "blunder", best: "c4c5" } })]));

  it("복기에 적힌 AI 의 수는 엔진을 기다리지 않고 맞음, 그때 둔 수는 틀림, 그 밖은 엔진이 잰다", () => {
    expect(quickVerdict(m, "c4c5")).toEqual({ kind: "best" });
    expect(quickVerdict(m, "a4a5")).toEqual({ kind: "again" });
    expect(quickVerdict(m, "e4e5")).toBeNull();
    expect(isRight({ kind: "best" })).toBe(true);
    expect(isRight({ kind: "again" })).toBe(false);
  });

  it("둔 쪽 승률이 5%p 보다 덜 떨어지면 좋은 수(맞음), 5%p 넘게 떨어지면 아쉬운 수, 20%p 넘게면 큰 실수", () => {
    const at = (drop: number) => measuredVerdict("cho", look(scoreFor(0.6)), look(scoreFor(0.6 - drop)));
    expect(at(0.049)).toMatchObject({ kind: "measured", grade: "good" });
    expect(at(0.051)).toMatchObject({ kind: "measured", grade: "inaccuracy" });
    expect(at(0.199)).toMatchObject({ kind: "measured", grade: "inaccuracy" });
    expect(at(0.201)).toMatchObject({ kind: "measured", grade: "blunder" });
    expect(isRight(at(0.049))).toBe(true);
    expect(isRight(at(0.051))).toBe(false);
  });

  it("승률은 둔 쪽에서 본 값이다 - 한이 두면 초의 점수가 오를수록 나쁜 수다", () => {
    // 초 40% → 46%: 한은 60% → 54%, 6%p 떨어졌다.
    const v = measuredVerdict("han", look(scoreFor(0.4)), look(scoreFor(0.46)));
    expect(v).toEqual({ kind: "measured", grade: "inaccuracy", before: 60, after: 54 });
    // 초 40% → 38%: 한의 승률은 올랐다. 떨어진 폭 0, 좋은 수.
    expect(measuredVerdict("han", look(scoreFor(0.4)), look(scoreFor(0.38)))).toMatchObject({ grade: "good", before: 60, after: 62 });
  });

  it("외통 점수는 끝까지 잘라 본다 - 외통을 당하는 수는 큰 실수, 승률 0%", () => {
    expect(measuredVerdict("cho", look(1.2), look(0, -3))).toMatchObject({ grade: "blunder", after: 0 });
    expect(measuredVerdict("cho", look(0, 5), look(0, 3))).toMatchObject({ grade: "good", before: 100, after: 100 });
  });
});
