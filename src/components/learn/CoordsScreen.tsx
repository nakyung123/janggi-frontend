// 좌표 - 이 앱의 기보 숫자(73졸63 의 73·63)를 읽는 법
//
//   제목 · 누른 칸의 번호 → 판 → 판 뒤집기 · 읽는 법
//
// 판의 교차점을 누르면 그 자리의 번호와 기물이 선다. 번호는 기보가 쓰는 표기
// (janggi/notation.ts 의 toJanggiCoord)를 그대로 쓴다. 판을 뒤집어도 번호는 그대로다 - 그것을
// 직접 눌러 보게 판 뒤집기를 둔다. 뒤집기는 이 화면 안에서만이다(대국의 뒤집기와 따로).
//
// 짜임은 기물 화면과 같다(learn.css 의 .learn-main).

import { useState } from "react";
import type { Square } from "../../janggi/board";
import { START_FEN, parseFen } from "../../janggi/board";
import { describeMove, toJanggiCoord } from "../../janggi/notation";
import { SIDE_LABEL, pieceInfo, sideOf } from "../../janggi/pieces";
import { Board } from "../board/Board";

const START = parseFen(START_FEN).board;

/** 처음 차림에서 둔 수 하나의 기보 표기. 기보에 적히는 그대로다. */
const notationOf = (move: string) => describeMove(move, START).short;

/** 기보 읽기 예. 수(엔진 좌표) · 무엇을 했나. 표기 자체는 위 함수가 만든다. */
const EXAMPLES: [string, string][] = [
  ["c4c5", "7번째 줄 3번째 세로줄의 졸이 6번째 줄로 한 칸 나왔습니다(초)."],
  ["c7c6", "4번째 줄 3번째 세로줄의 병이 5번째 줄로 한 칸 나왔습니다(한)."],
  ["b10c8", "한의 마가 12 에서 33 으로 갔습니다."],
  ["e2e3", "초의 궁이 95 에서 85 로 한 칸 올라갔습니다."],
];

export function CoordsScreen() {
  const [flipped, setFlipped] = useState(false);
  const [picked, setPicked] = useState<Square | null>(null);

  return (
    <div className="learn-fit">
      <div className="learn-main">
        <div className="learn-head">
          <h2 className="learn-title">좌표</h2>
          <p className="muted">기보의 숫자 두 자리가 판의 어느 자리인지 눌러서 볼 수 있습니다.</p>
          <output className="learn-coord">
            {picked ? <Picked square={picked} /> : <span className="muted">판의 교차점을 누르면 번호가 나옵니다.</span>}
          </output>
        </div>

        <div className="learn-stage">
          <Board
            board={START}
            flipped={flipped}
            selected={picked}
            targets={[]}
            lastMove={null}
            bestMove={null}
            onSquareClick={setPicked}
            onMove={() => {}}
            // 기물은 집히지 않는다. 기물이 있는 자리도 누르면 그 자리를 고른다(Board 의 들 수 없는 기물).
            canPick={() => false}
          />
        </div>

        <div className="learn-desc">
          <div className="row">
            <button type="button" onClick={() => setFlipped((f) => !f)}>
              판 뒤집기
            </button>
          </div>

          <section className="panel learn-sections">
            <section>
              <h3 className="learn-section-title">읽는 법</h3>
              <p>이 앱의 기보는 숫자 두 자리로 자리를 적습니다.</p>
              <ul className="learn-list">
                <li>초가 아래에 앉은 판을 기준으로 합니다.</li>
                <li>앞 숫자는 가로줄입니다. 위(한 쪽)에서부터 1, 2, … 9 이고, 맨 아래 열째 줄은 0 입니다.</li>
                <li>뒤 숫자는 세로줄입니다. 왼쪽에서부터 1 ~ 9 입니다.</li>
                <li>그래서 초의 궁은 95, 한의 궁은 25 에서 시작합니다.</li>
              </ul>
              <p>판을 뒤집어 보아도 숫자는 바뀌지 않습니다. 뒤집은 판에서는 0 줄이 위에, 1 줄이 아래에 옵니다.</p>
            </section>
            <section>
              <h3 className="learn-section-title">한 수 읽기</h3>
              <p>한 수는 "출발 자리 + 기물 + 도착 자리" 로 적습니다.</p>
              <ul className="learn-list">
                {EXAMPLES.map(([move, what]) => (
                  <li key={move}>
                    <b className="learn-notation">{notationOf(move)}</b>: {what}
                  </li>
                ))}
                <li>한수쉼은 "한수쉼" 으로 적습니다.</li>
              </ul>
            </section>
          </section>
        </div>
      </div>
    </div>
  );
}

/** 누른 자리: 번호(24) · 가로줄과 세로줄 · 그 자리 기물 */
function Picked({ square }: { square: Square }) {
  const code = toJanggiCoord(square);
  const piece = START[square];
  const row = code[0] === "0" ? "0(열째)" : code[0];
  return (
    <>
      <b className="learn-coord-num">{code}</b>
      <span>
        가로줄 {row} · 세로줄 {code[1]}
        {piece ? ` · ${SIDE_LABEL[sideOf(piece)]} ${pieceInfo(piece).name}` : ""}
      </span>
    </>
  );
}
