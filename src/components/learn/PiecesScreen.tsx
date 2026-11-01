// 기물 - 일곱 기물이 어떻게 움직이는지 판에서 옮겨 보며 익힌다
//
//   제목 · 기물 고르기 · 국면 고르기 → 판 → 처음 자리로 · 기물 설명
//
// 넓은 화면은 대국처럼 판이 왼쪽, 나머지가 오른쪽 칸이다. 폰은 위 순서로 쌓는다(learn.css).
//
// 판에 찍히는 갈 곳은 행마 계산(janggi/moves.ts)이 정한다. 엔진은 쓰지 않는다 - 기물 하나의
// 움직임을 보이는 화면이라 장군·빅장은 따지지 않는다. 판은 대국과 같은 Board 를 그대로 쓰고,
// 움직여 볼 기물만 집힌다. 막는 기물은 집히지 않는다.

import { useState } from "react";
import type { Board as BoardMap, Square } from "../../janggi/board";
import { START_FEN, parseFen } from "../../janggi/board";
import { pieceMoves } from "../../janggi/moves";
import type { PieceChar, PieceType } from "../../janggi/pieces";
import { SIDE_LABEL, charOf, pieceInfo, sideOf } from "../../janggi/pieces";
import { Board } from "../board/Board";
import { PieceBody } from "../board/PieceGlyph";
import type { PieceLesson, Scene } from "./pieceScenes";
import { PIECE_LESSONS } from "./pieceScenes";

/** 처음 차림의 초 기물들. 한쪽이 가진 수를 여기서 센다. */
const START = Object.values(parseFen(START_FEN).board);

/** "한쪽에 2개 · 13점". 점수는 점수제(pieces.ts)의 값이다. */
function factsOf(type: PieceType): string {
  const cho = charOf(type, "cho");
  const count = START.filter((c) => c === cho).length;
  const score = pieceInfo(cho).score;
  return `한쪽에 ${count}개 · ${score > 0 ? `${score}점` : "점수 없음"}`;
}

/** 판 위의 지금 모습. 국면을 고르면 처음으로 돌아간다. */
interface Play {
  board: BoardMap;
  /** 움직여 볼 기물의 자리 */
  at: Square;
  /** 옮긴 횟수. 0 이면 국면 처음 그대로다. 날아가는 기물의 key 로도 쓴다. */
  moves: number;
  last: { from: Square; to: Square } | null;
  fly: { from: Square; to: Square; captured?: PieceChar; key: number } | null;
}

const fresh = (scene: Scene): Play => ({
  board: scene.board,
  at: scene.from,
  moves: 0,
  last: null,
  fly: null,
});

export function PiecesScreen() {
  const [lesson, setLesson] = useState<PieceLesson>(PIECE_LESSONS[0]);
  const [scene, setScene] = useState<Scene>(PIECE_LESSONS[0].scenes[0]);
  const [play, setPlay] = useState<Play>(() => fresh(PIECE_LESSONS[0].scenes[0]));

  const targets = pieceMoves(play.board, play.at);

  const pickLesson = (next: PieceLesson) => {
    setLesson(next);
    setScene(next.scenes[0]);
    setPlay(fresh(next.scenes[0]));
  };
  const pickScene = (next: Scene) => {
    setScene(next);
    setPlay(fresh(next));
  };

  /** 갈 곳으로 옮긴다. 눌러서 옮기면 날아가고, 끌어서 옮기면 손으로 이미 옮겼으니 날지 않는다. */
  const moveTo = (to: Square, animate: boolean) => {
    const board = { ...play.board };
    const captured = board[to];
    board[to] = board[play.at];
    delete board[play.at];
    const moves = play.moves + 1;
    setPlay({
      board,
      at: to,
      moves,
      last: { from: play.at, to },
      fly: animate ? { from: play.at, to, captured, key: moves } : null,
    });
  };

  return (
    <div className="learn-fit">
      <div className="learn-main">
        <div className="learn-head">
          <h2 className="learn-title">기물</h2>
          <p className="muted">초(초록)와 한(빨강)이 기물 16개씩을 갖고 둡니다. 초가 먼저 둡니다.</p>
          <div className="seg learn-pieces" role="group" aria-label="기물">
            {PIECE_LESSONS.map((l) => (
              <button
                key={l.type}
                type="button"
                className={l === lesson ? "active" : ""}
                aria-pressed={l === lesson}
                onClick={() => pickLesson(l)}
              >
                {l.label}
              </button>
            ))}
          </div>
          {/* 국면이 하나뿐이면 고를 것이 없다. */}
          {lesson.scenes.length > 1 && (
            <div className="seg" role="group" aria-label="국면">
              {lesson.scenes.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className={s === scene ? "active" : ""}
                  aria-pressed={s === scene}
                  onClick={() => pickScene(s)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <p>{scene.note}</p>
        </div>

        <div className="learn-stage">
          <Board
            board={play.board}
            flipped={false}
            selected={play.at}
            targets={targets}
            lastMove={play.last}
            bestMove={null}
            onSquareClick={(s) => {
              if (targets.includes(s)) moveTo(s, true);
            }}
            onMove={(from, to) => {
              if (from === play.at && targets.includes(to)) moveTo(to, false);
            }}
            canPick={(s) => s === play.at}
            flyMove={play.fly}
          />
        </div>

        <div className="learn-desc">
          <div className="row">
            <button type="button" disabled={play.moves === 0} onClick={() => setPlay(fresh(scene))}>
              처음 자리로
            </button>
            <span className="muted">점을 누르면 그리로 옮겨집니다.</span>
          </div>

          <section className="panel">
            <div className="learn-piece-head">
              <PieceIcon piece={charOf(lesson.type, "cho")} />
              <PieceIcon piece={charOf(lesson.type, "han")} />
              <h3 className="learn-piece-name">{lesson.name}</h3>
            </div>
            <p className="muted learn-facts">{factsOf(lesson.type)}</p>
            <p>{lesson.moves}</p>
            {lesson.notes.length > 0 && (
              <ul className="learn-list">
                {lesson.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * 판 위 기물 그림. 한자는 글자가 아니라 그림이다(janggi/glyphs.ts) - 앱 글꼴에 장기 한자가
 * 거의 없다(DESIGN.md). 판의 그라디언트에 기대지 않게 납작한 모양(flat)으로 그린다.
 */
function PieceIcon({ piece }: { piece: PieceChar }) {
  return (
    <svg
      className="learn-piece-icon"
      viewBox="-22 -22 44 44"
      role="img"
      aria-label={`${SIDE_LABEL[sideOf(piece)]} ${pieceInfo(piece).name}`}
    >
      <PieceBody piece={piece} radius={20} flat />
    </svg>
  );
}
