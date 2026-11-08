// 시간 도전 - 정해진 시간 안에 외통 문제를 몇 개 푸는지. 규칙, 문제 순서, 남은 시간, 최고 기록의 모양
//
//   3분. 1수 문제(섞음) → 2수(섞음) → 3수(섞음) 차례로 낸다.
//   답이 아닌 수를 두거나 넘기면 그 문제를 놓친 것이다. 세 번 놓치면 끝.
//   시간이 다 되거나, 세 번 놓치거나, 문제를 다 지나면 끝. 점수는 푼 개수.
//
// 틀린 수에 다시 두게 하지 않는다. 1수 문제의 합법수가 23~70개라 아무 수나 눌러 보는 것이 가장
// 빠른 길이 된다. 놓침 제한이 없으면 아무 수나 두고 넘기며 끝까지 가는 판이 된다.
//
// 여기는 계산만 한다. 시계와 저장은 hooks/useTimed.ts 가 맡는다. 문제 목록과 난수는 인자로 받는다 -
// mates.json 을 읽지 않아 E2E(Node)도 같은 순서를 다시 계산할 수 있다.

/**
 * 지금 규칙. id 는 최고 기록을 규칙마다 따로 남기는 데 쓴다 - 3분 기록과 5분 기록은 비교할 수 없다.
 * 시간이나 놓침 수를 바꾸면 id 도 바꾼다. 문제를 더하는 것은 같은 규칙이다.
 */
export const TIMED_RULE = { id: "180s-3miss", limitMs: 180_000, misses: 3 } as const;

/** 수가 적은 문제부터, 같은 수끼리는 섞어서. rand 는 [0, 1) 을 낸다(앱은 Math.random). */
export function deckOf<T extends { n: number }>(list: readonly T[], rand: () => number): T[] {
  const lengths = [...new Set(list.map((p) => p.n))].sort((a, b) => a - b);
  return lengths.flatMap((n) => shuffle(list.filter((p) => p.n === n), rand));
}

/** 피셔-예이츠. 새 배열을 돌려준다. */
function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 남은 시간(ms). 시작 시각과의 차이로 센다 - 숨긴 탭에서 타이머가 늦게 와도 값이 틀리지 않는다.
 * 기기 시계가 뒤로 가도 시작 때보다 늘지 않고, 0 아래로 내려가지 않는다.
 */
export function remainingMs(startedAt: number, now: number, limitMs: number = TIMED_RULE.limitMs): number {
  const elapsed = Math.max(0, now - startedAt);
  return Math.max(0, limitMs - elapsed);
}

/** 남은 시간을 "2:41" 처럼. 초는 올림한다 - 0.4초가 남았는데 "0:00" 이 서면 끝난 것으로 읽힌다. */
export function clockText(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// --- 최고 기록 -------------------------------------------------------------------

/**
 * 이 기기에 남기는 최고 기록(janggi:timed-best). 규칙 id → 그 규칙에서 가장 많이 푼 개수.
 *
 * 객체로 감싸고 규칙마다 칸을 둔 까닭: 규칙을 바꿔도 키 이름과 모양을 바꾸지 않는다 - 이 키는 한 번
 * 나가면 바꿀 수 없다(바꾸면 이미 쌓인 기록이 안 읽힌다). 옛 규칙의 칸은 지우지 않고 둔다.
 */
export interface TimedRecord {
  best: Record<string, number>;
}

export const NO_TIMED: TimedRecord = { best: {} };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 읽어 온 값이 최고 기록 모양인지. 아니면 빈 기록으로 본다. */
export function isTimedRecord(value: unknown): value is TimedRecord {
  if (!isPlainObject(value)) return false;
  const best = value.best;
  return isPlainObject(best) && Object.values(best).every((n) => Number.isInteger(n) && (n as number) >= 0);
}

/** 이 규칙의 최고 기록. 없으면 null. */
export function bestOf(record: TimedRecord, rule: string = TIMED_RULE.id): number | null {
  return Object.hasOwn(record.best, rule) ? record.best[rule] : null;
}

/** 푼 개수를 합친 기록. 그 규칙의 최고보다 많을 때만 바뀌고, 아니면 그대로 돌려준다. 0개는 남기지 않는다. */
export function withBest(record: TimedRecord, solved: number, rule: string = TIMED_RULE.id): TimedRecord {
  if (solved <= (bestOf(record, rule) ?? 0)) return record;
  return { ...record, best: { ...record.best, [rule]: solved } };
}
