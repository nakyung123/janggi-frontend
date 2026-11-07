// 시간 도전 - 한 판의 상태: 시작 전 → 도는 중 → 끝, 지금 문제, 푼 개수, 놓침, 남은 시간, 최고 기록
//
//   시작 전 ─ start → 도는 중 ─ 정답(solve) → 0.5초 뒤 다음 문제, 푼 개수 +1
//                            ├ 답이 아닌 수·넘기기(miss) → 바로 다음 문제, 놓침 +1
//                            └ 시간이 다 됨 / 세 번 놓침 / 문제를 다 지남 → 끝(최고 기록을 남긴다)
//
// 규칙과 계산은 janggi/timed.ts 에 있다. 문제 하나를 두는 것은 화면이 useMateSolve 로 한다 - 여기는
// 그 결과(풀었다·놓쳤다)만 받는다.
//
// 시계: 남은 시간은 시작 시각과 Date.now() 의 차이로 센다. 200ms 마다 다시 읽는다. 탭을 숨겨도
// 시계는 간다(대국 시계와 같다) - 타이머가 늦게 와도 시작 시각과의 차이라 값은 맞다.
//
// 최고 기록(janggi:timed-best)은 usePersisted 를 쓰지 않는다. usePersisted 는 처음 읽은 값을 통째로
// 다시 써서, 두 탭에서 하면 늦게 쓴 탭이 먼저 쓴 기록을 지운다. 여기서는 판이 끝날 때 저장된 값을
// 다시 읽고 큰 쪽을 남긴다. 다른 키는 읽지도 쓰지도 않는다.
//
// 판 도중 화면을 떠나면(다른 메뉴) 그 판은 버린다. 기록을 남기지 않고 타이머도 남기지 않는다.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MatePuzzle } from "../janggi/mate";
import { MATES } from "../janggi/mate";
import { NO_TIMED, TIMED_RULE, bestOf, deckOf, isTimedRecord, remainingMs, withBest } from "../janggi/timed";
import { REPLY_DELAY_MS } from "./useMateSolve";
import { readStored, writeStored } from "./usePersisted";

/** 저장 키(앞에 janggi: 가 붙는다). */
export const TIMED_KEY = "timed-best";

/** 남은 시간을 다시 읽는 간격(ms). 화면의 초가 늦게 바뀌어 보이지 않을 만큼. */
const TICK_MS = 200;

/** 끝난 까닭 */
export type TimedEnd = "time" | "misses" | "all";

export type TimedPhase = "ready" | "running" | "over";

interface Round {
  deck: MatePuzzle[];
  /** 지금 문제가 deck 의 몇째인지 */
  index: number;
  solved: number;
  misses: number;
  startedAt: number;
  /** 바로 앞 문제를 놓쳤다. 다음 문제의 알림 줄이 말한다 */
  missedLast: boolean;
  /** 정답을 두고 다음 문제를 기다리는 중(0.5초). 그동안 넘기기를 받지 않는다 */
  waiting: boolean;
}

interface Result {
  end: TimedEnd;
  /** 이번 판이 저장된 최고보다 많았다 */
  newBest: boolean;
}

export interface Timed {
  phase: TimedPhase;
  /** 지금 문제. 도는 중에만 */
  puzzle: MatePuzzle | null;
  /** 지금 문제가 몇째인지(0부터). 화면이 풀기 화면을 문제마다 새로 세우는 데 쓴다 */
  index: number;
  solved: number;
  misses: number;
  remainingMs: number;
  missedLast: boolean;
  waiting: boolean;
  /** 끝난 까닭. 끝난 뒤에만 */
  end: TimedEnd | null;
  /** 이 기기의 최고 기록(지금 규칙). 없으면 null */
  best: number | null;
  newBest: boolean;
  start: () => void;
  /** 지금 문제를 정답을 보지 않고 풀었다 */
  solve: (id: string) => void;
  /** 지금 문제를 놓쳤다(답이 아닌 수, 넘기기) */
  miss: () => void;
}

const readRecord = () => readStored(TIMED_KEY, NO_TIMED, isTimedRecord);

/**
 * @param list 낼 문제. 앱은 외통 문제 전부.
 * @param rand 문제 순서를 섞는 난수. 앱은 Math.random. 시험이 정해진 값을 넘긴다.
 */
export function useTimed(list: readonly MatePuzzle[] = MATES, rand: () => number = Math.random): Timed {
  const [best, setBest] = useState<number | null>(() => bestOf(readRecord()));
  const [round, setRound] = useState<Round | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [now, setNow] = useState(0);
  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopNext = () => {
    if (nextTimer.current !== null) clearTimeout(nextTimer.current);
    nextTimer.current = null;
  };
  // 다음 문제를 기다리다 화면을 떠나면 기다리던 것을 버린다.
  useEffect(() => stopNext, []);

  const running = round !== null && result === null;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  const remaining = round ? remainingMs(round.startedAt, now) : TIMED_RULE.limitMs;
  const endNow: TimedEnd | null = !running
    ? null
    : round.misses >= TIMED_RULE.misses
      ? "misses"
      : round.index >= round.deck.length
        ? "all"
        : remaining === 0
          ? "time"
          : null;

  /*
   * 끝나면 한 번 최고 기록을 남긴다. 그리기 전에(useLayoutEffect) 끝 화면으로 넘겨서, 세 번째로
   * 놓친 뒤 다음 문제가 한 번 그려졌다 사라지지 않게 한다.
   *
   * 보이는 최고 기록과 "새 기록" 은 저장된 값과 이 화면이 이미 보인 최고(best) 가운데 큰 쪽과
   * 비교한다. 저장이 막힌 브라우저(사이트 데이터 차단, 저장 공간 참)에서는 다시 읽은 값이 늘 빈
   * 기록이라, 저장된 값만 보면 둘째 판의 더 낮은 점수를 "새 기록" 이라고 한다. 저장이 되는 브라우저에서는
   * 저장된 값이 늘 이 화면의 최고 이상이라 결과가 같다.
   */
  useLayoutEffect(() => {
    if (!endNow || !round) return;
    stopNext();
    const stored = readRecord();
    const merged = withBest(stored, round.solved);
    if (merged !== stored) writeStored(TIMED_KEY, merged);
    const known = [bestOf(merged), best].filter((n): n is number => n !== null);
    const before = Math.max(bestOf(stored) ?? 0, best ?? 0);
    setBest(known.length > 0 ? Math.max(...known) : null);
    setResult({ end: endNow, newBest: round.solved > before });
  }, [endNow, round, best]);

  const phase: TimedPhase = round === null ? "ready" : result || endNow ? "over" : "running";

  return {
    phase,
    puzzle: phase === "running" && round ? round.deck[round.index] : null,
    index: round?.index ?? 0,
    solved: round?.solved ?? 0,
    misses: round?.misses ?? 0,
    remainingMs: remaining,
    missedLast: round?.missedLast ?? false,
    waiting: round?.waiting ?? false,
    end: result?.end ?? endNow,
    best,
    newBest: result?.newBest ?? false,

    start: () => {
      stopNext();
      const t = Date.now();
      setRound({ deck: deckOf(list, rand), index: 0, solved: 0, misses: 0, startedAt: t, missedLast: false, waiting: false });
      setNow(t);
      setResult(null);
    },

    solve: (id) => {
      if (phase !== "running" || !round || round.waiting || round.deck[round.index]?.id !== id) return;
      setRound({ ...round, solved: round.solved + 1, waiting: true });
      nextTimer.current = setTimeout(() => {
        nextTimer.current = null;
        setRound((r) => r && { ...r, index: r.index + 1, missedLast: false, waiting: false });
      }, REPLY_DELAY_MS);
    },

    miss: () => {
      if (phase !== "running" || !round || round.waiting) return;
      setRound({ ...round, misses: round.misses + 1, index: round.index + 1, missedLast: true });
    },
  };
}
