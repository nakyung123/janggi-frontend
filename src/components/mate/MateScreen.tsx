// 외통 문제 - 1·2·3수 묶음 목록에서 문제를 골라 푼다
//
//   목록: 제목 · 한 줄 설명 → 묶음 카드(1수·2수·3수) 안에 문제 줄
//   풀기: MateSolve
//
// 목록은 배우기 글 화면의 짜임(learn.css 의 learn-doc, 폭 640 한 단)을 그대로 쓴다. 엔진은 쓰지
// 않는다 - 둘 수 있는 수는 문제 데이터에 있다(janggi/mate.ts).
//
// 푼 기록은 이 기기에만 남는다(janggi:mate-solved). 읽은 값이 그 모양이 아니면 빈 기록으로 시작하고,
// 다른 키는 건드리지 않는다.

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePersisted } from "../../hooks/usePersisted";
import type { MatePuzzle } from "../../janggi/mate";
import { MATES, NO_SOLVED, isSolvedRecord, nextOf, numberOf, solvedIn, withSolved } from "../../janggi/mate";
import { MateSolve } from "./MateSolve";

const GROUPS = [1, 2, 3].map((n) => ({ n, puzzles: MATES.filter((p) => p.n === n) }));

/**
 * 문제를 열 때 쪽을 맨 위로 올린다. 폰은 쪽 전체가 구르므로, 목록 아래에서 문제를 열면 풀기 화면이
 * 중간부터 보인다. 넓은 화면은 화면 칸(.page)이 구르는데, 풀기 화면은 칸 높이에 맞춰 서서 저절로 맨 위다.
 */
const toTop = () => document.scrollingElement?.scrollTo?.(0, 0);

export function MateScreen() {
  const [record, setRecord] = usePersisted("mate-solved", NO_SOLVED, isSolvedRecord);
  const [open, setOpen] = useState<MatePuzzle | null>(null);
  /**
   * 목록으로 돌아올 때 보일 문제(방금 열어 둔 것). 맨 위로 돌아오면 폰 320 에서 1,500px 가 넘는 목록을
   * 다시 내려가야 한다. 이 화면에 있는 동안만 기억한다 - 저장하지 않는다.
   */
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  const cameFromRow = useRef<HTMLButtonElement>(null);
  const solved = solvedIn(record, MATES);

  useEffect(() => {
    if (!open && cameFrom) cameFromRow.current?.scrollIntoView({ block: "center" });
  }, [open, cameFrom]);

  const show = (p: MatePuzzle) => {
    setOpen(p);
    toTop();
  };

  if (open) {
    const next = nextOf(open);
    return (
      <MateSolve
        key={open.id}
        puzzle={open}
        title={`${open.n}수 외통 · ${numberOf(open)}번`}
        onSolve={(id) => setRecord((r) => withSolved(r, id))}
        onNext={next ? () => show(next) : null}
        onBack={() => {
          setCameFrom(open.id);
          setOpen(null);
        }}
      />
    );
  }

  return (
    <div className="learn-doc">
      <h2 className="learn-title">외통 문제</h2>
      <p className="muted">정해진 수 안에 외통을 거는 문제입니다. 상대는 가장 오래 버티는 수로 받습니다.</p>

      {GROUPS.map((g) => {
        const title = `${g.n}수 외통`;
        const done = g.puzzles.filter((p) => solved.has(p.id)).length;
        return (
          <section key={g.n} className="panel" aria-label={title}>
            <div className="mate-group-head">
              <h3 className="learn-section-title">{title}</h3>
              <span className="muted">
                {g.puzzles.length}문제 · {done}개 풂
              </span>
            </div>
            <ul className="mate-list">
              {g.puzzles.map((p) => {
                const no = numberOf(p);
                const isSolved = solved.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      ref={p.id === cameFrom ? cameFromRow : undefined}
                      type="button"
                      className="ghost mate-item"
                      aria-label={[`${no}번`, isSolved && "풂", p.quiet && "첫 수가 장군 아님"].filter(Boolean).join(", ")}
                      onClick={() => show(p)}
                    >
                      <b>{no}번</b>
                      {isSolved && (
                        <span className="mate-solved">
                          <Check size={20} strokeWidth={2} aria-hidden />풂
                        </span>
                      )}
                      {p.quiet && <span className="muted">첫 수가 장군 아님</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
