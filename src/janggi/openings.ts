// 포진 - 다섯 포진을 처음 차림에서 그 모양까지 두는 수("모양 만드는 수")
//
// 포진 다섯(귀마·원앙마·면상·양귀마·양귀상)의 이름과 모양은 대한장기협회 누리집의 장기 용어를
// 따른다. 포진마다 쉽게 되는 차림은 두 출처가 같이 맞는 것만 넣었다 - 엔진 합법수로 센 최소
// 수(조사 세션 2026-11-02 의 시험 1)와 나무위키 "장기" 문서(더위키 사본)의 차림별 포진 표.
// 그래서 귀마에 상마마상을 넣지 않았다. 엔진으로는 그 차림에서도 마 하나가 1수에 귀로 가지만,
// 출처 표는 그 차림을 양귀마로 본다.
//
// 수순은 정석이 아니다. 상대(한)가 매번 한수쉼을 한다고 치고 초만 둔 길이다. 조사 시험 1이
// 찾은 수순을 옮겼고, 양귀마만 졸을 맨 뒤로 옮겼다 - 협회 뜻이 "귀에 마 둘을 놓은 뒤 가운데
// 졸을 한 칸 올린다" 는 순서다.
//
// 화면에는 엔진이 없다. 수가 둘 수 있는 수인지, 끝 국면이 그 포진 모양인지는 openings.test.ts
// 가 앱과 같은 엔진으로 세 규칙에서 본다.

import type { Position } from "./board";
import { START_FEN, applyMove, parseFen } from "./board";
import { splitMove } from "./notation";
import type { Side } from "./pieces";
import { SETUPS, applySetup } from "./setups";

export type OpeningId = "gwima" | "wonang" | "myeonsang" | "yanggwima" | "yanggwisang";

export interface OpeningLine {
  /** 차림 이름. setups.ts 의 SETUPS[].name 중 하나다. 양쪽이 같은 차림이다. */
  setup: string;
  /** 초의 수(엔진 표기). 한은 그 사이마다 한수쉼을 한다고 친다. */
  moves: string[];
}

export interface Opening {
  id: OpeningId;
  /** 고르기 단추의 이름(예: 원앙마). 화면은 뒤에 "포진" 을 붙여 부른다. */
  name: string;
  /** 쉽게 되는 차림마다 하나. 대국 화면의 상차림 단추 순서다. */
  lines: OpeningLine[];
}

export const OPENINGS: readonly Opening[] = [
  {
    id: "gwima",
    name: "귀마",
    lines: [
      { setup: "마상마상", moves: ["g1f3"] },
      { setup: "상마상마", moves: ["c1d3"] },
    ],
  },
  {
    id: "wonang",
    name: "원앙마",
    lines: [{ setup: "마상상마", moves: ["e4d4", "b1c3", "h1g3", "c3e4"] }],
  },
  {
    id: "myeonsang",
    name: "면상",
    lines: [
      { setup: "상마마상", moves: ["c1d3", "b1e3"] },
      { setup: "마상마상", moves: ["g1f3", "h1e3"] },
      { setup: "상마상마", moves: ["c1d3", "b1e3"] },
    ],
  },
  {
    id: "yanggwima",
    name: "양귀마",
    lines: [{ setup: "상마마상", moves: ["c1d3", "g1f3", "e4e5"] }],
  },
  {
    id: "yanggwisang",
    name: "양귀상",
    lines: [{ setup: "마상상마", moves: ["d1e1", "f1f2", "e2d2", "c1f3", "g1d3"] }],
  },
];

/** 양쪽이 그 차림인 처음 판. 둘 차례는 초다. */
export function startOf(line: OpeningLine): Position {
  const setup = SETUPS.find((s) => s.name === line.setup);
  if (!setup) throw new Error(`없는 차림입니다: ${line.setup}`);
  const start = parseFen(START_FEN);
  return { ...start, board: applySetup(applySetup(start.board, "cho", setup), "han", setup) };
}

/** 한의 한수쉼. 궁을 제자리에 두는 수다(엔진도 이렇게 적는다). */
export function passOf(pos: Position, side: Side): string {
  const king = side === "cho" ? "K" : "k";
  const at = Object.keys(pos.board).find((s) => pos.board[s] === king);
  if (!at) throw new Error("궁이 없습니다");
  return at + at;
}

/** 처음 판에서 초가 step 수를 둔 국면. 한은 초의 수마다 한수쉼을 해서 둘 차례는 다시 초다. */
export function positionAt(line: OpeningLine, step: number): Position {
  let pos = startOf(line);
  for (const move of line.moves.slice(0, step)) {
    const { from, to } = splitMove(move);
    pos = applyMove(pos, from, to);
    const pass = splitMove(passOf(pos, "han"));
    pos = applyMove(pos, pass.from, pass.to);
  }
  return pos;
}
