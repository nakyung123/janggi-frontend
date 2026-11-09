// 내 실수 문제 하나를 푸는 화면
//
//   목록으로 · 제목(12번째 수) · 어느 판·누가 두나 → 판 → 알림 줄 · (답 뒤) 다시 풀기 | 기보에서 보기 · 다음 문제
//
// 짜임은 외통 풀기(MateSolve)와 같은 판 화면이다(learn.css) - 넓은 화면은 판 | 오른쪽 칸, 폰은 위
// 순서로 쌓는다. 알림 줄(mate.css)을 판 아래에 두어서 글이 바뀌어도 판이 밀리지 않는다.
//
// MateSolve 를 쓰지 않은 까닭: 판정이 엔진을 기다리고, 합법수를 실행 중에 받고, 끝 글이 다르다. 그것을
// 그 화면의 선택 props 로 넣으면 외통 문제·오늘의 문제·시간 도전 셋이 같이 바뀐다.
//
// 판은 내 쪽을 아래에 둔다(한을 잡은 판은 뒤집는다). 판 뒤집기·한수쉼 단추는 두지 않는다. 엔진은
// 모른다 - 상태와 엔진 묻기는 hooks/useMistakes 가 하고, 이 화면은 그 값을 그린다.

import { ChevronLeft } from "lucide-react";
import type { Mistakes, MistakeNote } from "../../hooks/useMistakes";
import { whenLabel } from "../../janggi/archive";
import { josa, 은는, 을를, 이가 } from "../../janggi/korean";
import type { Mistake } from "../../janggi/mistakes";
import { SIDE_LABEL } from "../../janggi/pieces";
import { GRADE_LABEL } from "../../janggi/review";
import { Board } from "../board/Board";

/** "12급과 둔 판" */
export const gameLabel = (levelName: string) => `${josa(levelName, "과", "와")} 둔 판`;

/** 알림 줄의 글. */
function noteText(note: MistakeNote, m: Mistake): string {
  const ai = `AI는 ${을를(m.bestNotation)} 골랐습니다.`;
  switch (note.kind) {
    case "loading":
      return "AI를 불러오는 중입니다.";
    case "broken":
      return "AI를 띄우지 못해 풀 수 없습니다. 새로고침해 보세요.";
    case "preparing":
      return "판을 준비하는 중입니다.";
    case "probeFailed":
      return "판을 준비하지 못했습니다. 다시 시도해 보세요.";
    case "start":
      return `그때 둔 ${은는(m.playedNotation)} 큰 실수였습니다. 더 나은 수를 찾아보세요.`;
    case "measuring":
      return `AI가 ${을를(note.move)} 보는 중…`;
    case "measureFailed":
      return "AI가 이 수를 재지 못했습니다. 다시 풀어 보세요.";
    case "verdict": {
      const v = note.verdict;
      if (v.kind === "best") return "맞았습니다. AI의 수와 같습니다.";
      if (v.kind === "again") return `그때 둔 수와 같습니다. ${ai}`;
      if (v.grade === "good") return `맞았습니다. 좋은 수입니다. ${ai}`;
      return `${GRADE_LABEL[v.grade]}입니다. 승률 ${v.before}% → ${v.after}%. ${ai}`;
    }
  }
}

export function MistakeSolve({ m, now }: { m: Mistakes; now: number }) {
  const open = m.open!;
  const group = m.list.groups.find((g) => g.gameId === open.gameId);
  const v = m.view;
  const failed = m.note.kind === "probeFailed" || m.note.kind === "measureFailed";

  return (
    <div className="learn-fit">
      <div className="learn-main">
        <div className="learn-head">
          <div className="game-back">
            <button type="button" className="back" onClick={m.back}>
              <ChevronLeft size={20} strokeWidth={2} aria-hidden />
              목록으로
            </button>
          </div>
          <h2 className="learn-title">{open.nth}번째 수</h2>
          <p className="muted">
            {group ? `${whenLabel(group.endedAt, now)} ${gameLabel(group.levelName)} · ` : ""}
            {이가(SIDE_LABEL[open.mySide])} 둡니다
          </p>
        </div>

        <div className="learn-stage">
          <Board
            board={v.board}
            flipped={v.flipped}
            selected={v.selected}
            targets={v.targets}
            lastMove={v.lastMove}
            bestMove={v.bestMove}
            onSquareClick={v.onSquareClick}
            onMove={v.onMove}
            onPick={v.onSquareClick}
            canPick={v.canPick}
            flyMove={v.flyMove}
          />
        </div>

        <div className="learn-desc mate-desc">
          <p className="mate-note" role="status">
            {noteText(m.note, open)}
          </p>
          {failed && (
            <button type="button" onClick={m.retry}>
              다시 시도
            </button>
          )}
          {m.done && (
            <div className="mate-actions">
              <button type="button" onClick={m.restart}>
                다시 풀기
              </button>
              <button type="button" onClick={m.openInGames}>
                기보에서 보기
              </button>
            </div>
          )}
          {m.done && m.next && (
            <button type="button" className="primary mate-next" onClick={() => m.show(m.next!.id)}>
              다음 문제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
