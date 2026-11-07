// 대국 패널 — 내가 잡을 쪽, 상대 급수, 시계, 규칙, 상차림, 새 대국·기권
//
// 한 판 두는 데 필요한 것만 둔다. 스레드·해시 같은 엔진 설정은 화면에 두지 않는다.
// 결과는 여기서 말하지 않는다(가운데 결과 창과 대국자 카드가 말한다). 이 칸은
// '이 판을 어떻게 둘까' 를 정하는 곳이다.

import { useId } from "react";
import { LEVELS, levelById, levelWaitLabel } from "../../engine/levels";
import type { Variant } from "../../engine/types";
import { CLOCK_PRESETS, describeClock } from "../../janggi/clock";
import type { Side } from "../../janggi/pieces";
import { SIDE_LABEL } from "../../janggi/pieces";
import { SETUPS } from "../../janggi/setups";
import type { Setup } from "../../janggi/setups";
import { Dropdown } from "../common/Dropdown";


/**
 * 규칙. 엔진 설정이 아니라 대국 설정이다 - 스레드·해시는 '얼마나 깊게 볼까' 지만
 * 규칙은 '이 판을 어떻게 둘까' 다. 판이 시작되면 상차림과 같이 잠근다.
 *
 * 설명(desc)은 드롭다운 목록에서 이름 아래 한 줄로 보인다. 무엇이 다른지만 적는다.
 * 양쪽이 한수쉼을 이어 두면 판이 끝나는 것은 셋이 같다(점수제면 점수로, 전통은 비김).
 */
export const VARIANT_OPTIONS: { id: Variant; label: string; desc: string }[] = [
  { id: "janggi", label: "표준", desc: "빅장은 점수로 · 200수 뒤 점수로" },
  { id: "janggimodern", label: "현대(카카오)", desc: "빅장 없음 · 같은 수 되풀이 금지 · 200수 뒤 점수로" },
  { id: "janggitraditional", label: "전통", desc: "빅장은 무승부 · 점수제 없음" },
];

interface Props {
  mySide: Side;
  levelId: string;
  /** 대국이 이미 시작됐는지 (판에 수가 하나라도 놓였는지. 엔진의 수도 센다) */
  started: boolean;
  /** 내가 이 판에 한 수라도 뒀는지. 쪽·급수는 이때부터 잠긴다(App 의 moved 주석). */
  moved: boolean;
  /**
   * 이 판이 끝났는지. 끝난 판은 새 대국을 눌러야 설정이 풀린다.
   * 지금 보고 있는 국면이 아니라 판 전체로 본다(App 의 ended 주석).
   */
  ended: boolean;
  clockId: string;
  onClock: (id: string) => void;
  variant: Variant;
  onVariant: (v: Variant) => void;
  /** 엔진이 지금 생각하고 있는지 */
  thinking: boolean;
  /** 힌트 한 줄("AI의 수 43병53" 등). 엔진이 생각하는 동안에는 그 말이 먼저 선다. */
  hintNote: string | null;
  onMySide: (side: Side) => void;
  onLevel: (id: string) => void;
  /** 이 판을 시작한 상차림. 시작 국면이 넷 중 어느 것도 아니면 null. */
  setups: Record<Side, Setup | null>;
  onSetup: (side: Side, setup: Setup) => void;
  onNewGame: () => void;
  onResign: () => void;
}

export function PlayPanel(props: Props) {
  const {
    mySide, levelId, started, moved, ended, thinking, hintNote,
    clockId, onClock, variant, onVariant,
    onMySide, onLevel, setups, onSetup, onNewGame, onResign,
  } = props;

  const level = levelById(levelId);
  const levelLabel = useId();
  const variantLabel = useId();

  /*
   * 잠금은 세 겹이다.
   *
   * 규칙·상차림은 판에 첫 수가 놓이면 잠긴다. 두던 중에 승부 조건이 바뀌면 안 된다.
   * 쪽·급수는 내가 첫 수를 두면 잠긴다. 전적은 판이 끝난 순간의 급수·쪽으로 세므로, 두는
   * 중에 바꾸면 다른 급수와 둔 판이 그 급수의 전적에 든다. 한을 잡으면 엔진이 먼저 두므로
   * '판의 첫 수' 가 아니라 '내 첫 수' 다.
   * 시계는 두는 동안에는 풀어 두고, 판이 끝나면 잠근다. 끝난 판에서 시계를 바꾸면 양쪽
   * 시계가 새로 차 시간패가 지워진다. 끝난 판은 새 대국으로만 넘어간다.
   */
  const sideLocked = ended || moved;
  return (
    <div className="panel play">
      <div className="panel-title">
        대국
        {/*
          높이가 정해진 줄이라 말이 뜨고 져도 아래 칸이 움직이지 않는다. 힌트는 내 차례에만
          찾으니 '상대가 생각 중' 과 겹치지 않는다.
        */}
        {thinking ? (
          <span className="panel-meta">상대가 생각 중…</span>
        ) : (
          hintNote && <span className="panel-meta">{hintNote}</span>
        )}
      </div>

      <div className="row">
        <span className="label">내가 잡을 쪽</span>
        <div className="seg">
          {(
            [
              ["cho", SIDE_LABEL.cho],
              ["han", SIDE_LABEL.han],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={(mySide === id ? "active " : "") + id}
              aria-pressed={mySide === id}
              disabled={sideLocked}
              onClick={() => onMySide(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* 급수는 이름과 한 수에 걸리는 시간만 보여준다. 목록은 늘 아래로 8줄까지 펼친다. */}
      <div className="row">
        <span className="label" id={levelLabel}>
          상대 급수
        </span>
        <Dropdown
          value={level.id}
          labelledBy={levelLabel}
          disabled={sideLocked}
          onChange={onLevel}
          options={LEVELS.map((l) => {
            const wait = levelWaitLabel(l);
            return { value: l.id, label: l.name, hint: wait ? `한 수 ${wait}` : undefined };
          })}
        />
      </div>

      {/*
        시계는 두 가지라 셀렉트 대신 분절 버튼이다. 펼쳐 봐야 둘뿐인 것을
        접어 둘 까닭이 없다. 5분의 초읽기(30초 3회)는 두는 동안 대국자 카드가 보여준다.
        화면 읽기 프로그램에는 버튼 이름에 붙여 읽힌다.
      */}
      <div className="row">
        <span className="label">시계</span>
        <div className="seg">
          {CLOCK_PRESETS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={clockId === c.id ? "active" : ""}
              aria-pressed={clockId === c.id}
              disabled={ended}
              onClick={() => onClock(c.id)}
            >
              {c.name}
              {c.enabled && <span className="sr-only"> ({describeClock(c)})</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <span className="label" id={variantLabel}>
          규칙
        </span>
        <Dropdown
          value={variant}
          labelledBy={variantLabel}
          disabled={started}
          onChange={onVariant}
          // 설명은 목록에서 이름 아래에 보인다. 고르면서 무슨 규칙인지 안다.
          options={VARIANT_OPTIONS.map((v) => ({ value: v.id, label: v.label, desc: v.desc }))}
        />
      </div>
      {/*
        무엇이 언제 잠기는지 적어 둔다. 잠긴 칸은 눌러도 아무 말이 없다.
        두 말 다 한 줄에 들어가게 짧게 둔다(오른쪽 칸 폭 400 에서 컨트롤 칸은 한글
        열여섯 자 남짓).
      */}
      <p className="muted small field-note">
        {sideLocked ? "잠긴 칸은 새 대국에서 풀립니다." : "시계 말고는 첫 수에 잠깁니다."}
      </p>

      {/*
        고른 상차림을 짚어 준다(App 이 시작 국면에서 되읽는다). 대국이 시작되면
        잠기지만 고른 칸은 그대로 남아 '이것으로 두고 있다' 를 말한다.

        랜덤은 두지 않는다. 누르는 순간 넷 중 하나로 정해져 고른 칸 표시와 겹치고
        (랜덤을 눌렀는데 다른 칸이 켜진다), 한 줄에 다섯을 넣으면 칸이 좁아진다.
      */}
      <div className="setup-block">
        <span className="label">상차림</span>
        {(["cho", "han"] as Side[]).map((side) => (
          <div key={side} className="row setup-row">
            <span className={"setup-side " + side}>{SIDE_LABEL[side]}</span>
            <div className="seg">
              {SETUPS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={setups[side]?.id === s.id ? "active" : ""}
                  aria-pressed={setups[side]?.id === s.id}
                  disabled={started}
                  onClick={() => onSetup(side, s)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 누르면 App 이 확인 창(ConfirmDialog)으로 한 번 더 묻는다. */}
      <div className="row">
        <button type="button" className="primary" onClick={onNewGame}>
          새 대국
        </button>
        <button
          type="button"
          className="ghost"
          // 끝난 판에는 기권할 것이 없다. 지금 보는 국면이 아니라 판 전체로 본다 -
          // 외통으로 끝난 판을 되짚는 중에 누르면 외통승이 기권패로 덮인다.
          disabled={!started || ended}
          onClick={onResign}
        >
          기권
        </button>
      </div>

    </div>
  );
}
