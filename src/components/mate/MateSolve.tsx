// 외통 문제 하나를 푸는 화면
//
//   목록으로 · 제목 · 누가 두나 → 판 → 알림 줄 · 처음부터 | 정답 보기 · (푼 뒤) 다음 문제
//
// 짜임은 기물 화면(PiecesScreen)의 판 화면을 그대로 쓴다(learn.css) - 넓은 화면은 판 | 오른쪽
// 칸, 폰은 위 순서로 쌓는다. 알림 줄을 판 아래에 두어서 폰에서 글이 바뀌어도 판이 밀리지 않는다.
//
// 판은 공격 쪽을 아래에 둔다. 한이 공격하는 문제는 뒤집어 놓는다. 판 뒤집기 단추는 두지 않고,
// 대국의 판 뒤집기 설정도 읽지 않는다. 대국의 판 조작 줄(처음·끝·무르기·한수쉼·힌트)도 쓰지
// 않는다 - 이 화면에서 쓸 단추가 그 줄에 없다.

import { ChevronLeft } from "lucide-react";
import { useMateSolve } from "../../hooks/useMateSolve";
import type { MateNote } from "../../hooks/useMateSolve";
import { 은는, 으로, 이가 } from "../../janggi/korean";
import type { MatePuzzle } from "../../janggi/mate";
import { numberOf } from "../../janggi/mate";
import type { Side } from "../../janggi/pieces";
import { SIDE_LABEL } from "../../janggi/pieces";
import { Board } from "../board/Board";

interface Props {
  puzzle: MatePuzzle;
  /** 정답을 보지 않고 끝까지 뒀다. 푼 기록에 남긴다. */
  onSolve: (id: string) => void;
  /** 다음 문제로. 마지막 문제면 없다. */
  onNext: (() => void) | null;
  onBack: () => void;
}

/** 알림 줄의 글. */
function noteText(note: MateNote, puzzle: MatePuzzle, defender: Side): string {
  switch (note.kind) {
    case "start":
      return `${puzzle.n}수 안에 외통을 거세요.`;
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

export function MateSolve({ puzzle, onSolve, onNext, onBack }: Props) {
  const s = useMateSolve(puzzle, onSolve);
  const defender: Side = s.attacker === "cho" ? "han" : "cho";

  return (
    <div className="learn-fit">
      <div className="learn-main">
        <div className="learn-head">
          <div className="game-back">
            <button type="button" className="back" onClick={onBack}>
              <ChevronLeft size={20} strokeWidth={2} aria-hidden />
              목록으로
            </button>
          </div>
          <h2 className="learn-title">
            {puzzle.n}수 외통 · {numberOf(puzzle)}번
          </h2>
          <p className="muted">
            {이가(SIDE_LABEL[s.attacker])} 둡니다{puzzle.quiet ? " · 첫 수가 장군 아님" : ""}
          </p>
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
            {noteText(s.note, puzzle, defender)}
          </p>
          <div className="mate-actions">
            <button type="button" onClick={s.restart} disabled={s.atStart}>
              처음부터
            </button>
            <button type="button" onClick={s.showAnswer} disabled={s.phase !== "attack" || s.answerArrow !== null}>
              정답 보기
            </button>
          </div>
          {s.phase === "done" && onNext && (
            <button type="button" className="primary mate-next" onClick={onNext}>
              다음 문제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
