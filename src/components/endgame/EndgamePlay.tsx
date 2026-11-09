// 끝내기·국면 연습에서 국면 하나를 AI 와 이어 두는 화면
//
//   [‹ 목록으로] · 제목 · 목표 한 줄(남은 수) · 규칙 → 판 → 판 조작 줄 → 상태 한 줄 → (끝나면) 결과 · 단추
//
// 짜임은 외통 풀기·분석판의 판 화면을 그대로 쓴다(learn.css) - 넓은 화면은 판 | 오른쪽 칸, 폰은 위
// 순서로 쌓는다. 상태 한 줄을 판 아래에 두어 폰에서 글이 바뀌어도 판이 밀리지 않는다.
//
// 판 조작 줄은 대국의 것(BoardControls)을 그대로 쓴다: 두는 중에는 무르기·다시·한수쉼·힌트, 끝나면
// 무르기·다시가 이전·다음이 된다. 대국자 카드는 두지 않는다 - 누가 둘 차례인지·장군은 상태 한 줄이 말한다.
// 결과 창은 띄우지 않는다(대국 탭에서 판이 끝나는 순간의 일이다).

import { ChevronLeft } from "lucide-react";
import type { EndgameBoard } from "../../hooks/useEndgame";
import { goalSentence, nextOf, titleOf } from "../../janggi/endgame";
import { Board } from "../board/Board";
import { BoardControls } from "../board/BoardControls";

/** 상태 한 줄. 힌트를 찾는 중이거나 찾았으면 그 말이 먼저다(대국 칸의 덧말과 같다). */
function stateText(e: EndgameBoard): string {
  if (e.thinking) return "AI가 생각 중…";
  if (e.hintNote) return e.hintNote;
  const mine = e.position.turn === e.mySide;
  const who = mine ? "내 차례" : "AI 차례";
  return e.status.kind === "check" ? `${who} · 장군` : who;
}

export function EndgamePlay({ endgame: e }: { endgame: EndgameBoard }) {
  const p = e.open!;
  const next = nextOf(p);
  const ready = e.engineStatus === "ready";
  const left = e.goal.done ? 0 : e.goal.left;

  return (
    <div className="learn-fit endgame">
      <div className="learn-main">
        <div className="learn-head">
          <div className="game-back">
            <button type="button" className="back" onClick={e.close}>
              <ChevronLeft size={20} strokeWidth={2} aria-hidden />
              목록으로
            </button>
          </div>
          <h2 className="learn-title">{titleOf(p)}</h2>
          <p>
            {goalSentence(p)}{" "}
            {!e.result && (
              <span className="endgame-left">
                {p.goal.kind === "win" ? `남은 수 ${left}` : `버틸 AI 수 ${left}`}
              </span>
            )}
          </p>
          <p className="muted">규칙: 현대(빅장 없음) · AI와 둡니다</p>
        </div>

        <div className="learn-stage">
          {ready ? (
            <Board {...e.view} />
          ) : (
            <p className="muted endgame-wait" role="status">
              {e.engineStatus === "error" ? "AI를 띄우지 못해 둘 수 없습니다." : "AI를 불러오는 중입니다."}
            </p>
          )}
        </div>

        <div className="learn-desc endgame-desc">
          <BoardControls mode="play" {...e.controls} />

          {!e.result && (
            <p className="endgame-state" role="status">
              {stateText(e)}
            </p>
          )}

          {e.result && (
            <div className="endgame-result" role="status">
              <p className="endgame-result-head">{e.result.achieved ? "목표를 이뤘습니다." : "목표를 이루지 못했습니다."}</p>
              <p>{e.result.reason}</p>
              {e.result.achieved && e.result.assisted && (
                <p className="muted">힌트나 무르기를 써서 깬 국면으로 남기지 않습니다.</p>
              )}
            </div>
          )}

          {e.result && (
            <div className="endgame-actions">
              <button type="button" className="primary" onClick={e.restart}>
                다시 하기
              </button>
              {next && (
                <button type="button" onClick={() => e.start(next)}>
                  다음 국면
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
