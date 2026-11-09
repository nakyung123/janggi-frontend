// 내 실수 문제 - 복기한 판마다 카드 하나, 그 안에 내 큰 실수 자리 줄. 줄을 누르면 푼다(MistakeSolve).
//
//   목록: 제목 · 설명 두 줄 → 판 카드(최근 판부터) · 더 보기
//   빈 목록: 복기한 판이 없을 때 / 복기한 판에 큰 실수가 없을 때
//
// 짜임은 외통 문제 목록과 같다(learn.css 의 learn-doc, mate.css 의 카드 머리·줄). 문제와 상태는 App 이
// 쥔 useMistakes 가 준다 - 엔진을 쓰는 상태라 App 이 쥔다(분석판과 같다). 저장하지 않는다.

import { useEffect, useRef, useState } from "react";
import type { PageProps } from "../../screens";
import { resultTag, whenLabel } from "../../janggi/archive";
import { MistakeSolve, gameLabel } from "./MistakeSolve";

/** 처음에 세우는 판 카드 수. [더 보기]마다 이만큼 더한다. 100판을 다 세우면 폰에서 아주 길다. */
export const GAMES_PER_STEP = 10;

/** 문제를 열 때 쪽을 맨 위로 올린다(외통 문제 목록과 같은 까닭). */
const toTop = () => document.scrollingElement?.scrollTo?.(0, 0);

export function MistakesScreen({ mistakes: m }: Pick<PageProps, "mistakes">) {
  const [shown, setShown] = useState(GAMES_PER_STEP);
  /** 목록으로 돌아올 때 보일 줄(방금 연 문제). 이 화면에 있는 동안만 기억한다. */
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  const cameFromRow = useRef<HTMLButtonElement>(null);
  const open = m.open;

  useEffect(() => {
    if (!open && cameFrom) cameFromRow.current?.scrollIntoView({ block: "center" });
  }, [open, cameFrom]);

  if (open) {
    return (
      <MistakeSolve
        m={{
          ...m,
          back: () => {
            setCameFrom(open.id);
            m.back();
          },
          show: (id) => {
            m.show(id);
            toTop();
          },
        }}
        now={Date.now()}
      />
    );
  }

  const { groups, reviewedGames } = m.list;
  const now = Date.now();
  // 돌아온 줄이 접힌 카드에 있으면 그 카드까지 펴 둔다.
  const cameAt = cameFrom ? groups.findIndex((g) => g.mistakes.some((x) => x.id === cameFrom)) : -1;
  const visible = groups.slice(0, Math.max(shown, cameAt + 1));

  return (
    <div className="learn-doc">
      <h2 className="learn-title">내 실수 문제</h2>
      <p className="muted">
        복기에서 큰 실수로 나온 내 수를 다시 풉니다. 그 수를 두기 전 국면에서 더 나은 한 수를 찾으세요.
      </p>
      <p className="muted">그 자리부터 AI와 이어 두려면 기보 탭의 [이 수 전부터 다시 두기]를 누르세요.</p>

      {groups.length === 0 && (
        <section className="panel" aria-label="문제 없음">
          {reviewedGames === 0 ? (
            <>
              <p>아직 복기한 판이 없습니다.</p>
              <p className="muted">
                대국을 마치고 기보 탭에서 [복기 시작]을 누르면, 내가 둔 큰 실수가 여기 문제로 섭니다.
              </p>
            </>
          ) : (
            <>
              <p>복기한 {reviewedGames}판에 내 큰 실수가 없습니다.</p>
              <p className="muted">큰 실수는 한 수 만에 승률이 60% → 40% 처럼 20 넘게 떨어진 수입니다.</p>
            </>
          )}
        </section>
      )}

      {visible.map((g) => {
        const title = gameLabel(g.levelName);
        return (
          <section key={g.gameId} className="panel" aria-label={`${whenLabel(g.endedAt, now)} ${title}`}>
            <div className="mate-group-head">
              <h3 className="learn-section-title">{title}</h3>
              <span className="muted">
                {whenLabel(g.endedAt, now)} · {resultTag(g).text} · {g.mistakes.length}문제
              </span>
            </div>
            <ul className="mate-list">
              {g.mistakes.map((x) => (
                <li key={x.id}>
                  <button
                    ref={x.id === cameFrom ? cameFromRow : undefined}
                    type="button"
                    className="ghost mate-item"
                    onClick={() => {
                      m.show(x.id);
                      toTop();
                    }}
                  >
                    <b>{x.nth}번째 수</b>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {visible.length < groups.length && (
        <button type="button" className="mistakes-more" onClick={() => setShown((n) => n + GAMES_PER_STEP)}>
          더 보기
        </button>
      )}
    </div>
  );
}
