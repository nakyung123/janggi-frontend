// 외통 문제 하나를 푸는 화면 - 외통 문제·오늘의 문제·시간 도전이 같이 쓴다
//
//   (목록으로) · (제목) · 누가 두나 · (상태 줄) → 판 → 알림 줄 · 처음부터 | 정답 보기 · (단추) · (푼 뒤 줄)
//
// 괄호 안은 부르는 쪽이 고른다. 외통 문제는 목록으로·제목·처음부터|정답 보기·다음 문제, 오늘의
// 문제는 제목·푼 문제 표시·처음부터|정답 보기·푼 뒤 한 줄, 시간 도전은 상태 줄(남은 시간·푼 개수·
// 놓침)·넘기기를 쓴다.
//
// 짜임은 기물 화면(PiecesScreen)의 판 화면을 그대로 쓴다(learn.css) - 넓은 화면은 판 | 오른쪽
// 칸, 폰은 위 순서로 쌓는다. 알림 줄을 판 아래에 두어서 폰에서 글이 바뀌어도 판이 밀리지 않는다.
//
// 판은 공격 쪽을 아래에 둔다. 한이 공격하는 문제는 뒤집어 놓는다. 판 뒤집기 단추는 두지 않고,
// 대국의 판 뒤집기 설정도 읽지 않는다. 대국의 판 조작 줄(처음·끝·무르기·한수쉼·힌트)도 쓰지
// 않는다 - 이 화면에서 쓸 단추가 그 줄에 없다.

import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useMateSolve } from "../../hooks/useMateSolve";
import type { MateNote } from "../../hooks/useMateSolve";
import { 은는, 으로, 이가 } from "../../janggi/korean";
import type { MatePuzzle } from "../../janggi/mate";
import type { Side } from "../../janggi/pieces";
import { SIDE_LABEL } from "../../janggi/pieces";
import { Board } from "../board/Board";

interface Props {
  puzzle: MatePuzzle;
  /** 정답을 보지 않고 끝까지 뒀다. 푼 기록에 남긴다. */
  onSolve: (id: string) => void;
  /** 머리 칸 제목(24/700). 없으면 두지 않는다 - 시간 도전은 남은 시간이 그 자리의 가장 큰 글이다. */
  title?: string;
  /** "초가 둡니다" 앞에 붙일 말. 오늘의 문제는 "11월 7일 · 2수 외통" */
  lead?: string;
  /** 누가 두나 줄 아래, 판 바로 위에 설 것. 시간 도전의 상태 줄, 오늘의 문제의 푼 문제 표시 */
  status?: ReactNode;
  /** 목록으로 돌아간다. 없으면 그 단추를 두지 않는다(메뉴 화면 자체일 때). */
  onBack?: () => void;
  /** 다음 문제로. 푼 뒤에 선다. 없으면 서지 않는다. */
  onNext?: (() => void) | null;
  /** 답이 아닌 수를 받았다. 주면 알림 줄 대신 이것을 부른다(useMateSolve 의 onWrong). */
  onWrong?: (move: string) => void;
  /** 처음부터 · 정답 보기 줄. 기본은 둔다. 시간 도전은 끈다. */
  help?: boolean;
  /** 알림 줄 아래 단추(시간 도전의 넘기기) */
  extra?: ReactNode;
  /** 처음 알림 줄 글. 없으면 "n수 안에 외통을 거세요." */
  startNote?: string;
  /** 끝난 뒤 알림 줄 아래 muted 한 줄 */
  doneNote?: string;
}

/** 알림 줄의 글. */
function noteText(note: MateNote, puzzle: MatePuzzle, defender: Side, startNote?: string): string {
  switch (note.kind) {
    case "start":
      return startNote ?? `${puzzle.n}수 안에 외통을 거세요.`;
    case "wrong":
      return `${은는(note.move)} 답이 아닙니다. 다른 수를 찾아보세요.`;
    case "correct":
      return "맞습니다.";
    case "replied":
      return `${이가(SIDE_LABEL[defender])} ${으로(note.move)} 받았습니다. 다음 수를 찾으세요.`;
    case "shown":
      return "파란 화살표가 답입니다. 직접 두어 보세요.";
    case "done":
      return note.peeked ? "외통입니다. 정답을 보고 끝냈습니다." : "외통입니다. 풀었습니다.";
  }
}

export function MateSolve({
  puzzle,
  onSolve,
  title,
  lead,
  status,
  onBack,
  onNext,
  onWrong,
  help = true,
  extra,
  startNote,
  doneNote,
}: Props) {
  const s = useMateSolve(puzzle, onSolve, { onWrong });
  const defender: Side = s.attacker === "cho" ? "han" : "cho";
  const done = s.phase === "done";

  return (
    <div className="learn-fit">
      <div className="learn-main">
        <div className="learn-head">
          {onBack && (
            <div className="game-back">
              <button type="button" className="back" onClick={onBack}>
                <ChevronLeft size={20} strokeWidth={2} aria-hidden />
                목록으로
              </button>
            </div>
          )}
          {title && <h2 className="learn-title">{title}</h2>}
          <p className="muted">
            {lead ? `${lead} · ` : ""}
            {이가(SIDE_LABEL[s.attacker])} 둡니다{puzzle.quiet ? " · 첫 수가 장군 아님" : ""}
          </p>
          {status}
        </div>

        <div className="learn-stage">
          <Board
            board={s.position.board}
            flipped={s.attacker === "han"}
            selected={s.selected}
            targets={s.targets}
            lastMove={s.lastMove}
            bestMove={s.answerArrow}
            checkedKing={s.matedKing}
            onSquareClick={s.onSquareClick}
            onMove={s.onMove}
            onPick={s.onSquareClick}
            canPick={s.canPick}
            flyMove={s.flyMove}
          />
        </div>

        <div className="learn-desc mate-desc">
          <p className="mate-note" role="status">
            {noteText(s.note, puzzle, defender, startNote)}
          </p>
          {help && (
            <div className="mate-actions">
              <button type="button" onClick={s.restart} disabled={s.atStart}>
                처음부터
              </button>
              <button type="button" onClick={s.showAnswer} disabled={s.phase !== "attack" || s.answerArrow !== null}>
                정답 보기
              </button>
            </div>
          )}
          {extra}
          {done && onNext && (
            <button type="button" className="primary mate-next" onClick={onNext}>
              다음 문제
            </button>
          )}
          {done && doneNote && <p className="muted">{doneNote}</p>}
        </div>
      </div>
    </div>
  );
}
