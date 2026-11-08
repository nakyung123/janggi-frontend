// 오늘의 문제 - 날짜마다 정해진 외통 문제 하나
//
// 날짜는 한국 날짜(UTC+9)로 센다. 기기 시간대는 보지 않는다 - 같은 순간에는 어느 기기에서나 같은
// 문제가 나온다(기기 시계가 맞으면). 한국은 서머타임이 없어 9시간을 더하는 것으로 끝난다.
//
// 순서는 문제를 id 순서로 정렬한 것이다. id 가 해시라 1·2·3수가 섞여 나온다. 기준일(2026-11-07)이
// 순서의 첫 문제이고 하루에 하나씩 간다. 문제가 n 개면 n 일에 한 바퀴이고, 한 바퀴 안에서 같은 문제가
// 다시 나오지 않는다. 다음 바퀴는 같은 순서로 다시 돈다.
//
// 문제를 더하면 그 배포부터 순서가 달라진다(새 id 가 중간에 끼어든다). 오늘의 문제를 날짜별로
// 저장하지 않아서 잃는 기록은 없다.
//
// 문제 목록은 인자로 받는다. mates.json 을 여기서 읽지 않아 E2E(Node)도 이 파일을 그대로 쓴다.

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** 한국 시간 = UTC + 9시간 */
const KOREA_OFFSET_MS = 9 * HOUR_MS;

/** 기준일 2026-11-07(한국)의 날 번호. 이날 순서의 첫 문제가 나온다. */
export const DAILY_START_DAY = 20764;

/** 1970-01-01(한국)부터 센 한국 날짜의 번호. */
export function koreanDay(now: number): number {
  return Math.floor((now + KOREA_OFFSET_MS) / DAY_MS);
}

/** 오늘의 문제가 나오는 순서(id 순서). */
export function dailyOrder<T extends { id: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** now(ms) 의 한국 날짜에 나오는 문제. */
export function dailyOf<T extends { id: string }>(list: readonly T[], now: number): T {
  const order = dailyOrder(list);
  const n = order.length;
  const k = (((koreanDay(now) - DAILY_START_DAY) % n) + n) % n;
  return order[k];
}

/** now(ms) 의 한국 날짜를 "11월 7일" 처럼. */
export function koreanDateLabel(now: number): string {
  const d = new Date(now + KOREA_OFFSET_MS);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}
