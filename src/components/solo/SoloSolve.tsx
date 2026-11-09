// 혼자 장기 한 문제를 푸는 화면
//
//   목록으로 · 제목 · 기물 몇 개 → 판 → 알림 줄 · 한 수 무르기 | 처음부터 · (푼 뒤) 다음 문제
//
// 짜임은 외통 풀기 화면(MateSolve)과 같다 - 기물 화면(PiecesScreen)의 판 화면(learn.css)을 쓰고, 알림
// 줄·단추 줄은 mate.css 의 것을 그대로 쓴다. 넓은 화면은 판 | 오른쪽 칸, 폰은 위 순서로 쌓는다. 알림
// 줄을 판 아래에 두어서 폰에서 글이 바뀌어도 판이 밀리지 않는다.
//
// MateSolve 를 같이 쓰지 않는다. 그 화면은 정해진 답·응수·정답 보기로 짜여 있고, 이 화면은 정해진
// 답이 없고 막힘·무르기가 있다. 함께 쓰면 외통 문제·오늘의 문제·시간 도전까지 바뀐다.
//
// 판은 초가 아래다(뒤집지 않는다). 궁이 없어 장군 표시도, 대국의 판 조작 줄도 없다.

import { ChevronLeft } from "lucide-react";
import type { SoloNote } from "../../hooks/useSolo";
import { useSolo } from "../../hooks/useSolo";
import type { SoloPuzzle } from "../../janggi/solo";
import { boardOf, pieceCount } from "../../janggi/solo";
import { Board } from "../board/Board";

interface Props {
  puzzle: SoloPuzzle;
  /** 머리 칸 제목(24/700). "쉬움 · 3번" */
  title: string;
  /** 하나만 남겼다. 푼 기록에 남긴다. */
  onSolve: (id: string) => void;
  onBack: () => void;
  /** 다음 문제로. 푼 뒤에 선다. 마지막 문제면 null. */
  onNext: (() => void) | null;
}

function noteText(note: SoloNote): string {
  switch (note.kind) {
    case "start":
      return "상대 편 기물을 잡아 하나만 남기세요.";
    case "left":
      return `남은 기물 ${note.count}개.`;
    case "stuck":
      return "더 잡을 수 있는 수가 없습니다. 한 수 무르거나 처음부터 하세요.";
    case "solved":
      return "하나만 남았습니다. 풀었습니다.";
  }
}

export function SoloSolve({ puzzle, title, onSolve, onBack, onNext }: Props) {
  const s = useSolo(puzzle, onSolve);
  const solved = s.state === "solved";

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
          <h2 className="learn-title">{title}</h2>
          <p className="muted">기물 {pieceCount(boardOf(puzzle))}개 · 하나만 남기세요</p>
        </div>

        <div className="learn-stage">
          <Board
            board={s.board}
            flipped={false}
            selected={s.selected}
            targets={s.targets}
            lastMove={s.lastMove}
            bestMove={null}
            onSquareClick={s.onSquareClick}
            onMove={s.onMove}
            onPick={s.onSquareClick}
            canPick={s.canPick}
            flyMove={s.flyMove}
          />
        </div>

        <div className="learn-desc mate-desc">
          <p className="mate-note" role="status">
            {noteText(s.note)}
          </p>
          <div className="mate-actions">
            <button type="button" onClick={s.undo} disabled={s.atStart}>
              한 수 무르기
            </button>
            <button type="button" onClick={s.restart} disabled={s.atStart}>
              처음부터
            </button>
          </div>
          {solved && onNext && (
            <button type="button" className="primary mate-next" onClick={onNext}>
              다음 문제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
