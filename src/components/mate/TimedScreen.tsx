// 시간 도전 - 3분 안에 외통 문제를 몇 개 푸는지
//
//   시작 전: 제목 · 한 줄 → 카드(규칙 · 최고 기록 · 시작)
//   도는 중: 외통 풀기 화면(MateSolve) - 누가 두나 → 상태 줄(남은 시간 ···· 푼 문제 · 놓침) → 판 →
//            알림 줄 → 넘기기
//   끝:      제목 → 카드(푼 개수 · 끝난 까닭 · 최고 기록 · 다시 하기)
//
// 시작 전·끝은 배우기 글 화면 짜임(learn.css 의 learn-doc, 폭 640 한 단), 도는 중은 외통 풀기 화면
// 그대로다. 규칙·시계·기록은 hooks/useTimed.ts. 처음부터·정답 보기는 두지 않는다.
//
// 다른 메뉴로 가면 이 화면이 내려가며 그 판은 버린다(기록하지 않는다). 다시 오면 시작 전이다.

import { useEffect } from "react";
import type { TimedEnd } from "../../hooks/useTimed";
import { useTimed } from "../../hooks/useTimed";
import { TIMED_RULE, clockText } from "../../janggi/timed";
import { MateSolve } from "./MateSolve";

const END_TEXT: Record<TimedEnd, string> = {
  time: "시간이 다 됐습니다.",
  misses: "세 번 놓쳤습니다.",
  all: "모든 문제를 지났습니다.",
};

/** 마지막 10초는 붉게. 대국 시계의 급한 시간과 같은 뜻이다. */
const LOW_MS = 10_000;

const bestText = (best: number | null) => (best === null ? "아직 기록이 없습니다." : `최고 기록 ${best}개`);

/** 쪽을 맨 위로. 폰은 쪽 전체가 구르므로, 판 아래에서 끝나면 끝 화면이 중간부터 보인다. */
const toTop = () => document.scrollingElement?.scrollTo?.(0, 0);

export function TimedScreen() {
  const t = useTimed();

  useEffect(() => {
    if (t.phase !== "running") toTop();
  }, [t.phase]);

  if (t.phase === "running" && t.puzzle) {
    const p = t.puzzle;
    const clock = clockText(t.remainingMs);
    return (
      <MateSolve
        key={t.index}
        puzzle={p}
        lead={`${p.n}수 외통`}
        status={
          <div className="timed-status">
            <span
              className={"timed-clock" + (t.remainingMs <= LOW_MS ? " low" : "")}
              role="timer"
              aria-label={`남은 시간 ${clock}`}
            >
              {clock}
            </span>
            <span>푼 문제 {t.solved}</span>
            <span>
              놓침 {t.misses}/{TIMED_RULE.misses}
            </span>
          </div>
        }
        help={false}
        onSolve={t.solve}
        onWrong={t.miss}
        startNote={t.missedLast ? `앞 문제를 놓쳤습니다. ${p.n}수 안에 외통을 거세요.` : undefined}
        extra={
          <button type="button" className="mate-next" onClick={t.skip} disabled={!t.canSkip}>
            넘기기
          </button>
        }
      />
    );
  }

  if (t.phase === "over" && t.end) {
    return (
      <div className="learn-doc">
        <h2 className="learn-title">시간 도전</h2>
        <section className="panel timed-card" aria-label="결과">
          <p className="timed-score">
            <b>{t.solved}개</b> 풀었습니다
          </p>
          <p className="muted">{END_TEXT[t.end]}</p>
          <p>
            {bestText(t.best)}
            {t.newBest && (
              <>
                {" · "}
                <b className="timed-new">새 기록입니다.</b>
              </>
            )}
          </p>
          <button type="button" className="primary timed-go" onClick={t.start}>
            다시 하기
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="learn-doc">
      <h2 className="learn-title">시간 도전</h2>
      <p className="muted">{TIMED_RULE.limitMs / 60_000}분 안에 외통 문제를 몇 개 푸는지 셉니다.</p>
      <section className="panel timed-card" aria-label="규칙">
        {/* 규칙 글은 TIMED_RULE(3분·세 번)과 맞춘다. 규칙을 바꾸면 규칙 id 와 이 글을 같이 바꾼다. */}
        <ul className="learn-list">
          <li>1수 외통부터 나오고, 갈수록 2수·3수가 나옵니다.</li>
          <li>답이 아닌 수를 두거나 넘기면 그 문제를 놓칩니다. 세 번 놓치면 끝납니다.</li>
          <li>정답 보기는 없습니다.</li>
        </ul>
        <p>{bestText(t.best)}</p>
        <button type="button" className="primary timed-go" onClick={t.start}>
          시작
        </button>
      </section>
    </div>
  );
}
