// 급수마다 기준 점수 - 실력 점수(Elo)에서 AI 상대가 가진 점수
//
// 새로 매긴 값이 아니다. 급수 사다리를 만들 때 잰 레이팅이다(scripts/ladder-selfplay.mjs,
// docs/DECISIONS.md "27칸 급수의 간격을 자가대국으로 쟀다"). 기준점 13개끼리 1,120판을 둬
// Bradley-Terry 로 풀었고, 그 점들을 곡선 R(t) = -13 + 2,896·t² 로 폈다. 급수 27개는 그
// 곡선 위에 이렇게 앉아 있다.
//
//   급(18급~1급)  R(0) 에서 R(한 수 15만 노드) 까지 같은 간격 - 한 칸 약 55점
//   단(1단~9단)   그 위 한 칸부터 R(1) 까지 같은 간격      - 한 칸 약 225점
//
// 여기서도 같은 식으로 다시 계산한다. 숫자 27개를 손으로 옮겨 적으면 사다리를 다시 잴 때
// 한쪽만 고쳐진다.
//
// 이 값의 한계
// - 엔진끼리 둬서 잰 값이다. 약한 쪽에서 납작하게 나온다고 이미 적혀 있다. 사람에게 급 한
//   칸이 55점인지는 모른다. "어느 급수와 반반으로 두면 그 급수의 점수로 간다" 는 성질만 믿는다.
// - 실제로 둬 본 기준점은 t=0.87(약 2,180점, 5단과 6단 사이)까지다. 6단~9단은 곡선을 늘린
//   값이고 검증하지 않았다.

import { DEFAULT_LEVEL_ID, LEVELS } from "./levels";

/** 사다리 레이팅 곡선. t 는 0(가장 약함)에서 1(가장 셈)로 가는 강도 눈금이다. */
const curve = (t: number): number => -13 + 2_896 * t * t;

/** 노드 수를 강도 눈금 t 로. 사다리는 1,500 노드를 0, 500만 노드를 1 로 잡았다. */
const tOfNodes = (nodes: number): number => Math.log(nodes / 1_500) / Math.log(5_000_000 / 1_500);

const KUP = 18;
const DAN = 9;

/** 급의 위 끝(1급). 한 수 15만 노드 - 사람이 해볼 만한 마지막 줄로 잡은 곳이다. */
const KUP_TOP_T = tOfNodes(150_000);
/** 단의 아래 끝(1단). 급 위 끝에서 한 칸 위다. 1단이 1급보다 세야 한다. */
const DAN_LOW_T = KUP_TOP_T + (1 - KUP_TOP_T) / DAN;

/** 두 끝 사이를 같은 간격으로 n 칸. */
const band = (low: number, high: number, n: number): number[] =>
  Array.from({ length: n }, (_, k) => low + ((high - low) * k) / (n - 1));

const RATINGS: ReadonlyMap<string, number> = (() => {
  const values = [
    ...band(curve(0), curve(KUP_TOP_T), KUP),
    ...band(curve(DAN_LOW_T), curve(1), DAN),
  ];
  // 급수 표가 27칸이 아니게 되면 위 배치가 어긋난다. 조용히 틀린 점수를 주지 않는다.
  if (LEVELS.length !== values.length) {
    throw new Error(`급수 ${LEVELS.length}칸에 기준 점수 ${values.length}개 - 사다리를 다시 맞춰야 합니다.`);
  }
  return new Map(LEVELS.map((l, i) => [l.id, values[i]]));
})();

/** 그 급수의 기준 점수. 모르는 급수(불러온 기보의 빈 값 등)면 `null`. */
export const ratingOf = (levelId: string): number | null => RATINGS.get(levelId) ?? null;

/** 처음 점수. 앱을 처음 켰을 때의 상대(12급)의 기준 점수다. */
export const START_RATING: number = RATINGS.get(DEFAULT_LEVEL_ID)!;

/** 이 점수에 가장 가까운 급수. 둘이 같은 거리면 약한 쪽이다. */
export function nearestLevelId(rating: number): string {
  let best = LEVELS[0].id;
  let gap = Infinity;
  for (const l of LEVELS) {
    const d = Math.abs(RATINGS.get(l.id)! - rating);
    if (d < gap) {
      best = l.id;
      gap = d;
    }
  }
  return best;
}
