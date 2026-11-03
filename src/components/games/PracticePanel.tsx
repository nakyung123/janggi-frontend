// 연습 칸 - 기보 탭에서 연습 판을 두는 동안 형세·복기 칸 자리에 선다
//
//   제목 줄   연습 ············ 상대가 생각 중… / 힌트 한 줄
//   한 줄     무엇을 다시 두는지와, 기보에 남지 않는다는 것
//   끝나면    끝난 까닭 한 줄
//   버튼      처음부터 다시 · 복기로 돌아가기
//
// 결과 창은 띄우지 않는다. 결과 창은 대국 탭에서 판이 끝나는 순간의 일이고, 승패는 대국자
// 카드가 이미 적는다. 연습 판을 두는 일(엔진·수 두기)은 App 과 hooks/usePractice.ts 에 있다.

import { josa } from "../../janggi/korean";
import type { Side } from "../../janggi/pieces";
import { SIDE_LABEL } from "../../janggi/pieces";
import type { Outcome } from "../../janggi/status";
import { outcomeMessage } from "../../janggi/status";

interface Props {
  /** 다시 두는 수. "초의 2번째 수(75졸65)" 처럼 적는다. */
  retry: { mover: Side; nth: number; notation: string };
  /** AI 의 급수 이름 */
  levelName: string;
  /** 엔진이 지금 생각하고 있는지 */
  thinking: boolean;
  /** 힌트 한 줄("AI의 수 43병53" 등). 엔진이 생각하는 동안에는 그 말이 먼저 선다. */
  hintNote: string | null;
  /** 지금 보는 국면에서 끝났으면 어떻게 끝났는지 */
  outcome: Outcome | null;
  onRestart: () => void;
  onBack: () => void;
}

export function PracticePanel(props: Props) {
  const { retry, levelName, thinking, hintNote, outcome, onRestart, onBack } = props;

  return (
    <div className="panel practice">
      <div className="panel-title">
        연습
        {thinking ? (
          <span className="panel-meta">상대가 생각 중…</span>
        ) : (
          hintNote && <span className="panel-meta">{hintNote}</span>
        )}
      </div>

      <p className="muted">
        {SIDE_LABEL[retry.mover]}의 {retry.nth}번째 수({retry.notation}) 전 국면부터{" "}
        {josa(levelName, "과", "와")} 다시 둡니다. 연습한 판은 기보에 남지 않습니다.
      </p>

      {outcome && <p className="practice-result">{outcomeMessage(outcome)}</p>}

      {/* 둘 다 테두리 버튼이다. 채운 버튼을 두면 둘 중 하나를 먼저 누르라는 말이 된다. */}
      <div className="row practice-actions">
        <button type="button" onClick={onRestart}>
          처음부터 다시
        </button>
        <button type="button" onClick={onBack}>
          복기로 돌아가기
        </button>
      </div>
    </div>
  );
}
