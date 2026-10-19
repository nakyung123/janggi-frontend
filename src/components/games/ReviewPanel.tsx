// 복기 패널 — 연 판을 엔진으로 되짚어 판에 떠 있는 수를 한 줄씩 말해 준다
//
//   복기 전     깊이를 고르고 시작한다
//   도는 중     진행률과 중단 버튼
//   복기 뒤     지금 수의 설명, 그 아래 깊이를 골라 다시 복기
//
// 판에 떠 있는 수 하나만 말한다. 수를 옮기는 것은 판 조작 줄의 이전·다음과 형세 그래프가
// 한다. 설명은 줄마다 이름을 붙인다 - 승률이 어떻게 바뀌었나, AI라면 무엇을 뒀나, 그 뒤에
// 무엇이 벌어지나. 상자나 색 띠로 감싸지 않고 패널 안에 글자로만 선다. 복기를 돌리는
// 일은 hooks/useReview.ts, 무엇을 어떻게 재는지는 janggi/review.ts 에 있다.

import {
  REVIEW_DEPTHS,
  reviewDepthById,
  reviewSeconds,
  어림시간,
} from "../../engine/levels";
import type { ReviewProgress, ReviewedMove } from "../../janggi/review";
import { GRADE_LABEL, accuracyOf, winPercent } from "../../janggi/review";
import type { Side } from "../../janggi/pieces";
import { SIDE_LABEL } from "../../janggi/pieces";

interface Props {
  moveCount: number;
  depthId: string;
  /** 엔진이 쓰는 스레드 수. 예상 시간이 여기에 반비례한다. */
  threads: number;
  onDepth: (id: string) => void;
  running: boolean;
  progress: ReviewProgress | null;
  reviewed: ReviewedMove[] | null;
  /** 이 판에서 내가 잡았던 쪽. 정확도는 이쪽이 둔 수만 센다. */
  mySide: Side;
  /** 지금 판에 떠 있는 수 (history 인덱스) */
  cursor: number;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}

export function ReviewPanel(props: Props) {
  const {
    moveCount, depthId, threads, onDepth, running, progress, reviewed, mySide, cursor, error,
    onStart, onStop,
  } = props;

  const depth = reviewDepthById(depthId);
  const current = reviewed?.find((r) => r.index === cursor) ?? null;

  // 돌아가는 중
  if (running) {
    const pct = progress ? (progress.done / progress.total) * 100 : 0;
    return (
      <div className={"panel review" + (reviewed ? " grown" : "")}>
        <div className="panel-title">
          복기
          <span className="panel-meta">
            {progress
              ? `${progress.stage === "scan" ? "훑는 중" : "자세히 보는 중"} ${progress.done} / ${progress.total}`
              : "준비 중"}
          </span>
        </div>

        {/*
          1차가 끝나면 모든 수에 설명이 붙는다. 다 끝나기를 기다릴 까닭이 없다 -
          읽는 동안 2차가 돌면서 중요한 수의 설명이 더 정확한 것으로 바뀐다.
        */}
        {reviewed &&
          (current ? (
            <MoveComment
              r={current}
              nth={reviewed.filter((r) => r.mover === current.mover && r.index <= current.index).length}
            />
          ) : (
            <p className="muted">시작 국면</p>
          ))}

        <div className="review-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="row">
          <button type="button" className="ghost stop" onClick={onStop}>
            ■ 중단
          </button>
        </div>
      </div>
    );
  }

  // 깊이 고르기와 시작 - 복기 전에도, 복기 뒤(다시 복기)에도 같은 모양으로 선다.
  const start = (
    <>
      <div className="row">
        <span className="label">깊이</span>
        <div className="seg">
          {REVIEW_DEPTHS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={d.id === depthId ? "active" : ""}
              aria-pressed={d.id === depthId}
              onClick={() => onDepth(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>
      {/*
        '깊이' 가 무슨 말인지 한 줄로 적는다. 엔진 쪽 말이라 장기 두는 사람에게는 뜻이
        서지 않는다 - 무엇을 고르는 건지 모르면 기본값을 그냥 두게 된다. 아직 한 번도
        돌리지 않았을 때만 적는다. 한 번 돌려 본 뒤에는 위에 설명이 가득 차 있다.
      */}
      {!reviewed && (
        <p className="muted review-depth-help">
          복기는 한 수마다 엔진을 한 번씩 돌립니다. 정밀할수록 등급이 믿을 만해지고
          그만큼 오래 걸립니다.
        </p>
      )}
      <div className="row">
        <button type="button" className={reviewed ? "" : "primary"} onClick={onStart}>
          {reviewed ? "다시 복기" : "복기 시작"}
        </button>
        <span className="muted">
          {moveCount}수에 {어림시간(reviewSeconds(depth, moveCount, threads))}
        </span>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );

  if (!reviewed) {
    return (
      <div className="panel review">
        <div className="panel-title">복기</div>
        {start}
      </div>
    );
  }

  /*
   * 몇 수를 다시 봤는지 한 줄로 밝힌다.
   *
   * 복기는 기보 전체를 가볍게 훑은 뒤 승률이 크게 움직인 수만 고른 깊이로 다시 본다.
   * 그러면 '좋은 수' 라고 적힌 수가 사실은 가볍게만 본 수일 수 있다. 어디까지 믿을
   * 글인지는 읽는 사람이 알아야 한다. 다시 볼 것이 하나도 없었을 때도 말해야 한다 -
   * 아무 말이 없으면 고른 깊이로 전부 본 줄로 읽는다.
   *
   * 모든 수를 같은 깊이로 본 복기(짧은 기보·'빠름')는 밝힐 것이 없다. 예전 복기에는
   * 이 값 자체가 없어서(deep === undefined) 역시 아무 말도 하지 않는다.
   */
  const deepCount = reviewed.filter((r) => r.deep).length;
  const twoPass = reviewed.some((r) => r.deep !== undefined) && deepCount < reviewed.length;
  const deepNote = !twoPass
    ? null
    : deepCount > 0
      ? `기보 전체를 훑고, 판이 갈린 ${deepCount}수를 다시 자세히 봤습니다.`
      : "기보 전체를 훑었습니다. 크게 갈린 수가 없어 더 볼 곳이 없었습니다.";

  /*
   * 내가 둔 수들의 정확도. 한 판을 숫자 하나로 말한다.
   *
   * **복기 깊이를 같이 적지 않는다.** 같은 판을 '정밀' 로 다시 복기하면 숫자가 조금
   * 달라지는데, 깊이까지 적으면 제목 줄이 길어지고 대부분은 기본값으로만 돌린다.
   * 아는 구멍이고 docs/DECISIONS.md 에 적어 두었다.
   *
   * 소수점은 버린다. 표본이 급수마다 판 두셋이라 '88.3%' 는 없는 정밀도다.
   */
  const accuracy = accuracyOf(reviewed, mySide);

  // grown — 복기를 돌린 뒤에만 이 패널이 오른쪽 칸의 남는 높이를 먹는다(layout.css).
  // 돌리기 전에는 넣을 것이 깊이와 시작 버튼뿐이라, 늘려 봐야 빈 칸만 커진다.
  return (
    <div className="panel review grown">
      <div className="panel-title">
        복기
        {accuracy !== null && <span className="panel-meta">정확도 {Math.round(accuracy)}%</span>}
      </div>
      {current ? (
        <MoveComment
          r={current}
          nth={reviewed.filter((r) => r.mover === current.mover && r.index <= current.index).length}
        />
      ) : (
        <p className="muted">시작 국면</p>
      )}
      <div className="review-again">
        {deepNote && <p className="muted review-deep-note">{deepNote}</p>}
        {start}
      </div>
    </div>
  );
}

/**
 * 한 수의 설명.
 *
 *   14사24  한의 6번째 수                 ?! 부정확
 *   승률        한 35% → 27%
 *   AI의 수     32포35 · 마를 잡는 자리
 *   그 뒤       초가 43졸33으로 마를 가져갑니다.
 *
 * 몇 번째 수인지는 둔 쪽의 수를 센다.
 */
function MoveComment({ r, nth }: { r: ReviewedMove; nth: number }) {
  const cho = [winPercent(r.scoreBefore), winPercent(r.scoreAfter)];
  const [before, after] = r.mover === "cho" ? cho : cho.map((p) => 100 - p);
  const { verdict, best, bestDoes, after: then } = r.note;

  return (
    <div className={"review-move g-" + r.grade}>
      <div className="review-move-head">
        <b className={"review-move-notation " + r.mover}>{r.playedNotation}</b>
        <span className="muted">
          {SIDE_LABEL[r.mover]}의 {nth}번째 수
        </span>
        {/* 등급은 이름과 색으로만 말한다. 체스 기호(??·?!)는 뺐다 - 옆에 "악수" 라고
            이미 적혀 있어서 같은 말을 한 번 더 하는 것이었다. */}
        <span className="review-grade">{GRADE_LABEL[r.grade]}</span>
      </div>

      {/* 기보 표기(59차69)는 좌표를 읽을 줄 알아야 뜻이 생긴다. 무슨 수였는지를
          먼저 말로 한 줄 적는다. 예전에 둔 판의 복기에는 이 값이 없다. */}
      {r.playedPlain && <p className="review-plain muted">{r.playedPlain}</p>}

      {verdict && <p className="review-verdict">{verdict}</p>}

      <dl className="review-facts">
        <dt>승률</dt>
        <dd>
          {SIDE_LABEL[r.mover]} {before}% → <b>{after}%</b>
        </dd>
        {best && (
          <>
            <dt>AI의 수</dt>
            <dd>
              <b className={r.mover}>{best}</b>
              {bestDoes && ` · ${bestDoes}`}
            </dd>
          </>
        )}
        {then && (
          <>
            <dt>그 뒤</dt>
            <dd>{then}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
