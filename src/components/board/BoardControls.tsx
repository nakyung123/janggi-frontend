// 판 조작 줄 — 오른쪽 칸의 버튼 두 줄
//
//   윗줄: 처음 · 무르기(이전) · 다시(다음) · 끝   — 기보를 오간다
//   가운데: 수 슬라이더 (기보 탭에만)             — 멀리 있는 수로 건너뛴다
//   아랫줄: 판 뒤집기 · 한수쉼                     — 판에 손댄다
//
// 판 아래가 아니라 오른쪽 칸에 둔다. 이 앱은 페이지가 스크롤되지 않아 남는 세로가 곧
// 판 크기라, 판 아래 한 줄(44px)은 그대로 판에서 빠진다. 가로는 판 옆이 남는다.

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { BoardMode } from "../../screens";

/*
 * 아이콘은 Lucide(선 아이콘, 24 격자). 선 굵기 2 는 버튼 글자 굵기(500)와 맞춘 값이다.
 * 글자 화살표(⇤ ← → ⇥)는 글꼴마다 모양과 굵기가 달라 버튼 글자와 따로 논다.
 *
 * 아이콘은 기보를 오가는 윗줄에만 둔다. '처음·이전·다음·끝' 은 어디서나 같은
 * 모양으로 통하지만, 판 뒤집기·한수쉼은 그림으로 옮기면 뜻이 흐려진다
 * (한수쉼을 일시정지로 그리면 시계를 멈추는 버튼으로 읽힌다).
 */
const ICON = { size: 20, strokeWidth: 2, "aria-hidden": true } as const;

interface Props {
  mode: BoardMode;
  /** 지금 보고 있는 수의 번호 */
  cursor: number;
  /** 기보의 마지막 칸 번호 */
  last: number;
  /** 한수쉼을 둘 수 있는지. 내 차례이고, 엔진이 한수쉼을 합법수로 알려 줬을 때만이다. */
  canPass: boolean;
  /**
   * 대국 탭의 판이 끝났는지. 끝난 판은 무를 수 없어서 '무르기·다시' 가 기보
   * 탭처럼 한 칸씩 오가는 '이전·다음' 이 된다(판은 App 이 잠근다).
   */
  finished: boolean;
  onJump: (index: number) => void;
  /** 대국 중의 '무르기'는 한 칸이 아니라 내 차례가 나올 때까지 되감는다. */
  onUndo: () => void;
  onFlip: () => void;
  onPass: () => void;
}

export function BoardControls(props: Props) {
  const { mode, cursor, last, canPass, finished, onJump, onUndo, onFlip, onPass } = props;

  const atStart = cursor === 0;
  const atEnd = cursor >= last;
  // 두는 중인 대국에서만 무르기·다시다. 끝난 판과 기보 탭은 한 칸씩 오간다.
  const undoing = mode === "play" && !finished;

  /*
   * 수 슬라이더. 기보 탭에만, 오갈 수가 있을 때만 둔다.
   *
   * 예전에는 형세 그래프를 눌러 건너뛰었다. 그래프를 빼면서 이리로 옮겼는데, 오히려
   * 이 자리가 맞다 - 그래프는 복기를 돌린 뒤에야 떠서 그 전에는 건너뛸 방법이 아예
   * 없었다. 슬라이더는 수가 몇이든 모양이 같고 복기와도 무관하다.
   *
   * 대국 탭에는 두지 않는다. 두는 중에 뒤로 가는 것은 '무르기' 라 내 차례까지 되감는
   * 규칙이 따로 있고, 끌어서 아무 데나 가면 그 규칙과 어긋난다. 끝난 판에도 두지
   * 않는다 - 한동안 뒀는데, 판이 끝나는 순간 조작 줄에 없던 줄이 하나 생겨 아래 버튼
   * 자리가 밀렸다. 지난 판을 되짚는 일은 기보 탭이 한다.
   */
  const scrubbing = mode === "games" && last > 0;

  /*
   * 두 줄로 나눈다.
   *
   * 여섯 개를 한 줄에 두면 오른쪽 칸(400px) 에 다 들어가지 않아 마지막 하나가
   * 혼자 아래로 떨어진다. 저절로 넘어간 줄은 '자리가 모자랐구나' 로 읽힌다.
   * 어차피 하는 일도 둘로 갈린다 - 위는 기보를 오가는 것, 아래는 판에 손대는
   * 것이다. 나눠 놓으면 줄바꿈이 뜻을 갖는다.
   */
  return (
    <div className="board-controls">
      <div className="board-actions">
        <button
          type="button"
          className="icon"
          disabled={atStart}
          onClick={() => onJump(0)}
          aria-label="처음으로"
        >
          <ChevronsLeft {...ICON} />
        </button>
        <button
          type="button"
          disabled={atStart}
          onClick={() => (undoing ? onUndo() : onJump(cursor - 1))}
        >
          <ChevronLeft {...ICON} />
          {undoing ? "무르기" : "이전"}
        </button>
        <button
          type="button"
          disabled={atEnd}
          onClick={() => onJump(cursor + 1)}
        >
          {undoing ? "다시" : "다음"}
          <ChevronRight {...ICON} />
        </button>
        <button
          type="button"
          className="icon"
          disabled={atEnd}
          onClick={() => onJump(last)}
          aria-label="끝으로"
        >
          <ChevronsRight {...ICON} />
        </button>
      </div>

      {scrubbing && (
        <div className="move-scrub">
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={cursor}
            onChange={(e) => onJump(Number(e.target.value))}
            aria-label="수 옮기기"
          />
          <span className="move-scrub-no">
            {cursor}/{last}수
          </span>
        </div>
      )}

      <div className="board-actions">
        <button type="button" onClick={onFlip}>
          판 뒤집기
        </button>
        {/* 기보 탭은 지난 판을 읽기만 한다. 둘 수가 없으니 한수쉼도 없다. */}
        {mode === "play" && (
          <button type="button" disabled={!canPass} onClick={onPass}>
            한수쉼
          </button>
        )}
      </div>
    </div>
  );
}
