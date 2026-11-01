// 기물 화면의 글과 미리 차려 둔 국면
//
// 글은 대한장기협회 누리집의 행마법을 우리 말로 다시 쓴 것이다. 판에 찍히는 갈 곳은 이 글이
// 아니라 행마 계산(janggi/moves.ts)이 정한다. 글과 판이 다른 말을 하면 안 되므로, 국면마다
// 찍힐 자리를 테스트(learn.test.tsx)가 손으로 따진 값과 맞춘다. 국면을 더하면 거기에도 적는다.
//
// 국면은 움직여 볼 초의 기물 하나와 막는 기물로 차린다. 막는 기물이 없으면 "빈 판" 이다.
// 포는 넘을 기물이 없으면 갈 곳이 없어서 첫 국면부터 넘을 기물을 둔다.

import type { Board, Square } from "../../janggi/board";
import type { PieceType } from "../../janggi/pieces";

export interface Scene {
  /** 국면 고르기 단추의 글자 */
  label: string;
  board: Board;
  /** 움직여 볼 기물의 자리. 이 기물만 집힌다. */
  from: Square;
  /** 이 국면에서 볼 것 */
  note: string;
}

export interface PieceLesson {
  type: PieceType;
  /** 기물 고르기 단추의 글자 */
  label: string;
  /** 설명의 이름. 졸은 진영마다 이름이 달라 둘 다 적는다. */
  name: string;
  /** 움직임 */
  moves: string;
  /** 덧붙이는 말 */
  notes: string[];
  scenes: Scene[];
}

const 멱 = "기물이 가는 길을 막는 자리를 '멱' 이라고 한다.";

export const PIECE_LESSONS: PieceLesson[] = [
  {
    type: "k",
    label: "궁",
    name: "궁",
    moves:
      "궁성 안에서만 움직인다. 선을 따라 한 칸 간다. 대각선은 선이 그어진 곳만 간다. 궁이 잡히면 진다.",
    notes: [],
    scenes: [
      {
        label: "궁성",
        board: { e2: "K" },
        from: "e2",
        note: "가운데에서는 여덟 방향으로 간다. 귀나 변으로 옮겨 보면 대각선은 선이 있는 쪽으로만 간다.",
      },
    ],
  },
  {
    type: "a",
    label: "사",
    name: "사",
    moves: "궁과 같다. 궁성 안에서 선을 따라 한 칸 간다.",
    notes: [],
    scenes: [
      {
        label: "궁성",
        board: { d1: "A" },
        from: "d1",
        note: "궁성 귀에서는 곧게 두 자리, 가운데로 가는 대각선 한 자리다.",
      },
    ],
  },
  {
    type: "r",
    label: "차",
    name: "차",
    moves: "가로·세로로 몇 칸이든 간다. 다른 기물을 넘지 못한다. 궁성 안에서는 대각선 선도 탄다.",
    notes: [],
    scenes: [
      {
        label: "빈 판",
        board: { e5: "R" },
        from: "e5",
        note: "가로줄과 세로줄을 따라 몇 칸이든 간다.",
      },
      {
        label: "막힐 때",
        board: { e5: "R", e7: "P", c5: "p" },
        from: "e5",
        note: "위의 졸(내 기물) 앞에서 멈춘다. 왼쪽의 병(상대 기물)은 잡을 수 있고, 그 너머로는 못 간다.",
      },
      {
        label: "궁성",
        board: { d8: "R" },
        from: "d8",
        note: "궁성 안에서는 대각선 선을 따라서도 간다.",
      },
    ],
  },
  {
    type: "c",
    label: "포",
    name: "포",
    moves:
      "차처럼 곧게 가지만 반드시 기물 하나를 넘어야 한다. 넘는 기물은 내 편이든 상대 편이든 된다. 포는 넘지 못하고 잡지도 못한다. 궁성 안에서는 대각선으로도 넘는다.",
    notes: [],
    scenes: [
      {
        label: "넘기",
        board: { b3: "C", b5: "P", b9: "r" },
        from: "b3",
        note: "졸 하나를 넘어 그 뒤로 간다. 넘은 뒤 처음 만난 상대 기물(차)은 잡는다.",
      },
      {
        label: "포를 만나면",
        board: { b5: "C", b8: "c", d5: "P", g5: "c" },
        from: "b5",
        note: "위로는 포를 넘지 못한다. 오른쪽은 졸을 넘어 가지만, 그 뒤의 포는 잡지 못한다.",
      },
      {
        label: "궁성",
        board: { d1: "C", e2: "A" },
        from: "d1",
        note: "궁성에서는 가운데 기물(사)을 넘어 대각선으로 간다.",
      },
    ],
  },
  {
    type: "n",
    label: "마",
    name: "마",
    moves: "한 칸 곧게 간 뒤 한 칸 대각선으로 간다. 첫 칸이 막히면 못 간다.",
    notes: ["마와 상은 궁성 대각선을 첫 걸음으로 쓰지 않는다.", 멱],
    scenes: [
      {
        label: "빈 판",
        board: { e5: "N" },
        from: "e5",
        note: "갈 수 있는 자리가 여덟이다.",
      },
      {
        label: "멱",
        board: { e5: "N", e6: "P" },
        from: "e5",
        note: "위로 가는 첫 칸이 막혀서 위쪽 두 자리에 못 간다.",
      },
    ],
  },
  {
    type: "b",
    label: "상",
    name: "상",
    moves: "한 칸 곧게 간 뒤 두 칸 대각선으로 간다. 지나는 칸이 하나라도 막히면 못 간다.",
    notes: ["마와 상은 궁성 대각선을 첫 걸음으로 쓰지 않는다.", 멱],
    scenes: [
      {
        label: "빈 판",
        board: { e5: "B" },
        from: "e5",
        note: "갈 수 있는 자리가 여덟이다.",
      },
      {
        label: "멱",
        board: { e5: "B", e6: "P", g4: "P" },
        from: "e5",
        note: "위로 가는 첫 칸이 막혀 위쪽 두 갈래가 다 막혔다. 오른쪽 아래 갈래는 대각선 첫 칸이 막혀 그 한 자리만 못 간다.",
      },
    ],
  },
  {
    type: "p",
    label: "졸",
    name: "졸·병",
    moves:
      "앞이나 옆으로 한 칸 간다. 뒤로는 못 간다. 상대 궁성 안에서는 대각선 선을 따라 앞으로 한 칸 갈 수 있다.",
    notes: ["졸은 초의 것, 병은 한의 것이다. 움직임은 같다."],
    scenes: [
      {
        label: "기본",
        board: { e4: "P" },
        from: "e4",
        note: "앞이나 옆으로 한 칸 간다.",
      },
      {
        label: "상대 궁성",
        board: { e9: "P" },
        from: "e9",
        note: "상대 궁성 안에서는 선을 따라 대각선 앞으로도 간다. 뒤쪽 대각선으로는 못 간다.",
      },
    ],
  },
];
