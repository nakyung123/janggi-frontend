// 행마 - 기물 하나가 판 위에서 갈 수 있는 자리
//
// 장군을 보지 않는 행마 계산이다. 둘 수 있는 수는 엔진이 정한다.
//
// 이 결과에는 둘 수 없는 수가 섞인다. 내 궁을 장군에 두는 수, 장군을 풀지 못하는 수, 빅장에
// 걸리는 수를 거르지 않는다 - 그러려면 판 전체를 봐야 한다. 대국·힌트·문제처럼 "둘 수 있는
// 수" 가 필요한 곳은 엔진의 합법수를 쓴다(useBoardTouch). 여기는 배우기 화면이 엔진 없이
// 기물 하나의 움직임을 보이려고 둔다.
//
// 궁성 대각선: 궁성 아홉 자리에는 네 귀와 가운데를 잇는 X 자 선이 그어져 있다. 궁·사·차·포·
// 졸은 이 선 위에서 대각선으로도 간다. 마·상은 이 선을 쓰지 않는다.

import type { Board, Square } from "./board";
import { FILES, RANKS, fileIdxOf, palaceOf, rankOf, sq } from "./board";
import type { Side } from "./pieces";
import { sideOf, typeOf } from "./pieces";

/** [가로(파일) 칸 수, 세로(랭크) 칸 수]. 세로는 위(한 쪽)가 +다. */
type Step = readonly [number, number];

const STRAIGHT: Step[] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];
const DIAGONAL: Step[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** s 에서 step 만큼 간 자리. 판 밖이면 null. */
function shift(s: Square, [df, dr]: Step): Square | null {
  const f = fileIdxOf(s) + df;
  const r = rankOf(s) + dr;
  return f >= 0 && f < FILES && r >= 1 && r <= RANKS ? sq(f, r) : null;
}

/** 궁성 가운데. 대각선 선은 모두 여기를 지난다. */
const PALACE_CENTERS: Square[] = ["e2", "e9"];

/**
 * a 와 b 가 대각선으로 한 칸 붙은 두 자리일 때, 그 사이에 궁성 선이 그어져 있는지.
 * 같은 궁성 안이고 한쪽이 가운데여야 한다. 변 가운데끼리(d2-e1)는 대각선으로 붙어 있어도
 * 선이 없다.
 */
function onPalaceLine(a: Square, b: Square): boolean {
  const palace = palaceOf(a);
  return (
    palace !== null &&
    palace === palaceOf(b) &&
    (PALACE_CENTERS.includes(a) || PALACE_CENTERS.includes(b))
  );
}

/** 곧은 걸음은 어디서나, 대각선 걸음은 궁성 선 위에서만. */
const canStep = (from: Square, to: Square, step: Step): boolean =>
  step[0] === 0 || step[1] === 0 || onPalaceLine(from, to);

/** 곧은 걸음에 수직인 두 방향. 마·상이 첫 칸 뒤에 꺾는 쪽이다. */
const sidewaysOf = ([df]: Step): Step[] =>
  df === 0
    ? [
        [1, 0],
        [-1, 0],
      ]
    : [
        [0, 1],
        [0, -1],
      ];

/** 졸·병의 앞. 초는 아래에 앉아 위(랭크가 커지는 쪽)가 앞이고, 한은 반대다. */
const forward = (side: Side): number => (side === "cho" ? 1 : -1);

/**
 * from 자리의 기물이 행마로 갈 수 있는 자리. 기물이 없으면 빈 배열.
 *
 * 내 기물이 있는 자리로는 못 가고, 상대 기물이 있는 자리는 잡는다.
 */
export function pieceMoves(board: Board, from: Square): Square[] {
  const piece = board[from];
  if (!piece) return [];
  const side = sideOf(piece);
  const mine = (s: Square) => board[s] !== undefined && sideOf(board[s]) === side;
  const out: Square[] = [];

  switch (typeOf(piece)) {
    case "k":
    case "a":
      // 제 궁성 안에서 선을 따라 한 칸.
      for (const step of [...STRAIGHT, ...DIAGONAL]) {
        const to = shift(from, step);
        if (to && palaceOf(to) === side && canStep(from, to, step) && !mine(to)) out.push(to);
      }
      return out;

    case "r":
      // 막힐 때까지 곧게. 궁성 선 위에서는 대각선으로도.
      for (const step of [...STRAIGHT, ...DIAGONAL]) {
        let at = from;
        for (let to = shift(at, step); to && canStep(at, to, step); to = shift(at, step)) {
          if (board[to]) {
            if (!mine(to)) out.push(to);
            break;
          }
          out.push(to);
          at = to;
        }
      }
      return out;

    case "c":
      // 기물 하나를 넘어야 간다. 포는 넘지도 잡지도 못한다.
      for (const step of [...STRAIGHT, ...DIAGONAL]) {
        let at = from;
        let jumped = false;
        for (let to = shift(at, step); to && canStep(at, to, step); to = shift(at, step)) {
          const there = board[to];
          if (there && typeOf(there) === "c") break;
          if (!jumped) {
            if (there) jumped = true;
          } else if (there) {
            if (!mine(to)) out.push(to);
            break;
          } else {
            out.push(to);
          }
          at = to;
        }
      }
      return out;

    case "n":
      // 한 칸 곧게, 한 칸 대각선. 첫 칸이 막히면(멱) 그쪽 두 자리에 못 간다.
      for (const step of STRAIGHT) {
        const leg = shift(from, step);
        if (!leg || board[leg]) continue;
        for (const [sf, sr] of sidewaysOf(step)) {
          const to = shift(leg, [step[0] + sf, step[1] + sr]);
          if (to && !mine(to)) out.push(to);
        }
      }
      return out;

    case "b":
      // 한 칸 곧게, 두 칸 대각선. 지나는 두 칸 가운데 하나라도 막히면 그 갈래는 못 간다.
      for (const step of STRAIGHT) {
        const leg = shift(from, step);
        if (!leg || board[leg]) continue;
        for (const [sf, sr] of sidewaysOf(step)) {
          const diagonal: Step = [step[0] + sf, step[1] + sr];
          const middle = shift(leg, diagonal);
          if (!middle || board[middle]) continue;
          const to = shift(middle, diagonal);
          if (to && !mine(to)) out.push(to);
        }
      }
      return out;

    case "p": {
      // 앞이나 옆으로 한 칸. 궁성 선 위에서는 대각선 앞으로도 한 칸. 뒤로는 못 간다.
      // 졸은 뒤로 못 가니 제 궁성에 들어갈 일이 없다 - 궁성 선은 곧 상대 궁성의 선이다.
      const ahead = forward(side);
      for (const step of [[0, ahead], [1, 0], [-1, 0], [1, ahead], [-1, ahead]] as Step[]) {
        const to = shift(from, step);
        if (to && canStep(from, to, step) && !mine(to)) out.push(to);
      }
      return out;
    }
  }
}
