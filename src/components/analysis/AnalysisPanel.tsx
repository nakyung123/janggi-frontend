// AI 분석 칸 - 지금 국면의 형세(승률)와 추천 수 셋
//
//   AI 분석                              [끄기]
//   초 62% · 한 38%
//   ███████████░░░░░░░
//   AI가 어림잡은, 지금 이길 가능성입니다.
//   추천 수
//   1  43병53                  초 62%
//   …
//   AI가 수를 읽는 중… (12수 앞까지)
//
// 그래프는 두지 않는다(수가 많아지면 선이 지저분해진다 - 사용자 결정). 승률은 기보 탭 형세와
// 같은 계산(janggi/review.ts 의 winPercent)이고 같은 모양이다. 엔진 점수를 그대로 적지 않는다 -
// 처음 배우는 사람에게는 "62%" 가 "2.3" 보다 읽기 쉽다.
//
// 엔진의 외통 값(mate)을 "외통" 이라는 말로 옮기지 않는다. 표준 규칙의 mate 에는 빅장 판정승이
// 섞인다. 승률 100% / 0% 로만 선다.

import type { AnalysisSnapshot } from "../../engine/types";
import type { EngineStatus } from "../../engine/useEngine";
import type { Position } from "../../janggi/board";
import { describeMove } from "../../janggi/notation";
import { clampScore, winPercent } from "../../janggi/review";
import type { Outcome } from "../../janggi/status";
import { outcomeMessage } from "../../janggi/status";

interface Props {
  engineStatus: EngineStatus;
  on: boolean;
  onToggle: (on: boolean) => void;
  snapshot: AnalysisSnapshot | null;
  /** 추천 수를 기보 표기로 옮길 판 */
  position: Position;
  /** 국면이 맞지 않으면 AI 가 보지 않는다 */
  invalid: boolean;
  outcome: Outcome | null;
  /** 두어 보기 중인지. 그때는 끝난 까닭을 판 아래 상태 줄이 말하므로 여기서 되풀이하지 않는다. */
  playing: boolean;
}

export function AnalysisPanel({ engineStatus, on, onToggle, snapshot, position, invalid, outcome, playing }: Props) {
  const lines = snapshot?.lines ?? [];
  const top = lines[0];
  const cho = top ? winPercent(clampScore(top.score, top.mate)) : null;

  /** 승률·추천 수 대신 서는 한 줄. 없으면 승률·추천 수를 그린다. */
  const instead =
    engineStatus === "loading"
      ? "AI를 띄우는 중입니다."
      : engineStatus === "error"
        ? "AI를 띄우지 못했습니다. 국면 만들기는 할 수 있습니다."
        : !on
          ? "AI 분석을 껐습니다."
          : invalid
            ? "국면을 다 만들면 AI가 봅니다."
            : outcome
              ? playing
                ? "끝난 국면이라 AI가 더 읽지 않습니다."
                : outcomeMessage(outcome)
              : cho === null
                ? "AI가 수를 읽는 중…"
                : null;

  return (
    <section className="panel analysis-panel" aria-label="AI 분석">
      <div className="panel-title">
        AI 분석
        <span className="panel-meta">
          <button type="button" className="ghost" onClick={() => onToggle(!on)} disabled={engineStatus !== "ready"}>
            {on ? "끄기" : "켜기"}
          </button>
        </span>
      </div>

      {instead !== null || cho === null || !snapshot ? (
        <p className="muted">{instead}</p>
      ) : (
        <>
          <p className="win-meta analysis-win">
            <b className="cho">초 {cho}%</b>
            <span aria-hidden="true"> · </span>
            <b className="han">한 {100 - cho}%</b>
          </p>
          <div className="win-bar" role="img" aria-label={`초 ${cho}%, 한 ${100 - cho}%`}>
            <i style={{ width: `${cho}%` }} />
          </div>
          <p className="muted">AI가 어림잡은, 지금 이길 가능성입니다.</p>

          <h3 className="analysis-sub">추천 수</h3>
          <ol className="analysis-lines">
            {lines.map((l) => (
              <li key={l.multipv}>
                <span className="analysis-rank">{l.multipv}</span>
                <b className="analysis-move">{describeMove(l.pv[0], position.board).short}</b>
                <span className="muted analysis-line-win">초 {winPercent(clampScore(l.score, l.mate))}%</span>
              </li>
            ))}
          </ol>
          {/*
            몇 수 앞까지 봤는지(엔진의 깊이). 끝나는 수순을 찾으면 엔진이 깊이를 한도(245)까지
            올려 보고해서 "245수 앞까지" 가 섰다 - 그때는 적지 않는다.
          */}
          <p className="muted analysis-progress">
            {snapshot.running ? "AI가 수를 읽는 중…" : "다 읽었습니다."}
            {top?.mate === null && ` (${snapshot.depth}수 앞까지)`}
          </p>
        </>
      )}
    </section>
  );
}
