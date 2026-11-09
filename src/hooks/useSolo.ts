// 혼자 장기 풀기 - 문제 하나를 두는 동안의 상태
//
// 둔 판을 차례로 쌓는다. 한 수 무르기는 맨 위 판을 덜어내고, 처음부터는 첫 판만 남긴다. 둘 수 있는
// 수는 그때그때 규칙(janggi/solo.ts)이 낸다 - 정해진 답과 맞추지 않는다. 어느 길로든 하나가 남으면
// 풀린 것이다. 엔진은 쓰지 않는다.
//
//   둘 수 있음 ─ 잡는 수 → 하나 남음 → 풀림(onSolve)
//             │         └ 둘 이상인데 잡을 수 없음 → 막힘(무르거나 처음부터)
//             └ 그 밖의 수(빈 자리, 같은 편) → 판이 받지 않는다
//
// 판 만지기(집기·끌기·다시 눌러 놓기·소리)는 대국과 같은 useBoardTouch 를 쓴다. 그 훅은 "둘 차례 쪽
// 기물만 집힌다" 를 보는데, 혼자 장기는 차례가 없어 두 편을 다 집는다. 그래서 그 훅에 넘기는 국면만
// 모든 기물을 초로 칠하고 초 차례로 둔다(touchView). 그 훅이 국면에서 보는 것은 "그 자리에 둘 차례 쪽
// 기물이 있나"(canPick)와 한수쉼을 둘 궁의 자리(궁이 없어 늘 없다) 둘뿐이다. 칠한 국면은 그 훅에만
// 간다 - 판 그림(board), 둘 수 있는 수(legal), 풀림·막힘 판정(stateOf)은 모두 원래 색의 판으로 한다.
// 그래서 칠해도 초가 초를 잡는 수는 생기지 않는다(useSolo.test.tsx 가 본다).

import { useMemo, useRef, useState } from "react";
import { playMoveSound } from "../audio/sound";
import type { Board, Position, Square } from "../janggi/board";
import { splitMove } from "../janggi/notation";
import type { PieceChar } from "../janggi/pieces";
import type { SoloPuzzle, SoloState } from "../janggi/solo";
import { boardOf, capturesOf, pieceCount, playCapture, stateOf } from "../janggi/solo";
import { useBoardTouch } from "./useBoardTouch";

/** 알림 줄에 설 말. 글은 화면이 정한다. */
export type SoloNote =
  | { kind: "start" }
  /** 한 수 둔 뒤. count 는 남은 기물 수 */
  | { kind: "left"; count: number }
  | { kind: "stuck" }
  | { kind: "solved" };

interface Fly {
  from: Square;
  to: Square;
  captured?: PieceChar;
  key: number;
}

export interface SoloSolve {
  /** 지금 판(원래 색). 판 그림에 넘긴다. */
  board: Board;
  state: SoloState;
  note: SoloNote;
  /** 문제 처음 그대로다. 무르기·처음부터가 할 일이 없다. */
  atStart: boolean;
  lastMove: { from: Square; to: Square } | null;
  flyMove: Fly | null;
  selected: Square | null;
  targets: Square[];
  canPick: (square: Square) => boolean;
  onSquareClick: (square: Square) => void;
  onMove: (from: Square, to: Square) => void;
  undo: () => void;
  restart: () => void;
}

/**
 * useBoardTouch 에 넘길 국면: 모든 기물을 초로 칠하고 초 차례. 그 훅이 두 편 기물을 다 집게 하려는
 * 것뿐이다. 판 그림·둘 수 있는 수·판정에는 쓰지 않는다(머리 주석).
 */
export function touchViewOf(board: Board): Position {
  const view: Board = {};
  for (const [square, piece] of Object.entries(board)) view[square] = piece.toUpperCase() as PieceChar;
  return { board: view, turn: "cho", halfmove: 0, fullmove: 1 };
}

export function useSolo(puzzle: SoloPuzzle, onSolve: (id: string) => void): SoloSolve {
  const start = useMemo(() => boardOf(puzzle), [puzzle]);
  /** 둔 판들. [0] 이 문제 처음이고 맨 끝이 지금 판이다. */
  const [boards, setBoards] = useState<Board[]>(() => [start]);
  /** 둔 수들. boards 보다 하나 짧다. */
  const [moves, setMoves] = useState<string[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [fly, setFly] = useState<Fly | null>(null);
  const flyKey = useRef(0);

  const board = boards[boards.length - 1];
  const state = stateOf(board);
  // 둘 수 있는 수는 원래 색의 판으로 낸다. 칠한 판(touchView)으로 내면 같은 편끼리 잡는 수가 생긴다.
  const legal = useMemo(() => new Set(capturesOf(board)), [board]);
  const touchView = useMemo(() => touchViewOf(board), [board]);

  const pushMove = (from: Square, to: Square, animate = true) => {
    setSelected(null);
    const move = from + to;
    if (!legal.has(move)) return;
    const next = playCapture(board, move);
    playMoveSound("capture");
    flyKey.current += 1;
    setFly(animate ? { from, to, captured: board[to], key: flyKey.current } : null);
    setBoards([...boards, next]);
    setMoves([...moves, move]);
    if (stateOf(next) === "solved") onSolve(puzzle.id);
  };

  const touch = useBoardTouch({
    legal,
    position: touchView,
    selected,
    setSelected,
    canTouch: state === "open",
    pushMove,
  });

  const note: SoloNote =
    boards.length === 1
      ? { kind: "start" }
      : state === "solved"
        ? { kind: "solved" }
        : state === "stuck"
          ? { kind: "stuck" }
          : { kind: "left", count: pieceCount(board) };

  const last = moves.length > 0 ? splitMove(moves[moves.length - 1]) : null;

  return {
    board,
    state,
    note,
    atStart: boards.length === 1,
    lastMove: last,
    flyMove: fly,
    selected,
    targets: touch.targets,
    canPick: touch.canPick,
    onSquareClick: touch.onSquareClick,
    onMove: touch.onMove,

    undo: () => {
      if (boards.length === 1) return;
      setBoards(boards.slice(0, -1));
      setMoves(moves.slice(0, -1));
      setSelected(null);
      setFly(null);
    },

    restart: () => {
      setBoards([start]);
      setMoves([]);
      setSelected(null);
      setFly(null);
    },
  };
}
