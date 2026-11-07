// 포진 - 다섯 포진의 이름·뜻·완성된 모양, 그 모양까지 두는 수를 한 수씩
//
//   제목 · 한 줄 설명 · 포진 고르기 · 차림 고르기(둘 이상일 때) → 판 →
//   모양 만드는 수(지금 수 · 처음·이전·다음·끝 · 정석이 아니라는 말) · 포진 설명
//
// 짜임은 기물 화면(PiecesScreen)의 판 화면을 그대로 쓴다(learn.css) - 넓은 화면은 판 | 오른쪽 칸,
// 폰은 위 순서로 쌓는다. 엔진은 쓰지 않는다. 수는 데이터(janggi/openings.ts)에 있고, 그 수가
// 엔진에서 둘 수 있는지는 openings.test.ts 가 본다.
//
// 처음 열면 완성된 모양(마지막 수 뒤)이 선다. 포진의 이름이 가리키는 것이 그 모양이다. 판은 읽기만
// 한다 - 기물이 집히지 않는다. 한은 움직이지 않는다(매번 한수쉼을 한다고 친다). 판은 초가 아래다.
// 모양이 초의 것이다. 대국의 판 뒤집기 설정은 읽지 않는다.
//
// 글은 대한장기협회 누리집의 장기 용어(포진 다섯의 뜻)를 우리 말로 다시 쓴 것이다. "볼 것" 의
// 사실은 엔진으로 확인했다(openings.test.ts). 차림별로 쉽게 되는 포진은 엔진의 최소 수(조사 세션
// 2026-11-02 시험 1)와 나무위키 "장기" 문서(더위키 사본)의 차림별 포진 표가 같이 맞는 것이다.
// 출처가 하나뿐인 원칙(나무위키 계열 문서에만 있는 것)은 쓰지 않는다. 출처는 화면에 적지 않는다.

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useState } from "react";
import { describeMove, splitMove } from "../../janggi/notation";
import type { Opening, OpeningId } from "../../janggi/openings";
import { OPENINGS, positionAt } from "../../janggi/openings";
import { Board } from "../board/Board";

/** 포진마다 뜻과 볼 것. 데이터에 없는 포진이 생기면 타입 검사가 잡는다. */
const TEXT: Record<OpeningId, { meaning: string; note: string }> = {
  gwima: {
    meaning:
      "마 하나를 궁성 귀(84 또는 86)에 올리는 포진입니다. 대한장기협회는 가장 많이 쓰는 대표 포진으로 소개합니다.",
    note: "안쪽 마는 한 수 만에 귀로 올라갑니다.",
  },
  wonang: {
    meaning: "마 하나를 궁성 앞 가운데(75)로 내고, 다른 마가 그 마를 지키게 하는 포진입니다.",
    note: "먼저 75 의 졸을 옆으로 옮겨 마가 설 자리를 비웁니다.",
  },
  myeonsang: {
    meaning:
      "상을 궁성 면(85)에 올리는 포진입니다. 대한장기협회는 두 포를 함께 써서 공격하는 포진으로 설명합니다.",
    note: "안쪽 마를 귀로 올려 그 자리를 비우면, 바깥 상이 그 자리를 지나 면으로 갑니다.",
  },
  yanggwima: {
    meaning: "마 둘을 궁성 양쪽 귀(84·86)에 올리고, 가운데 졸(75)을 한 칸 올리는 포진입니다.",
    note: "상마마상은 처음에 75 의 졸을 지키는 기물이 없습니다. 졸을 65 로 올리면 귀에 선 두 마가 그 졸을 지킵니다.",
  },
  yanggwisang: {
    meaning:
      "상 둘을 궁성 양쪽 귀(84·86)에 올리는 포진입니다. 대한장기협회는 다섯 포진 가운데 가장 적게 쓰인다고 소개합니다.",
    note: "상이 지나갈 길에서 사 둘과 궁을 먼저 비킵니다.",
  },
};

/** "마상마상·상마상마에서 1수에 됩니다." 한 포진 안의 수순 길이는 모두 같다(openings.test.ts). */
const setupsLine = (o: Opening) =>
  `${o.lines.map((l) => l.setup).join("·")}에서 ${o.lines[0].moves.length}수에 됩니다.`;

const ICON = { size: 20, strokeWidth: 2, "aria-hidden": true } as const;

export function OpeningsScreen() {
  const [opening, setOpening] = useState<Opening>(OPENINGS[0]);
  const [lineIdx, setLineIdx] = useState(0);
  const line = opening.lines[lineIdx];
  const last = line.moves.length;
  const [step, setStep] = useState(last);
  /** 다음을 눌러 한 수 나아갈 때만 기물이 날아간다. key 는 누를 때마다 커진다. */
  const [fly, setFly] = useState<{ from: string; to: string; key: number } | null>(null);

  const position = positionAt(line, step);
  const move = step > 0 ? line.moves[step - 1] : null;
  const shown = move ? describeMove(move, positionAt(line, step - 1).board).short : null;

  const go = (next: number) => {
    setFly(next === step + 1 ? { ...splitMove(line.moves[step]), key: (fly?.key ?? 0) + 1 } : null);
    setStep(next);
  };
  const pickOpening = (next: Opening) => {
    setOpening(next);
    setLineIdx(0);
    setStep(next.lines[0].moves.length);
    setFly(null);
  };
  const pickLine = (idx: number) => {
    setLineIdx(idx);
    setStep(opening.lines[idx].moves.length);
    setFly(null);
  };

  return (
    <div className="learn-fit">
      <div className="learn-main">
        <div className="learn-head">
          <h2 className="learn-title">포진</h2>
          <p className="muted">
            포진은 처음 몇 수 동안 기물을 앞으로 내어 진을 갖추는 것입니다. 대한장기협회는 다섯 가지를 듭니다.
          </p>
          <div className="seg learn-openings" role="group" aria-label="포진">
            {OPENINGS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={o === opening ? "active" : ""}
                aria-pressed={o === opening}
                onClick={() => pickOpening(o)}
              >
                {o.name}
              </button>
            ))}
          </div>
          {/* 차림이 하나뿐이면 고를 것이 없다. */}
          {opening.lines.length > 1 && (
            <div className="seg" role="group" aria-label="차림">
              {opening.lines.map((l, i) => (
                <button
                  key={l.setup}
                  type="button"
                  className={i === lineIdx ? "active" : ""}
                  aria-pressed={i === lineIdx}
                  onClick={() => pickLine(i)}
                >
                  {l.setup}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="learn-stage">
          <Board
            board={position.board}
            flipped={false}
            selected={null}
            targets={[]}
            lastMove={move ? splitMove(move) : null}
            bestMove={null}
            onSquareClick={() => {}}
            onMove={() => {}}
            canPick={() => false}
            flyMove={fly}
          />
        </div>

        <div className="learn-desc opening-desc">
          <section aria-label="모양 만드는 수">
            <h3 className="opening-steps-title">모양 만드는 수</h3>
            <p className="opening-step learn-notation">
              {step}/{last} · {shown ?? "처음 차림"}
              {step === last && " · 완성"}
            </p>
            <div className="board-controls">
              <div className="board-actions">
                <button type="button" className="icon" disabled={step === 0} onClick={() => go(0)} aria-label="처음으로">
                  <ChevronsLeft {...ICON} />
                </button>
                <button type="button" disabled={step === 0} onClick={() => go(step - 1)}>
                  <ChevronLeft {...ICON} />
                  이전
                </button>
                <button type="button" disabled={step === last} onClick={() => go(step + 1)}>
                  다음
                  <ChevronRight {...ICON} />
                </button>
                <button
                  type="button"
                  className="icon"
                  disabled={step === last}
                  onClick={() => go(last)}
                  aria-label="끝으로"
                >
                  <ChevronsRight {...ICON} />
                </button>
              </div>
            </div>
            <p className="muted opening-caveat">
              모양 만드는 수는 정석이 아니고, 상대가 가만히 있다고 친 길입니다. 한은 그동안 한수쉼을 한 셈입니다.
            </p>
          </section>

          <section className="panel">
            <h3 className="learn-section-title">{opening.name} 포진</h3>
            <p>{TEXT[opening.id].meaning}</p>
            <p className="opening-more">{setupsLine(opening)}</p>
            <p className="opening-more">{TEXT[opening.id].note}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
