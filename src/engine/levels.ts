// 급수 — 엔진 실력 단계
//
// 한 급수는 (Skill Level, 노드 수) 한 쌍이다. 어떻게 이 표가 나왔는지 적어둔다.
//
// 1. UCI_Elo 는 쓰지 않는다.
//    엔진에 UCI_LimitStrength / UCI_Elo(500~2850) 옵션이 있긴 하다. 그런데
//    장기 변형에서 Elo 500 과 2850 을 각각 돌려보면 둘 다 depth 15~16 으로
//    멀쩡한 수를 낸다. 이 환산표는 체스용이라 장기에는 눈금이 붙지 않는다.
//
// 2. Skill Level(-20~20) 은 제대로 먹힌다.
//    Skill 20 은 같은 국면에서 여섯 번 다 최선수를 고르고, Skill -20 은
//    최선수를 아예 고르지 않는다.
//
// 3. 시간이 아니라 노드로 자른다.
//    go nodes N 은 정확히 N 노드에서 끊긴다. 시간으로 자르면 빠른 PC 의
//    3급이 느린 PC 에서는 5급이 된다. 노드로 자르면 어느 기기에서나 같다.
//
// 4. 27칸의 간격은 자가대국으로 쟀다.
//    두 손잡이를 하나의 강도 곡선으로 묶고(t=0 이 가장 약함, t=1 이 가장 셈),
//    그 위의 기준점 13개끼리 수백 판을 붙여 Bradley-Terry 레이팅을 냈다.
//    그 레이팅 곡선 위에서 칸 사이가 고르게 벌어지도록 27개를 앉혔다.
//    스크립트는 scripts/ladder-selfplay.mjs, 결과는 docs/DECISIONS.md 에 있다.
//
//    급(18급~1급)은 사람이 이길 수 있는 아래쪽(한 수 15만 노드까지)에 몰아
//    촘촘히 나눴고, 단(1단~9단)이 그 위를 훑는다. 엔진끼리의 레이팅은 약한
//    쪽에서 납작해지지만(둘 다 실수하니 승패가 뒤집힌다) 사람 눈에는 전혀
//    다른 상대라서, 아래쪽에 칸을 더 줬다.
//
// 아래 한 줄 설명은 그 급수의 '느낌' 을 적은 것이지 측정한 값이 아니다.

import type { SearchLimits } from "./types";

export interface Level {
  id: string;
  /** 화면에 뜨는 이름 */
  name: string;
  /** 한 줄 설명 */
  desc: string;
  /** 엔진의 Skill Level. 낮을수록 최선수를 덜 고른다. */
  skill: number;
  /** 한 수에 허용하는 탐색량 */
  nodes: number;
}

/** 아래에서 위로 갈수록 세진다. */
export const LEVELS: Level[] = [
  { id: "k18", name: "18급", desc: "최선수를 거의 고르지 않는다. 기물을 그냥 내준다.", skill: -20, nodes: 1_500 },
  { id: "k17", name: "17급", desc: "눈앞의 공짜 기물도 자주 놓친다.", skill: -14, nodes: 4_600 },
  { id: "k16", name: "16급", desc: "잡을 수 있는 기물은 대개 잡는다.", skill: -12, nodes: 7_300 },
  { id: "k15", name: "15급", desc: "한 수 앞만 본다.", skill: -10, nodes: 10_000 },
  { id: "k14", name: "14급", desc: "맞바꿈을 손해 보며 한다.", skill: -9, nodes: 14_000 },
  { id: "k13", name: "13급", desc: "공짜로 기물을 주지는 않는다.", skill: -8, nodes: 18_000 },
  { id: "k12", name: "12급", desc: "포진 비슷한 것을 갖춘다.", skill: -7, nodes: 23_000 },
  { id: "k11", name: "11급", desc: "두 수짜리 수는 놓치지 않는다.", skill: -5, nodes: 29_000 },
  { id: "k10", name: "10급", desc: "단순한 맞바꿈은 계산한다.", skill: -4, nodes: 35_000 },
  { id: "k9", name: "9급", desc: "중반까지는 무난하게 끌고 간다.", skill: -3, nodes: 43_000 },
  { id: "k8", name: "8급", desc: "약점을 보면 파고든다.", skill: -3, nodes: 51_000 },
  { id: "k7", name: "7급", desc: "기물 손해를 거의 보지 않는다.", skill: -2, nodes: 61_000 },
  { id: "k6", name: "6급", desc: "포진을 갖추고 둔다.", skill: -1, nodes: 72_000 },
  { id: "k5", name: "5급", desc: "잡은 우세를 잘 놓지 않는다.", skill: 0, nodes: 84_000 },
  { id: "k4", name: "4급", desc: "종반 계산이 붙는다.", skill: 1, nodes: 98_000 },
  { id: "k3", name: "3급", desc: "실수가 드물다.", skill: 1, nodes: 110_000 },
  { id: "k2", name: "2급", desc: "빈틈을 오래 두면 파고든다.", skill: 2, nodes: 130_000 },
  { id: "k1", name: "1급", desc: "사람의 실수는 대부분 잡아낸다.", skill: 3, nodes: 150_000 },
  { id: "d1", name: "1단", desc: "수를 읽지 않으면 이기기 어렵다.", skill: 5, nodes: 220_000 },
  { id: "d2", name: "2단", desc: "느슨한 수 하나로 판이 기운다.", skill: 7, nodes: 360_000 },
  { id: "d3", name: "3단", desc: "종반이 정확하다.", skill: 9, nodes: 560_000 },
  { id: "d4", name: "4단", desc: "중반 싸움에서 밀리기 시작한다.", skill: 11, nodes: 860_000 },
  { id: "d5", name: "5단", desc: "사람이 이기기 어렵다.", skill: 13, nodes: 1_300_000 },
  { id: "d6", name: "6단", desc: "실수를 기다려서는 못 이긴다.", skill: 15, nodes: 1_800_000 },
  { id: "d7", name: "7단", desc: "거의 봐주지 않는다.", skill: 17, nodes: 2_600_000 },
  { id: "d8", name: "8단", desc: "빈틈이 없다.", skill: 18, nodes: 3_600_000 },
  { id: "d9", name: "9단", desc: "손잡이를 끝까지 올린 상태. 프로보다 강하다.", skill: 20, nodes: 5_000_000 },
];

/** 처음 켰을 때의 상대. 너무 세면 한 판도 못 이기고 접는다. */
export const DEFAULT_LEVEL_ID = "k12";

export const levelById = (id: string): Level =>
  LEVELS.find((l) => l.id === id) ??
  LEVELS.find((l) => l.id === DEFAULT_LEVEL_ID) ??
  LEVELS[0];

/**
 * 노드로만 자르면 약한 급수가 눈 깜짝할 새에 둬서 대국 같지가 않다.
 * 최소 생각 시간을 함께 준다. movetime 과 nodes 를 같이 주면 엔진은
 * 둘 중 먼저 닿는 쪽에서 멈추므로, 여기서는 nodes 만 걸고 기다리는 일은
 * 부르는 쪽(App)에서 한다.
 */
export const MIN_THINK_MS = 450;

/**
 * 한 수에 기다릴 수 있는 최대 시간.
 *
 * 시계를 껐을 때를 위한 것이다. 높은 급수는 노드가 수백만이라 느린 기기에서는
 * 한 수에 분 단위가 걸린다. 그 지점에서 사람은 앱이 멈춘 줄 안다.
 *
 * 이건 맞바꾼 결과다. 급수를 노드로만 끊으면 어느 기기에서나 똑같은 실력이
 * 나오는데, 상한을 걸면 느린 기기에서는 높은 급수가 제 노드를 다 못 써서
 * 조금 약해진다. 보통 PC 에서는 거의 닿지 않고(9단이 약 20초), 주로 휴대폰에서
 * 걸린다. 분 단위로 기다리게 하느니 그쪽이 낫다고 봤다.
 */
export const ENGINE_MOVE_CAP_MS = 30_000;

export const limitsOf = (level: Level): SearchLimits => ({ nodes: level.nodes });

/**
 * 힌트 한 번의 탐색량. 노드와 시간 중 먼저 닿는 쪽에서 멈춘다.
 *
 * 상대 급수가 아니라 가장 센 설정(Skill 20)으로 찾는다. 급수는 Skill 을 낮춰 일부러 최선이
 * 아닌 수를 고르게 만든 것이라(18급은 최선수를 아예 고르지 않는다), 그 세기로 찾으면
 * 힌트가 틀린 수를 가르친다.
 *
 * 30만 노드는 2026-11-02 에 쟀다(보통 PC, 320 폭 창, 국면 셋 × 세 번의 중앙값). 스레드 넷
 * 0.30초, 하나 1.20초 - 하나는 앱 안 브라우저의 단일 스레드 엔진과 같은 속도다. 폰은 재지
 * 못해서, 느린 기기가 오래 기다리지 않게 3초에서 끊는다. 끊으면 그때까지 본 수를 보인다.
 */
export const HINT_LIMITS: SearchLimits = { nodes: 300_000, movetimeMs: 3_000 };

/**
 * 한 수에 걸리는 대략의 시간(초).
 *
 * 이 기기의 실제 속도가 아니라 보통 PC 기준(초당 25만 노드)의 어림값이다.
 * 급수를 고를 때 "이건 한 수에 20초 걸리는구나" 를 알려주려는 것뿐이다.
 */
export function thinkSeconds(level: Level): number {
  return Math.max(MIN_THINK_MS / 1000, level.nodes / 250_000);
}

/**
 * 급수 이름 옆에 붙일 기다림. 기다릴 일이 없으면 빈 문자열.
 *
 * 27개 급수 중 19개(18급~1단)가 한 수에 1초를 넘지 않아서, 목록이 전부
 * "1초 안" 으로 똑같이 적혔다. 같은 말이 열아홉 번 반복되면 읽지 않게 되고,
 * 정작 20초를 기다려야 하는 9단도 같은 자리에 적혀 눈에 띄지 않는다.
 * 그래서 시간은 정말로 기다리게 되는 급수에만 적는다.
 */
export function levelWaitLabel(level: Level): string {
  const sec = thinkSeconds(level);
  return sec < 1 ? "" : 어림시간(sec);
}

// --- 복기 깊이 -----------------------------------------------------------

export interface ReviewDepth {
  id: string;
  name: string;
  desc: string;
  nodes: number;
}

/**
 * 복기는 기보 한 수마다 엔진을 한 번씩 돌린다. 100수짜리 기보면 101번이다.
 * 그래서 깊이를 고를 수 있어야 한다.
 */
export const REVIEW_DEPTHS: ReviewDepth[] = [
  { id: "quick", name: "빠름", desc: "한 국면에 10만 노드", nodes: 100_000 },
  { id: "normal", name: "보통", desc: "한 국면에 50만 노드", nodes: 500_000 },
  { id: "deep", name: "정밀", desc: "한 국면에 200만 노드", nodes: 2_000_000 },
];

/** 1차로 기보 전체를 훑을 때 한 국면에 쓰는 탐색량. '빠름' 과 같은 값이다. */
export const REVIEW_SCAN_NODES = 100_000;

/**
 * 스레드 하나가 1초에 뒤지는 국면 수.
 *
 * 쟀다(2026-10-01, 6코어 노트북). 스레드 1개 25만, 2개 49만, 4개 92만 - 거의 선형이다.
 * 브라우저에서 40수 기보를 보통(50만)으로 복기하니 24.6초였고, 41국면 × 50만 / 24.6 =
 * 초당 83만, 스레드 4개로 나누면 하나당 21만이다. 조금 낮춰 20만으로 잡는다.
 *
 * 한동안 이 값이 25만으로 박혀 있었다. 그건 **스레드 하나일 때** 값인데 앱은 넷을 쓴다.
 * 그래서 화면에 적히는 예상 시간이 실제의 3.6배였다 - "약 5분 20초" 라고 적고 1분 29초에
 * 끝났다. 겁을 주고 시작하게 만드는 숫자였다.
 */
const NODES_PER_SECOND_PER_THREAD = 200_000;

/**
 * 복기를 어떻게 돌릴지. 예상 시간을 적을 때와 실제로 돌릴 때가 이 한 곳을 같이 본다 -
 * 둘이 갈라지면 화면의 숫자가 또 거짓말이 된다.
 */
export interface ReviewPlan {
  /** true 면 모든 국면을 같은 탐색량으로 한 번만 본다 */
  single: boolean;
  /** 1차로 기보 전체를 훑을 때의 탐색량 */
  scanNodes: number;
  /** 2차로 고른 수만 다시 볼 때의 탐색량 */
  deepNodes: number;
  /** 2차로 다시 볼 수의 최대 개수 */
  deepMoves: number;
  /** 2차가 볼 국면 수(고른 수마다 앞뒤 둘). 예상 시간용 최대치다. */
  deepPositions: number;
  /** 다 돌리면 뒤지게 될 국면 수 */
  nodes: number;
}

/**
 * 한 기보에서 정밀하게 다시 볼 수의 개수.
 *
 * 기보가 길수록 짚을 곳도 늘지만 끝없이 늘지는 않는다. 한 판에서 정말 갈린 수는
 * 몇 개뿐이고, 나머지는 '그럴 수밖에 없던 수' 다. 수의 1/5, 다섯에서 열다섯 사이.
 */
export function reviewDeepMoves(moves: number): number {
  return Math.max(5, Math.min(15, Math.round(Math.max(0, moves) * 0.2)));
}

/**
 * 이 기보를 이 깊이로 복기하면 무엇을 얼마나 뒤지게 되는지.
 *
 * 두 번 훑는다. 1차로 기보 전체를 가볍게(10만) 보고, **승률이 크게 움직인 수만 골라**
 * 2차에서 고른 깊이로 다시 본다. 조용히 흘러간 수에 200만 노드를 쓰는 것은 거의 전부
 * 버리는 일이다 - 40수 기보 정밀 복기가 1분 29초에서 45초로, 100수 기보는 4분 12초에서
 * 1분 28초로 준다.
 *
 * 고른 수는 **앞뒤 국면을 둘 다** 깊게 본다. 등급은 두 국면의 승률 차이로 매기는데,
 * 한쪽만 깊게 보면 깊이가 달라서 생긴 값 차이가 그대로 '손해' 로 읽힌다.
 *
 * 두 경우에는 한 번만 본다. (1) '빠름' - 1차와 같은 탐색량이라 2차가 의미 없다.
 * (2) 짧은 기보 - 2차가 볼 국면이 기보 전체와 비슷하면 나눌 까닭이 없다.
 */
export function reviewPlan(depth: ReviewDepth, moves: number): ReviewPlan {
  const positions = Math.max(0, moves) + 1;
  const deepMoves = reviewDeepMoves(moves);
  const single = depth.nodes <= REVIEW_SCAN_NODES || positions <= deepMoves * 2;

  if (single) {
    return {
      single: true,
      scanNodes: depth.nodes,
      deepNodes: depth.nodes,
      deepMoves: 0,
      deepPositions: 0,
      nodes: positions * depth.nodes,
    };
  }

  const deepPositions = Math.min(positions, deepMoves * 2);
  return {
    single: false,
    scanNodes: REVIEW_SCAN_NODES,
    deepNodes: depth.nodes,
    deepMoves,
    deepPositions,
    nodes: positions * REVIEW_SCAN_NODES + deepPositions * depth.nodes,
  };
}

/**
 * 이 기보를 이 깊이로 복기하면 얼마나 걸릴지(초).
 *
 * 그 판의 실제 수로 잰다 - "100수에 약 3분" 처럼 박아 두면 4수짜리 기보에도 3분이라
 * 적혀 기다릴 각오를 잘못 하게 만든다. 스레드 수도 받는다 - 앱이 몇 개를 쓰느냐에
 * 따라 몇 배씩 달라지는 값이라, 하나로 박아 두면 틀린 숫자가 된다.
 */
export function reviewSeconds(depth: ReviewDepth, moves: number, threads = 1): number {
  const nps = NODES_PER_SECOND_PER_THREAD * Math.max(1, threads);
  return reviewPlan(depth, moves).nodes / nps;
}

/**
 * "약 12초" · "약 3분 20초" 처럼 읽기 좋게.
 *
 * 1초 아래는 소수점을 보여주지 않는다. 분을 넘으면 분·초로 끊는다 —
 * "약 200초" 는 얼마나 긴지 감이 안 온다.
 */
export function 어림시간(sec: number): string {
  if (sec < 1) return "1초 안";
  if (sec < 10) return `약 ${sec.toFixed(1)}초`;
  if (sec < 60) return `약 ${Math.round(sec)}초`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (s === 0) return `약 ${m}분`;
  return `약 ${m}분 ${s}초`;
}

export const DEFAULT_REVIEW_DEPTH_ID = "normal";

export const reviewDepthById = (id: string): ReviewDepth =>
  REVIEW_DEPTHS.find((d) => d.id === id) ?? REVIEW_DEPTHS[1];
