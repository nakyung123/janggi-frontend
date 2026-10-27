// 대국자 카드 — 누가 어느 쪽을 잡았는지, 둘 차례, 남은 시간, 기물 점수
//
// 둘 차례인 쪽만 밝게 띄워서, 판을 보다가 고개를 들면 누구 차례인지 바로 읽힌다.
// 장군·빅장·승패도 '둘 차례' 자리에서 말한다(tag).
//
// 모양이 둘이다(layout).
//   stacked  넓은 화면. 오른쪽 칸 맨 위에 두 장이 포개진다(상대 위, 나 아래 - 판과
//            같은 순서). 판 위아래에 두면 판 폭만큼 긴 줄 양 끝에 이름과 시계가
//            갈라져 눈이 오가고, 판에서 세로 92px 을 가져간다.
//   row      폰. 오른쪽 칸이 판 아래로 내려가서 카드를 판 위아래에 한 줄로 붙인다.

import type { ClockSettings, SideClock } from "../../janggi/clock";
import { clockRatio, clockView } from "../../janggi/clock";
import type { PieceChar, Side } from "../../janggi/pieces";
import { SIDE_LABEL, charOf } from "../../janggi/pieces";
import type { PieceType } from "../../janggi/pieces";
import type { SideTag } from "../../janggi/status";
import { PieceBody } from "./PieceGlyph";

interface Props {
  side: Side;
  /** "나" 또는 "6급" 처럼 이 자리에 앉은 사람 */
  name: string;
  /** 사람인지 엔진인지 */
  kind: "human" | "engine";
  /** 기물 점수 (한은 덤 1.5 포함) */
  score: number;
  /** 이 진영이 잡아낸 상대 기물 */
  captured: PieceType[];
  /** 둘 차례인지 */
  active: boolean;
  /** 엔진이 지금 생각 중인지 */
  thinking?: boolean;
  /** 시계를 안 쓰면 null */
  clock: SideClock | null;
  /** 막대 길이를 재려면 '전체가 얼마였는지'를 알아야 한다. 시계와 같이 온다. */
  settings: ClockSettings | null;
  /** 장군·승패. 있으면 '둘 차례' 자리에 대신 선다. */
  tag: SideTag | null;
  /**
   * row: 판 위아래에 붙는 한 줄(폰). stacked: 오른쪽 칸의 두 줄 카드.
   * 두 줄에서는 윗줄이 누구·차례·시계, 아랫줄이 시간 막대(또는 잡은 기물)·점수다.
   * 오른쪽 칸에 높이가 남으면 카드가 커지고 시계가 한 줄을 따로 차지한다(player.css).
   */
  layout?: "row" | "stacked";
}

export function PlayerCard(props: Props) {
  const { side, name, kind, score, captured, active, thinking, clock, settings } = props;
  const view = clock ? clockView(clock) : null;
  const ratio = clock && settings ? clockRatio(clock, settings) : null;
  const opponent: Side = side === "cho" ? "han" : "cho";
  // 시간패는 시계 칸이 이미 "시간패" 로 바뀌어 있다. 같은 카드에 두 번 적지 않는다.
  const tag = view?.flagged && props.tag?.tone === "lose" ? null : props.tag;
  const layout = props.layout ?? "row";

  return (
    <div className={"player-card " + layout + " " + side + (active ? " active" : "")}>
      <span className={"player-mark " + side}>
        {SIDE_LABEL[side]}
      </span>

      <span className="player-name">
        {name}
        <span className="player-kind muted small">
          {kind === "engine" ? "AI" : "사람"}
        </span>
      </span>

      {/*
        시계를 쓰는 대국이면 시간 막대, 아니면 잡아낸 기물.

        대국 중에는 잡은 기물보다 남은 시간이 더 급한 정보라 그 자리를 막대에
        내준다. 시계를 끈 판과 기보 탭의 지난 판은 시계가 없으니 잡은 기물이 선다.

        숫자는 읽어서 계산해야 하지만 막대는 보면 안다. 둘 차례가 아닌 쪽도
        그려 둔다 - 상대에게 얼마나 남았는지가 내 수를 정하는 값이다. 읽어
        주는 것은 시계 숫자가 하므로 여기는 화면에서만 뜻이 있다.
      */}
      {ratio !== null ? (
        <span className="time-bar" aria-hidden="true">
          <i style={{ transform: `translateX(${(ratio - 1) * 100}%)` }} />
        </span>
      ) : (
        // 잡아낸 기물. 상대 기물이라 색도 상대 색으로 새긴다.
        <span className="player-captured">
          {captured.map((type, i) => (
            <svg key={type + i} viewBox="-11 -11 22 22" className="captured-piece">
              <PieceBody piece={charOf(type, opponent) as PieceChar} radius={10} flat />
            </svg>
          ))}
        </span>
      )}

      <span className="player-score">
        {score.toFixed(1)}
        <em>점</em>
        {side === "han" && <em className="player-komi">덤 1.5</em>}
      </span>

      {view && (
        <span
          className={
            "player-clock" +
            (view.inByoyomi ? " byoyomi" : "") +
            (view.urgent && active ? " urgent" : "") +
            (view.flagged ? " flagged" : "") +
            // 마지막 몇 초. 숫자를 하나 더 띄우면 초읽기 표시와 겹쳐 두 번
            // 나오므로, 있던 숫자를 크고 붉게 바꾸기만 한다.
            (view.countdown !== null && active && !view.flagged ? " counting" : "")
          }
        >
          <b aria-live={view.countdown !== null ? "assertive" : "off"}>
            {view.text}
          </b>
          {view.inByoyomi && !view.flagged && (
            <span className="byoyomi-dots">
              <span aria-hidden="true">{"●".repeat(Math.max(0, view.periods))}</span>
              <span className="sr-only">초읽기 {view.periods}회 남음</span>
            </span>
          )}
        </span>
      )}

      {/* 차례·생각 중·장군·승패. 두 줄 카드에서는 이름 바로 옆으로 간다. */}
      <span className="player-status">
        {thinking && active && <span className="player-thinking" aria-label="생각 중" />}
        {tag ? (
          <span className={"player-tag " + tag.tone}>{tag.text}</span>
        ) : (
          !thinking && active && <span className="player-turn muted small">둘 차례</span>
        )}
      </span>
      <span className="sr-only">{SIDE_LABEL[side]}</span>
    </div>
  );
}
