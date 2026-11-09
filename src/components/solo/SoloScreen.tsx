// 혼자 장기 - 규칙을 읽고, 쉬움·보통·어려움 묶음에서 문제를 골라 푼다
//
//   목록: 제목 · 한 줄 설명 → 규칙 카드 → 묶음 카드(쉬움·보통·어려움) 안에 문제 줄
//   풀기: SoloSolve
//
// 목록은 외통 문제 목록과 같은 모양이다(learn.css 의 learn-doc, mate.css 의 목록 줄). 엔진은 쓰지
// 않는다 - 둘 수 있는 수는 규칙(janggi/solo.ts)이 그때그때 낸다.
//
// 푼 기록은 이 기기에만 남는다(janggi:solo-solved, 모양 {"solved": [...]}). usePersisted 를 쓰지 않는다.
// 그 훅은 처음 읽은 값을 바뀔 때마다 통째로 써서, 두 탭에서 풀면 늦게 쓴 탭이 먼저 쓴 기록을 지운다.
// 그래서 풀 때마다 저장된 값을 다시 읽어 그 id 를 더해 쓴다. 읽은 값이 그 모양이 아니면 빈 기록으로
// 보고, 다른 키는 읽지도 쓰지도 않는다.

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readStored, writeStored } from "../../hooks/usePersisted";
import type { SolvedRecord } from "../../janggi/mate";
import { NO_SOLVED, isSolvedRecord, withSolved } from "../../janggi/mate";
import type { SoloLevel, SoloPuzzle } from "../../janggi/solo";
import { LEVEL_LABEL, SOLOS, boardOf, nextOf, numberOf, pieceCount, solvedIdsIn } from "../../janggi/solo";
import { SoloSolve } from "./SoloSolve";

/** 기기 저장 키. 앞의 "janggi:" 는 readStored 가 붙인다. 한 번 나가면 이름과 모양을 바꾸지 않는다. */
const KEY = "solo-solved";

const LEVELS: SoloLevel[] = [1, 2, 3];
const GROUPS = LEVELS.map((level) => ({ level, puzzles: SOLOS.filter((p) => p.level === level) }));

const readRecord = (): SolvedRecord => readStored(KEY, NO_SOLVED, isSolvedRecord);

/** 저장된 값을 다시 읽어 id 를 더해 쓰고, 쓴 값을 돌려준다. 다른 탭이 그사이 남긴 id 도 같이 남는다. */
function saveSolved(id: string): SolvedRecord {
  const before = readRecord();
  const after = withSolved(before, id);
  if (after !== before) writeStored(KEY, after);
  return after;
}

/**
 * 화면에 보일 기록. 쓴 값에 화면이 이미 쥔 id 를 더한다. 저장이 막힌 브라우저에서는 다시 읽은 값이 늘
 * 빈 기록이라, 쓴 값만 보이면 둘째 문제를 풀 때 첫째 문제의 푼 표시가 사라진다(useTimed.ts 의 최고
 * 기록과 같다). 저장이 되는 브라우저에서는 쓴 값이 화면의 기록을 이미 다 담고 있어 결과가 같다.
 */
const shownWith = (shown: SolvedRecord, written: SolvedRecord): SolvedRecord =>
  shown.solved.reduce(withSolved, written);

/** 문제를 열 때 쪽을 맨 위로 올린다(외통 문제 목록과 같다 - MateScreen.tsx 의 toTop). */
const toTop = () => document.scrollingElement?.scrollTo?.(0, 0);

export function SoloScreen() {
  const [record, setRecord] = useState<SolvedRecord>(readRecord);
  const [open, setOpen] = useState<SoloPuzzle | null>(null);
  /** 목록으로 돌아올 때 보일 문제(방금 열어 둔 것). 이 화면에 있는 동안만 기억한다. */
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  const cameFromRow = useRef<HTMLButtonElement>(null);
  const solved = solvedIdsIn(record.solved, SOLOS);

  useEffect(() => {
    if (!open && cameFrom) cameFromRow.current?.scrollIntoView({ block: "center" });
  }, [open, cameFrom]);

  const show = (p: SoloPuzzle) => {
    setOpen(p);
    toTop();
  };

  if (open) {
    const next = nextOf(open);
    return (
      <SoloSolve
        key={open.id}
        puzzle={open}
        title={`${LEVEL_LABEL[open.level]} · ${numberOf(open)}번`}
        onSolve={(id) => {
          const written = saveSolved(id);
          setRecord((shown) => shownWith(shown, written));
        }}
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
      <h2 className="learn-title">혼자 장기</h2>
      <p className="muted">판의 기물끼리 잡아 하나만 남기는 문제입니다.</p>

      <section className="panel" aria-label="규칙">
        <h3 className="learn-section-title">규칙</h3>
        {/* 규칙은 janggi/solo.ts 머리 주석과 같다. 규칙을 바꾸면 여기도 같이 바꾼다. */}
        <ul className="learn-list solo-rules">
          <li>잡는 수만 둡니다. 빈 자리로는 옮기지 못합니다.</li>
          <li>초 기물은 한 기물만, 한 기물은 초 기물만 잡습니다.</li>
          <li>차례는 없습니다. 어느 편 기물이든 먼저 둘 수 있습니다.</li>
          <li>기물은 대국과 똑같이 움직입니다. 포는 포를 넘지도 잡지도 못합니다.</li>
          <li>기물이 하나만 남으면 풀립니다. 궁이 없어 장군은 없습니다.</li>
        </ul>
      </section>

      {GROUPS.map((g) => {
        const title = LEVEL_LABEL[g.level];
        const done = g.puzzles.filter((p) => solved.has(p.id)).length;
        return (
          <section key={g.level} className="panel" aria-label={title}>
            <div className="mate-group-head">
              <h3 className="learn-section-title">{title}</h3>
              <span className="muted">
                {g.puzzles.length}문제 · {done}개 풂
              </span>
            </div>
            <ul className="mate-list">
              {g.puzzles.map((p) => {
                const no = numberOf(p);
                const count = pieceCount(boardOf(p));
                const isSolved = solved.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      ref={p.id === cameFrom ? cameFromRow : undefined}
                      type="button"
                      className="ghost mate-item"
                      aria-label={[`${no}번`, isSolved && "풂", `기물 ${count}개`].filter(Boolean).join(", ")}
                      onClick={() => show(p)}
                    >
                      <b>{no}번</b>
                      {isSolved && (
                        <span className="mate-solved">
                          <Check size={20} strokeWidth={2} aria-hidden />풂
                        </span>
                      )}
                      <span className="muted solo-count">기물 {count}개</span>
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
