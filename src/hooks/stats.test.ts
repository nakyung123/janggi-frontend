// 내 전적과 실력 점수
//
// 고정된 판 몇 개를 넣고 나오는 숫자를 단정한다. 점수 기대값은 Elo 식을 따로 손으로(node)
// 계산해 적었다 - 이 파일이 같은 계산을 한 번 더 하면 계산이 틀려도 같이 틀린다.

import { describe, expect, it } from "vitest";
import type { ArchivedGame, ArchivedKind } from "../janggi/archive";
import type { Side } from "../janggi/pieces";
import type { MoveGrade, ReviewedMove } from "../janggi/review";
import { accuracyOf } from "../janggi/review";
import { START_RATING } from "../engine/ratings";
import type { ServerSummary } from "../server/api";
import { computeStats } from "./stats";

let next = 0;

/** 서버 목록 한 줄. 따로 안 주면 12급과 초로 둬서 이긴 판이다. */
function 서버(over: Partial<ServerSummary> = {}): ServerSummary {
  next += 1;
  return {
    id: next,
    clientId: `s${next}`,
    endedAt: next * 1_000,
    mySide: "cho",
    levelId: "k12",
    levelName: "12급",
    variant: "janggi",
    resultKind: "checkmate",
    resultWinner: "cho",
    moves: 40,
    reviewed: false,
    lastFen: null,
    ...over,
  };
}

/** 복기 한 줄. 이 계산이 보는 칸(수 번호·둔 쪽·등급·승률 하락)만 뜻이 있다. */
function 수(index: number, mover: Side, grade: MoveGrade, winDrop: number): ReviewedMove {
  return {
    index, mover, played: "a4a5", playedNotation: "71졸61",
    best: "a4a5", bestNotation: "71졸61",
    scoreBefore: 0, scoreAfter: 0, loss: 0, winDrop, grade,
    note: { verdict: null, best: null, bestDoes: null, after: null },
  };
}

/** 이 기기의 판. 따로 안 주면 12급과 초로 둬서 이긴 판이고 복기가 없다. */
function 기기(over: Partial<ArchivedGame> & { kind?: ArchivedKind; winner?: Side | null } = {}): ArchivedGame {
  next += 1;
  const { kind = "checkmate", winner = "cho", ...rest } = over;
  return {
    id: `l${next}`,
    endedAt: next * 1_000,
    mySide: "cho",
    levelId: "k12",
    levelName: "12급",
    variant: "janggi",
    result: { kind, winner },
    history: [],
    reviewed: null,
    ...rest,
  };
}

const 아무것도안올림 = () => false;
const 다올림 = () => true;

describe("표본이 없을 때", () => {
  it("0판이면 점수는 null, 나머지는 빈 목록이다 - 처음 점수로 채우지 않는다", () => {
    expect(computeStats({ server: [], local: [], uploaded: 아무것도안올림 })).toEqual({
      counted: 0, rating: null, byLevel: [], accuracy: [], mistakes: [],
    });
  });

  it("셀 판이 하나도 없으면(불러온 기보·안 끝난 판뿐) 0판과 같다", () => {
    const s = computeStats({
      server: [서버({ resultKind: "record" }), 서버({ resultKind: "abandoned", resultWinner: null })],
      local: [],
      uploaded: 아무것도안올림,
    });
    expect(s.counted).toBe(0);
    expect(s.rating).toBeNull();
    expect(s.byLevel).toEqual([]);
  });
});

describe("실력 점수", () => {
  it("화면 점수는 계산한 점수에 1000 을 더한 것이다 - 처음 점수(12급)는 1316", () => {
    expect(Math.round(START_RATING + 1000)).toBe(1316);
  });

  it("같은 점수의 상대를 이기면 +20, 비기면 그대로, 지면 -20 (처음 10판은 K=40)", () => {
    const 한판 = (resultWinner: string | null) =>
      computeStats({ server: [서버({ resultWinner })], local: [], uploaded: 아무것도안올림 }).rating!.value;
    expect(한판("cho")).toBe(1336);
    expect(한판(null)).toBe(1316);
    expect(한판("han")).toBe(1296);
  });

  it("1판이어도 점수와 이력을 준다. 이력 길이가 센 판 수다", () => {
    const s = computeStats({ server: [서버({ clientId: "a", endedAt: 5 })], local: [], uploaded: 아무것도안올림 });
    expect(s.counted).toBe(1);
    expect(s.rating).toEqual({
      value: 1336,
      nearestLevelId: "k12",
      history: [{ clientId: "a", endedAt: 5, levelId: "k12", value: 1336 }],
    });
  });

  it("센 판이 열 판을 넘으면 K 가 20 으로 줄어든다", () => {
    // 같은 점수끼리 비기면 점수가 그대로라, 열째·열한째 판을 같은 자리에서 이길 수 있다.
    const 비김 = (n: number) => Array.from({ length: n }, () => 서버({ resultWinner: null }));
    const 열째에이김 = computeStats({ server: [...비김(9), 서버()], local: [], uploaded: 아무것도안올림 });
    const 열한째에이김 = computeStats({ server: [...비김(10), 서버()], local: [], uploaded: 아무것도안올림 });
    expect(열째에이김.rating!.value).toBe(1336);
    expect(열한째에이김.rating!.value).toBe(1326);
  });

  it("센 상대에게 이기면 많이, 약한 상대에게 지면 많이 움직인다", () => {
    // 316 이 920(1급)을 이기면 기대값 0.030 → +38.8. 316 이 -13(18급)에게 지면 기대값 0.87 → -34.8.
    const 이김 = computeStats({ server: [서버({ levelId: "k1" })], local: [], uploaded: 아무것도안올림 });
    const 짐 = computeStats({ server: [서버({ levelId: "k18", resultWinner: "han" })], local: [], uploaded: 아무것도안올림 });
    expect(이김.rating!.value).toBe(1355);
    expect(짐.rating!.value).toBe(1282);
  });

  it("한으로 둬서 한이 이기면 내가 이긴 판이다", () => {
    const s = computeStats({
      server: [서버({ mySide: "han", resultWinner: "han" })], local: [], uploaded: 아무것도안올림,
    });
    expect(s.rating!.value).toBe(1336);
  });

  it("끝난 때 순서로 센다 - 받은 순서와 상관없다", () => {
    const 앞 = 서버({ clientId: "앞", endedAt: 100, levelId: "k1" });
    const 뒤 = 서버({ clientId: "뒤", endedAt: 200, levelId: "k18", resultWinner: "han" });
    const 바로 = computeStats({ server: [앞, 뒤], local: [], uploaded: 아무것도안올림 });
    const 거꾸로 = computeStats({ server: [뒤, 앞], local: [], uploaded: 아무것도안올림 });
    expect(거꾸로).toEqual(바로);
    expect(바로.rating!.history.map((p) => [p.clientId, p.value])).toEqual([["앞", 1355], ["뒤", 1320]]);
    // 순서가 반대였다면 1321 이다. 순서가 실제로 숫자를 바꾼다는 것을 보여 둔다.
    const 시각반대 = computeStats({
      server: [{ ...앞, endedAt: 300 }, 뒤], local: [], uploaded: 아무것도안올림,
    });
    expect(시각반대.rating!.value).toBe(1321);
  });

  it("셀 수 없는 판은 뺀다 - 불러온 기보, 안 끝난 판, 모르는 급수, 이상한 진영", () => {
    const s = computeStats({
      server: [
        서버({ clientId: "셈" }),
        서버({ resultKind: "record" }),
        서버({ resultKind: "abandoned", resultWinner: null }),
        서버({ levelId: "" }),
        서버({ levelId: "k99" }),
        서버({ mySide: "both" }),
        서버({ resultKind: "알수없음" }),
        서버({ resultWinner: "nobody" }),
      ],
      local: [],
      uploaded: 아무것도안올림,
    });
    expect(s.counted).toBe(1);
    expect(s.rating!.history.map((p) => p.clientId)).toEqual(["셈"]);
  });

  it("끝나는 일곱 가지는 모두 센다. 기권·시간패도 진 판이다", () => {
    const kinds = ["checkmate", "stalemate", "points", "bikjang", "passes", "resign", "flag"];
    const s = computeStats({
      server: kinds.map((resultKind) => 서버({ resultKind, resultWinner: "han" })),
      local: [],
      uploaded: 아무것도안올림,
    });
    expect(s.counted).toBe(7);
    expect(s.byLevel).toEqual([{ levelId: "k12", levelName: "12급", played: 7, won: 0, drawn: 0, lost: 7 }]);
  });
});

describe("어느 판을 세나 - 서버에 올라간 판만", () => {
  it("이 기기에만 있고 안 올린 판은 세지 않는다", () => {
    const s = computeStats({ server: [], local: [기기()], uploaded: 아무것도안올림 });
    expect(s.counted).toBe(0);
  });

  it("방금 올려 서버 목록에 아직 없는 판은 올린 기록으로 센다", () => {
    const s = computeStats({ server: [], local: [기기()], uploaded: 다올림 });
    expect(s.counted).toBe(1);
  });

  it("서버와 이 기기에 같은 판이 있으면 한 번만 센다", () => {
    const 판 = 기기({ id: "같은판" });
    const s = computeStats({
      server: [서버({ clientId: "같은판", endedAt: 판.endedAt })], local: [판], uploaded: 다올림,
    });
    expect(s.counted).toBe(1);
  });
});

describe("급수별 전적", () => {
  it("약한 급수부터, 둔 급수만, 판 수로 준다(퍼센트 아님)", () => {
    const s = computeStats({
      server: [
        서버({ levelId: "k5", levelName: "5급", resultWinner: "han" }),
        서버({ levelId: "k12" }),
        서버({ levelId: "k12", resultWinner: null }),
        서버({ levelId: "k12", resultWinner: "han" }),
        서버({ levelId: "k12" }),
      ],
      local: [],
      uploaded: 아무것도안올림,
    });
    expect(s.byLevel).toEqual([
      { levelId: "k12", levelName: "12급", played: 4, won: 2, drawn: 1, lost: 1 },
      { levelId: "k5", levelName: "5급", played: 1, won: 0, drawn: 0, lost: 1 },
    ]);
  });
});

describe("정확도와 실수 횟수", () => {
  const 복기 = [
    수(1, "cho", "best", 0),
    수(2, "han", "blunder", 0.4), // 상대 수 - 세지 않는다
    수(5, "cho", "blunder", 0.3),
    수(25, "cho", "inaccuracy", 0.1),
    수(27, "cho", "good", 0.01),
    수(70, "cho", "blunder", 0.25),
  ];

  it("정확도는 review.ts 의 accuracyOf 그대로다", () => {
    const 판 = 기기({ reviewed: 복기 });
    const s = computeStats({ server: [], local: [판], uploaded: 다올림 });
    expect(s.accuracy).toEqual([
      { clientId: 판.id, endedAt: 판.endedAt, levelId: "k12", value: accuracyOf(복기, "cho") },
    ]);
  });

  it("실수는 내 수만, 몇 수째 구간(1~20, 21~60, 61~)으로 나눠 센다", () => {
    const 판 = 기기({ reviewed: 복기 });
    const s = computeStats({ server: [], local: [판], uploaded: 다올림 });
    expect(s.mistakes).toEqual([{
      clientId: 판.id,
      endedAt: 판.endedAt,
      levelId: "k12",
      blunders: 2,
      inaccuracies: 1,
      myMoves: 5,
      byPhase: [
        { from: 1, to: 20, blunders: 1, inaccuracies: 0, myMoves: 2 },
        { from: 21, to: 60, blunders: 0, inaccuracies: 1, myMoves: 2 },
        { from: 61, to: null, blunders: 1, inaccuracies: 0, myMoves: 1 },
      ],
    }]);
  });

  it("점수에 안 세는 판은 복기가 있어도 넣지 않는다", () => {
    const 불러온기보 = 기기({ kind: "record", reviewed: 복기 }); // 올렸지만 점수에 안 센다
    const 안올린판 = 기기({ reviewed: 복기 });
    const s = computeStats({
      server: [],
      local: [불러온기보, 안올린판],
      uploaded: (id) => id === 불러온기보.id,
    });
    expect(s.counted).toBe(0);
    expect(s.accuracy).toEqual([]);
    expect(s.mistakes).toEqual([]);
  });

  it("다른 기기에서만 복기한 판(서버 목록에 복기했다고만 있는 판)은 빠진다", () => {
    const s = computeStats({ server: [서버({ reviewed: true })], local: [], uploaded: 아무것도안올림 });
    expect(s.counted).toBe(1);
    expect(s.accuracy).toEqual([]);
    expect(s.mistakes).toEqual([]);
  });

  it("복기한 판만, 끝난 때 순서로 준다", () => {
    const 늦은 = 기기({ endedAt: 900, reviewed: 복기 });
    const 복기안함 = 기기({ endedAt: 500 });
    const 이른 = 기기({ endedAt: 100, reviewed: 복기 });
    const s = computeStats({ server: [], local: [늦은, 복기안함, 이른], uploaded: 다올림 });
    expect(s.counted).toBe(3);
    expect(s.accuracy.map((a) => a.clientId)).toEqual([이른.id, 늦은.id]);
    expect(s.mistakes.map((m) => m.clientId)).toEqual([이른.id, 늦은.id]);
  });

  it("내가 둔 수가 복기에 없으면 정확도를 0 으로 채우지 않고 뺀다", () => {
    const 판 = 기기({ reviewed: [수(2, "han", "best", 0)] });
    const s = computeStats({ server: [], local: [판], uploaded: 다올림 });
    expect(s.accuracy).toEqual([]);
    expect(s.mistakes[0].myMoves).toBe(0);
  });
});
