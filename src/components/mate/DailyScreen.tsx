// 오늘의 문제 - 한국 날짜마다 정해진 외통 문제 하나를 푼다
//
//   오늘의 문제 · 11월 7일 · 2수 외통 · 초가 둡니다 · (푼 문제입니다) → 판 → 알림 줄 · 처음부터 | 정답 보기
//
// 문제를 고르는 법은 janggi/daily.ts. 푸는 화면은 외통 문제와 같은 MateSolve 이고 규칙도 같다(다시
// 둘 수 있음, 정답 보기를 쓰면 푼 문제로 남지 않음).
//
// 풀면 외통 문제의 푼 기록(janggi:mate-solved)에 남긴다. 오늘의 문제는 외통 문제 가운데 하나라 같은
// 문제를 두 곳에서 따로 세지 않는다 - 외통 문제 목록의 그 줄에도 "풂" 이 선다. 오늘의 문제만의 기록은
// 두지 않는다.
//
// 날짜는 화면을 열 때 한 번 읽는다. 열어 둔 채 자정을 넘겨도 문제가 바뀌지 않는다.

import { Check } from "lucide-react";
import { useState } from "react";
import { usePersisted } from "../../hooks/usePersisted";
import { dailyOf, koreanDateLabel } from "../../janggi/daily";
import { MATES, NO_SOLVED, isSolvedRecord, withSolved } from "../../janggi/mate";
import { MateSolve } from "./MateSolve";

export function DailyScreen() {
  const [now] = useState(() => Date.now());
  const puzzle = dailyOf(MATES, now);
  const [record, setRecord] = usePersisted("mate-solved", NO_SOLVED, isSolvedRecord);
  // 연 때 이미 푼 문제였는지. 지금 풀어서 생긴 기록으로는 바꾸지 않는다 - 풀자마자 판 위에 한 줄이
  // 생기면 폰에서 판이 밀린다. 푼 것은 알림 줄이 말한다.
  const [solvedBefore] = useState(() => record.solved.includes(puzzle.id));

  return (
    <MateSolve
      puzzle={puzzle}
      title="오늘의 문제"
      lead={`${koreanDateLabel(now)} · ${puzzle.n}수 외통`}
      status={
        solvedBefore ? (
          <p className="mate-solved">
            <Check size={20} strokeWidth={2} aria-hidden />푼 문제입니다
          </p>
        ) : undefined
      }
      onSolve={(id) => setRecord((r) => withSolved(r, id))}
      doneNote="내일 새 문제가 나옵니다."
    />
  );
}
