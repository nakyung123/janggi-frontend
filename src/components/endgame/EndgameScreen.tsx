// 끝내기 · 국면 연습 - 목록에서 국면을 골라 AI 와 이어 둔다
//
//   목록: 제목 · 한 줄 설명(규칙 포함) → 카드 안에 국면 줄(번호 · 제목 · 목표 · 깬 표시)
//   두기: EndgamePlay
//
// 두 메뉴("끝내기", "국면 연습")가 이 컴포넌트를 같이 쓰고 데이터 묶음만 다르다. 목록 짜임은 외통 문제
// 목록과 같다(learn.css 의 learn-doc, 폭 640 한 단).
//
// 이 화면은 엔진을 모른다. 두던 국면·엔진 답·깬 기록은 App 이 쥔 훅(hooks/useEndgame)이 준다.

import { Check } from "lucide-react";
import type { EndgameGroup } from "../../janggi/endgame";
import { goalShort, materialText, numberOf, positionsOf, titleOf } from "../../janggi/endgame";
import type { PageProps } from "../../screens";
import { EndgamePlay } from "./EndgamePlay";

const TEXT: Record<EndgameGroup, { title: string; lead: string }> = {
  endgame: {
    title: "끝내기",
    lead: "기물이 적게 남은 판에서 상대 궁을 잡는 연습입니다.",
  },
  middle: {
    title: "국면 연습",
    lead: "앞선 판을 놓치지 않고 끝까지 이기는 연습입니다. 엔진끼리 둔 판의 중반에서 골랐습니다.",
  },
};

/** 쪽을 맨 위로 올린다. 폰은 쪽 전체가 구르므로, 목록 아래에서 국면을 열면 두는 화면이 중간부터 보인다. */
const toTop = () => document.scrollingElement?.scrollTo?.(0, 0);

function Screen({ group, endgame: e }: { group: EndgameGroup; endgame: PageProps["endgame"] }) {
  if (e.open && e.open.group === group) return <EndgamePlay endgame={e} />;

  const list = positionsOf(group);
  const done = list.filter((p) => e.cleared.has(p.id)).length;
  const text = TEXT[group];

  return (
    <div className="learn-doc">
      <h2 className="learn-title">{text.title}</h2>
      <p className="muted">
        {text.lead} AI와 둡니다. 규칙은 현대(빅장 없음)입니다.
      </p>

      <section className="panel" aria-label={text.title}>
        <div className="endgame-list-head">
          <span className="muted">
            {list.length}개 · {done}개 깸
          </span>
        </div>
        <ul className="endgame-list">
          {list.map((p) => {
            const no = numberOf(p);
            const isCleared = e.cleared.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="ghost endgame-item"
                  aria-label={[`${no}번 ${titleOf(p)}`, goalShort(p.goal), isCleared && "깸"].filter(Boolean).join(", ")}
                  onClick={() => {
                    e.start(p);
                    toTop();
                  }}
                >
                  <b>{no}</b>
                  <span className="endgame-item-title">
                    {group === "endgame" ? titleOf(p) : `${titleOf(p)} · ${materialText(p)}`}
                  </span>
                  <span className="muted">{goalShort(p.goal)}</span>
                  {isCleared && (
                    <span className="endgame-cleared">
                      <Check size={20} strokeWidth={2} aria-hidden />깸
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export function EndgameScreen({ endgame }: Pick<PageProps, "endgame">) {
  return <Screen group="endgame" endgame={endgame} />;
}

export function PositionsScreen({ endgame }: Pick<PageProps, "endgame">) {
  return <Screen group="middle" endgame={endgame} />;
}
