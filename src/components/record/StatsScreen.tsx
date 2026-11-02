// 내 전적 - 실력 점수, 급수별 전적, 정확도 변화, 실수 횟수
//
// 숫자는 hooks/useStats.ts 가 준다(서버에 올라간 판으로 센 computeStats 결과). 이 화면은 그
// 모양만 그린다. 짜임은 배우기 글 화면과 같다 - 폭 640 한 단(learn.css 의 .learn-doc), 카드
// 안쪽은 record.css.
//
// **못 낼 때는 숫자 카드를 그리지 않는다.** 로그인하지 않았거나 서버 목록을 못 받았으면 그
// 까닭을 문장으로 적는다. 0 이나 빈 표로 그리면 실패가 "둔 판이 없다" 로 읽힌다.
//
// 승률은 퍼센트로 나누지 않고 판 수로 적는다. "1판 1승" 이 "100%" 로 읽히지 않게 하려는
// 것이다(2026-10-27 승인된 설계).

import type { StatsView } from "../../hooks/useStats";
import { useStats } from "../../hooks/useStats";
import type { AccuracyPoint, MistakeCount, PhaseCount } from "../../hooks/stats";
import { EARLY_GAMES, RECENT_REVIEWED } from "../../hooks/stats";
import { RESIGN_ON_ABANDON_PLIES } from "../../janggi/archive";
import type { ScreenProps } from "../../screens";

export function StatsScreen({ games, server }: ScreenProps) {
  const view = useStats(server, games);
  return (
    <div className="learn-doc">
      <h2 className="learn-title">내 전적</h2>
      {view.state === "ok" ? <Numbers view={view} /> : <NoNumbers view={view} />}
    </div>
  );
}

/** 숫자를 낼 수 없을 때. 무엇 때문인지 한 가지만 말한다. */
function NoNumbers({ view }: { view: Exclude<StatsView, { state: "ok" }> }) {
  switch (view.state) {
    case "checking":
      return <p className="muted">로그인 상태를 확인하는 중입니다…</p>;
    case "loading":
      return <p className="muted">서버에서 기보 목록을 받는 중입니다…</p>;
    case "signed-out":
      // 로그인 단추를 하나 더 두지 않는다. 헤더 오른쪽 위에 늘 있다 - 같은 화면에 둘이면
      // 어느 쪽을 눌러야 하는지 망설인다(기보 목록과 같은 까닭).
      return (
        <div className="panel record-lines">
          <p>로그인하면 내 전적과 실력 점수를 볼 수 있습니다.</p>
          <p className="muted">
            로그인한 뒤에 끝낸 판이 서버에 남고, 그 판으로 셉니다. 로그인은 화면 오른쪽 위에 있습니다.
          </p>
        </div>
      );
    case "failed":
      return (
        <div className="panel record-lines" role="alert">
          <p>기보 목록을 받지 못해 숫자를 낼 수 없습니다.</p>
          <p className="muted">{view.message}</p>
          <div>
            <button type="button" onClick={view.retry}>
              다시 받기
            </button>
          </div>
        </div>
      );
  }
}

function Numbers({ view }: { view: Extract<StatsView, { state: "ok" }> }) {
  const { stats, nearestLevelName, full, limit, syncError } = view;
  return (
    <>
      <p className="muted">서버에 남은 판으로 셉니다. 어느 기기에서 봐도 같습니다.</p>
      {syncError && (
        <p className="record-alert" role="alert">
          {syncError}
        </p>
      )}

      {stats.rating === null ? (
        <div className="panel record-lines">
          <p>아직 점수에 센 판이 없습니다.</p>
          <p className="muted">
            로그인한 상태로 AI 와 한 판을 끝까지 두면 여기에 점수가 생깁니다. 기권한 판과{" "}
            {RESIGN_ON_ABANDON_PLIES}수 이상 두다 새 대국으로 버린 판은 진 판으로 셉니다. 파일에서
            불러온 기보는 세지 않습니다.
          </p>
        </div>
      ) : (
        <>
          <section className="panel">
            <h3 className="panel-title">실력 점수</h3>
            <div className="record-lines">
              <p className="record-score">
                <span className="record-score-num">{stats.rating.value}</span>
                <span className="record-score-near">{nearestLevelName}과 비슷</span>
              </p>
              <p className="muted">AI 와 둔 {stats.counted}판으로 셌습니다.</p>
              {/* 처음 몇 판은 한 판에 움직이는 크기가 두 배다(stats.ts 의 K_EARLY). */}
              {stats.counted <= EARLY_GAMES && (
                <p className="muted">처음 {EARLY_GAMES}판은 점수가 크게 움직입니다.</p>
              )}
              {full && (
                <p className="record-warn">
                  서버에 남길 수 있는 {limit}판이 찼습니다. 그 뒤에 둔 판은 점수에 들어가지 않습니다.
                </p>
              )}
            </div>
          </section>

          <section className="panel">
            <h3 className="panel-title">급수별 전적</h3>
            <dl className="record-levels">
              {stats.byLevel.map((l) => (
                <div key={l.levelId}>
                  <dt>{l.levelName}</dt>
                  {/* 비긴 판이 없으면 "무" 를 뺀다. 승·패는 0 이어도 적는다(센 판의 수다). */}
                  <dd>{`${l.played}판 · ${l.won}승 ${l.drawn > 0 ? `${l.drawn}무 ` : ""}${l.lost}패`}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="panel">
            <h3 className="panel-title">정확도 변화</h3>
            {stats.accuracy.length === 0 ? <NotReviewed /> : <Accuracy points={stats.accuracy} />}
          </section>

          <section className="panel">
            <h3 className="panel-title">실수 횟수</h3>
            {stats.mistakes.length === 0 ? <NotReviewed /> : <Mistakes games={stats.mistakes} />}
          </section>

          <p className="muted">
            정확도와 실수 횟수는 이 기기에서 복기한 최근 {RECENT_REVIEWED}판으로 셉니다.
          </p>
        </>
      )}
    </>
  );
}

function NotReviewed() {
  return (
    <p className="muted">복기한 판이 없습니다. 기보에서 판을 열고 복기를 돌리면 여기에 쌓입니다.</p>
  );
}

/** 정확도는 정수 % 로 적는다. 복기 패널(ReviewPanel)과 같은 셈이라 같은 판이 같은 숫자로 보인다. */
const pct = (v: number) => `${Math.round(v)}%`;

/**
 * 판마다 막대 하나, 왼쪽이 오래된 판. 한 판뿐이면 막대 하나짜리 그래프를 그리지 않고 숫자만
 * 적는다. 한 계열이라 한 색이고 범례가 없다(제목이 이름이다).
 *
 * 툴팁은 두지 않는다(DESIGN.md). 값은 아래 한 줄과, 화면 읽기 프로그램에는 막대 묶음의 이름이
 * 말한다.
 */
function Accuracy({ points }: { points: AccuracyPoint[] }) {
  const last = points[points.length - 1].value;
  if (points.length === 1) {
    return (
      <div className="record-lines">
        <p>1판 {pct(last)}</p>
        <p className="muted">판이 쌓이면 변화가 보입니다.</p>
      </div>
    );
  }
  const mean = points.reduce((s, p) => s + p.value, 0) / points.length;
  return (
    <div className="record-lines">
      <div
        className="record-bars"
        role="img"
        aria-label={`판마다 정확도, 오래된 판부터: ${points.map((p) => pct(p.value)).join(", ")}`}
      >
        {points.map((p) => (
          <span key={p.clientId}>
            <i style={{ height: `${p.value}%` }} />
          </span>
        ))}
      </div>
      <p className="record-bars-ends muted" aria-hidden="true">
        <span>오래된 판</span>
        <span>최근 판</span>
      </p>
      <p>
        최근 판 {pct(last)} · {points.length}판 평균 {pct(mean)}
      </p>
    </div>
  );
}

const phaseLabel = (p: PhaseCount) => (p.to === null ? `${p.from}수~` : `${p.from}~${p.to}수`);

/**
 * 한 판 평균과 구간 표. 구간마다 내 수를 같이 적는다 - 21~60수는 원래 내 수가 가장 많아
 * 횟수도 많이 나온다. 내 수가 0 인 구간은 그 구간까지 간 판이 없다는 뜻이라 0 이 아니라 "-".
 */
function Mistakes({ games }: { games: MistakeCount[] }) {
  const n = games.length;
  const blunders = games.reduce((s, g) => s + g.blunders, 0);
  const inaccuracies = games.reduce((s, g) => s + g.inaccuracies, 0);
  const phases = games[0].byPhase.map((p, i) => ({
    label: phaseLabel(p),
    myMoves: games.reduce((s, g) => s + g.byPhase[i].myMoves, 0),
    blunders: games.reduce((s, g) => s + g.byPhase[i].blunders, 0),
    inaccuracies: games.reduce((s, g) => s + g.byPhase[i].inaccuracies, 0),
  }));
  return (
    <div className="record-lines">
      <p>
        {n === 1
          ? `큰 실수 ${blunders}번 · 아쉬운 수 ${inaccuracies}번`
          : `한 판에 큰 실수 ${(blunders / n).toFixed(1)}번 · 아쉬운 수 ${(inaccuracies / n).toFixed(1)}번`}
      </p>
      <table className="record-table">
        <thead>
          <tr>
            <th scope="col">구간</th>
            <th scope="col">내 수</th>
            <th scope="col">큰 실수</th>
            <th scope="col">아쉬운 수</th>
          </tr>
        </thead>
        <tbody>
          {phases.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              {p.myMoves === 0 ? (
                <>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                </>
              ) : (
                <>
                  <td>{p.myMoves}</td>
                  <td>{p.blunders}</td>
                  <td>{p.inaccuracies}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">수 번호는 양쪽 수를 이어 센 것입니다.</p>
    </div>
  );
}
