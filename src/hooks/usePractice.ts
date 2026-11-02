// 연습 판 - 복기한 판의 내 큰 실수 자리에서, 그 수를 두기 전 국면부터 AI 와 다시 둔다
//
// 기보 탭의 연 판 자리에서 둔다. 대국 탭의 두던 판은 건드리지 않는다 - 두던 판을 버리게
// 하면 "버린 판은 기권패" 규칙과 얽히고, 대국 탭에서만 찍는 측정(first_move 등)의 뜻이 바뀐다.
//
// **기보에 남기지 않고, 저장하지도 않는다.** 남기면 서버 목록으로 세는 전적이 중간 국면에서
// 시작한 판을 평소 판처럼 센다. 서버 목록에는 시작 국면이 없어 가려낼 길이 없다. 새로고침하면
// 연습이 끝난다(연 판도 새로고침하면 닫힌다).
//
// 그 판의 앞 수순을 그대로 들고 시작한다. 엔진에 수순을 통째로 넘겨야 같은 수 되풀이·빅장·
// 200수 판정이 원래 판과 같다. 대신 연습을 시작한 국면 앞으로는 되짚지 않는다(start) - 그 앞에서
// 두면 내 실수를 다시 두는 것이 아니다.

import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { LEVELS } from "../engine/levels";
import type { ArchivedGame } from "../janggi/archive";
import type { Square } from "../janggi/board";
import type { HistoryEntry } from "../janggi/history";
import { nextEntry } from "../janggi/history";
import type { Side } from "../janggi/pieces";

export interface Practice {
  /** 어느 판에서 시작했나(기보 목록의 id). App 은 그 판을 열고 있을 때만 연습 판을 세운다. */
  gameId: string;
  /** 연습을 시작한 국면의 번호. 그 판의 기보 번호 그대로다. 이 앞으로는 되짚지 않는다. */
  start: number;
  history: HistoryEntry[];
  cursor: number;
  /** 내가 잡은 쪽. 그 판에서 잡은 쪽 그대로다. */
  mySide: Side;
  /** AI 의 급수. 그 판의 급수이고, 사다리에 없으면(불러온 기보) 대국 탭의 급수다. */
  levelId: string;
  /** 다시 두는 수. 연습 칸이 "초의 2번째 수(75졸65)" 처럼 적는다. */
  retry: { mover: Side; nth: number; notation: string };
}

export interface PracticeState {
  practice: Practice | null;
  /** game 의 index 번째 수를 두기 전 국면부터 시작한다. */
  start: (game: ArchivedGame, index: number, fallbackLevelId: string) => void;
  stop: () => void;
  /** 연습을 시작한 국면으로 되돌린다. 그 뒤에 둔 수는 버린다. */
  restart: () => void;
  /** 지금 보는 국면에서 한 수 둔다. 되짚던 자리면 그 뒤의 수는 버리고 새로 잇는다. */
  push: (from: Square, to: Square) => void;
  /** 보는 수를 옮긴다. 연습을 시작한 국면과 마지막 수 사이로 눌러 둔다. */
  setCursor: Dispatch<SetStateAction<number>>;
}

export function usePractice(): PracticeState {
  const [practice, setPractice] = useState<Practice | null>(null);

  const start = useCallback((game: ArchivedGame, index: number, fallbackLevelId: string) => {
    const played = game.history[index];
    if (index < 1 || !played?.mover) return;
    setPractice({
      gameId: game.id,
      start: index - 1,
      history: game.history.slice(0, index),
      cursor: index - 1,
      mySide: game.mySide,
      levelId: LEVELS.some((l) => l.id === game.levelId) ? game.levelId : fallbackLevelId,
      retry: {
        mover: played.mover,
        nth: game.history.slice(1, index + 1).filter((h) => h.mover === played.mover).length,
        notation: played.notation,
      },
    });
  }, []);

  const stop = useCallback(() => setPractice(null), []);

  const restart = useCallback(
    () =>
      setPractice((p) => p && { ...p, history: p.history.slice(0, p.start + 1), cursor: p.start }),
    []
  );

  const push = useCallback(
    (from: Square, to: Square) =>
      setPractice((p) => {
        if (!p) return p;
        const base = p.history.slice(0, p.cursor + 1);
        return { ...p, history: [...base, nextEntry(base[base.length - 1].fen, from, to)], cursor: p.cursor + 1 };
      }),
    []
  );

  const setCursor: Dispatch<SetStateAction<number>> = useCallback(
    (next) =>
      setPractice((p) => {
        if (!p) return p;
        const want = typeof next === "function" ? next(p.cursor) : next;
        return { ...p, cursor: Math.max(p.start, Math.min(p.history.length - 1, want)) };
      }),
    []
  );

  /*
   * 함수는 렌더마다 같은 것을 돌려준다. App 이 수 두기(pushMove)의 의존성에 두는데, 매 렌더
   * 새 함수면 엔진 착수 타이머가 매 렌더 끊겨 엔진이 두지 못한다(useCallout 주석과 같은 까닭).
   */
  return useMemo(
    () => ({ practice, start, stop, restart, push, setCursor }),
    [practice, start, stop, restart, push, setCursor]
  );
}
