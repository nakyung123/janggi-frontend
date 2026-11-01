// 규칙 - 상차림 · 궁성 · 장군과 멍군 · 외통 · 한수쉼 · 빅장 · 덤 · 점수 계산
//
// 글은 대한장기협회 누리집의 대국 규칙을 우리 말로 다시 쓴 것이다. 이 앱이 정한 것(규칙마다
// 다른 빅장, 200수 뒤 점수)은 이 앱의 것이라고 적는다. 빅장은 이 앱의 표준 규칙이 협회
// 점수제와 다르다는 것도 적는다.
//
// 상차림 이름·기물 점수·덤·수 제한은 대국이 쓰는 값(setups.ts · pieces.ts · status.ts)을
// 그대로 읽는다. 글에 따로 적어 두면 한쪽만 바뀐다. 상차림은 대국 화면의 단추와 같은 순서
// 이름(마상상마 등)만 쓴다 - 별명(원앙마 등)은 화면에 나온 적이 없고, 협회는 그 말을 차림이
// 아니라 포진 이름으로 쓴다.

import { START_FEN, parseFen } from "../../janggi/board";
import type { PieceType } from "../../janggi/pieces";
import { HAN_DEOM, charOf, pieceInfo } from "../../janggi/pieces";
import type { Setup } from "../../janggi/setups";
import { SETUPS } from "../../janggi/setups";
import { MOVE_LIMIT, scoreBoard } from "../../janggi/status";

/** 상을 어디에 두는 차림인지. 날개마다 안쪽(사 옆)이나 바깥쪽(차 옆)이다. */
function wingsOf(s: Setup): string {
  if (s.left === s.right) return s.left === "in" ? "상 둘이 안쪽" : "상 둘이 바깥쪽";
  return s.left === "out" ? "왼쪽 상만 바깥쪽" : "오른쪽 상만 바깥쪽";
}

/** 점수가 높은 기물부터. 졸은 진영마다 이름이 달라 둘 다 적는다. */
const SCORED: PieceType[] = ["r", "c", "n", "b", "a", "p"];
const scoreLine = SCORED.map((t) => {
  const cho = pieceInfo(charOf(t, "cho"));
  const name = t === "p" ? `${cho.name}·${pieceInfo(charOf(t, "han")).name}` : cho.name;
  return `${name} ${cho.score}`;
}).join(" · ");

/** 처음 차림의 점수. 한은 덤이 들어 있다. */
const START = scoreBoard(parseFen(START_FEN));

export function RulesScreen() {
  return (
    <div className="learn-doc">
      <h2 className="learn-title">규칙</h2>
      <p className="muted">기물이 움직이는 법은 기물 화면에서 판으로 볼 수 있습니다.</p>

      <div className="panel learn-sections">
        <section>
          <h3 className="learn-section-title">상차림</h3>
          <p>
            마와 상은 자리를 바꿔 놓을 수 있습니다. 양쪽 날개마다 상을 안쪽(사 옆)이나 바깥쪽(차 옆)에
            둡니다. 그래서 차림은 4가지입니다. 자기 왼쪽부터 읽은 순서로 부릅니다.
          </p>
          <ul className="learn-list">
            {SETUPS.map((s) => (
              <li key={s.id}>
                <b>{s.name}</b>: {wingsOf(s)}
              </li>
            ))}
          </ul>
          <p>
            대회에서는 나중에 두는 한이 먼저 차리고, 초가 나중에 차립니다. 이 앱에서는 대국 화면의
            상차림에서 양쪽을 고릅니다.
          </p>
        </section>

        <section>
          <h3 className="learn-section-title">궁성</h3>
          <p>
            양쪽 진영 가운데의 3×3 자리입니다. X 자 대각선이 그어져 있습니다. 궁과 사는 궁성 밖으로
            나가지 못합니다.
          </p>
        </section>

        <section>
          <h3 className="learn-section-title">장군과 멍군</h3>
          <p>
            장군은 다음 수에 상대 궁을 잡을 수 있게 두는 수입니다. 장군을 받으면 반드시 풀어야
            합니다. 기물 둘이 한꺼번에 장군을 부르면(양수겸장) 둘 다 풀어야 합니다.
          </p>
          <p>멍군은 장군을 막는 수입니다.</p>
        </section>

        <section>
          <h3 className="learn-section-title">외통</h3>
          <p>장군을 받았는데 피할 길이 없는 상태입니다. 외통을 당하면 집니다.</p>
        </section>

        <section>
          <h3 className="learn-section-title">한수쉼</h3>
          <p>
            내 차례에 아무 기물도 움직이지 않고 차례를 넘길 수 있습니다. 장군을 받았을 때는 쉴 수
            없습니다. 이 앱에서는 기보에 '한수쉼' 으로 적습니다. 양쪽이 이어서 쉬면 판이
            끝납니다(표준·현대는 점수로, 전통은 비김).
          </p>
        </section>

        <section>
          <h3 className="learn-section-title">빅장</h3>
          <p>
            두 궁이 같은 세로줄에서 사이에 아무 기물 없이 마주 보는 상태입니다. 받은 쪽이 궁을
            비키거나 기물로 막지 않으면 판이 끝납니다. 끝난 뒤 결과는 규칙마다 다릅니다. 이 앱은
            대국 화면의 규칙에서 셋 중 하나를 고릅니다.
          </p>
          <ul className="learn-list">
            <li>이 앱 표준: 점수로 가릅니다.</li>
            <li>이 앱 전통: 비깁니다.</li>
            <li>이 앱 현대(카카오): 빅장이 없습니다.</li>
            <li>대한장기협회 점수제 대회: 양쪽 기물이 각 30점 미만일 때만 빅장을 부를 수 있습니다.</li>
          </ul>
          <p>
            그래서 이 앱의 표준 규칙은 협회 점수제와 다릅니다. 표준에서는 남은 점수와 상관없이
            빅장을 부를 수 있습니다.
          </p>
        </section>

        <section>
          <h3 className="learn-section-title">덤</h3>
          <p>
            초가 먼저 두는 대신 한이 {HAN_DEOM}점을 받습니다. 점수로 가를 때 초는 {START.cho}점,
            한은 {START.han}점에서 시작하는 셈입니다. 0.5 가 있어서 점수가 같아질 일이 없습니다.
          </p>
        </section>

        <section>
          <h3 className="learn-section-title">점수 계산</h3>
          <p>
            판 위에 남은 내 기물 점수를 더합니다(궁은 빼고). 한은 덤 {HAN_DEOM}점을 더합니다. 이 앱의
            표준·현대 규칙은 양쪽 합 {MOVE_LIMIT}수가 지나면 점수가 높은 쪽이 이깁니다.
          </p>
          <p className="muted">기물 점수: {scoreLine}</p>
        </section>
      </div>
    </div>
  );
}
