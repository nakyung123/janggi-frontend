// 외통 문제 풀기 - 문제 하나를 두는 동안의 상태
//
// 공격 쪽 수를 받아 정답과 맞춰 보고, 맞으면 잠깐 뒤에 수비의 응수를 둔다. 엔진은 쓰지 않는다 -
// 둘 수 있는 수와 응수는 문제 데이터(janggi/mates.json)에 있다.
//
//   공격 차례 ─ 답이 아닌 수 → 판은 그대로, 알림 줄만 바뀐다(몇 번이든 다시 둔다)
//            └ 정답 ─ 마지막 수였다 → 끝(외통). 정답을 보지 않았으면 onSolve
//                    └ 아니다 → 0.5초 뒤 주 수순의 응수 → 다시 공격 차례
//
// 틀린 수를 판에 뒀다가 되돌리지 않는다. 시간이 걸리는 움직임이 하나 더 생기고 그동안 판을
// 잠가야 한다. 응수만 기다린다 - 내 수와 응수가 한꺼번에 날면 무엇이 어디로 갔는지 못 본다.
//
// 판 만지기(집기·끌기·소리)는 대국과 같은 useBoardTouch 를 쓴다.

import { useEffect, useMemo, useRef, useState } from "react";
import { playMoveSound } from "../audio/sound";
import type { Position, Square } from "../janggi/board";
import type { MatePuzzle } from "../janggi/mate";
import { attackerOf, kingOf, legalAt, positionAt } from "../janggi/mate";
import { arrowOf, describeMove, splitMove } from "../janggi/notation";
import type { PieceChar, Side } from "../janggi/pieces";
import { useBoardTouch } from "./useBoardTouch";

/** 정답 뒤 수비가 응수하기까지(ms). 내 기물이 날아가 앉는 것(0.22초)을 보고 난 뒤다. */
export const REPLY_DELAY_MS = 500;

/** 알림 줄에 설 말. 글은 화면이 정한다. */
export type MateNote =
  | { kind: "start" }
  /** 둘 수 있지만 답이 아닌 수. move 는 기보 표기(73차13) */
  | { kind: "wrong"; move: string }
  /** 정답을 두고 응수를 기다리는 중 */
  | { kind: "correct" }
  /** 수비가 응수했다. move 는 응수의 기보 표기 */
  | { kind: "replied"; move: string }
  /** 정답 보기를 눌러 화살표가 섰다 */
  | { kind: "shown" }
  /** 마지막 정답을 뒀다(외통). peeked 면 이번에 정답을 봤다 */
  | { kind: "done"; peeked: boolean };

export type MatePhase = "attack" | "reply" | "done";

interface Fly {
  from: Square;
  to: Square;
  captured?: PieceChar;
  key: number;
}

export interface MateSolve {
  position: Position;
  attacker: Side;
  phase: MatePhase;
  note: MateNote;
  /** 이번 판(처음부터 누른 뒤로)에 정답을 봤는지. 봤으면 끝까지 둬도 푼 문제로 남지 않는다. */
  peeked: boolean;
  /** 문제 처음 그대로다(둔 수도, 본 정답도 없다). 처음부터가 할 일이 없다. */
  atStart: boolean;
  /** 정답 보기 화살표. 공격 차례에만, 누른 그 수에만 선다. */
  answerArrow: { from: Square; to: Square } | null;
  lastMove: { from: Square; to: Square } | null;
  flyMove: Fly | null;
  /** 외통을 맞은 궁. 끝난 뒤에만 */
  matedKing: Square | null;
  selected: Square | null;
  targets: Square[];
  canPick: (square: Square) => boolean;
  onSquareClick: (square: Square) => void;
  onMove: (from: Square, to: Square) => void;
  showAnswer: () => void;
  restart: () => void;
}

const NO_MOVES: ReadonlySet<string> = new Set();

export function useMateSolve(puzzle: MatePuzzle, onSolve: (id: string) => void): MateSolve {
  /** 주 수순을 몇 수 뒀는지. 짝수면 공격 차례, 홀수면 응수를 기다린다. 다 두면 끝이다. */
  const [plies, setPlies] = useState(0);
  const [note, setNote] = useState<MateNote>({ kind: "start" });
  const [peeked, setPeeked] = useState(false);
  const [showing, setShowing] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [fly, setFly] = useState<Fly | null>(null);
  const flyKey = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  // 응수를 기다리다 화면을 떠나면 기다리던 것을 버린다.
  useEffect(() => stopTimer, []);

  const attacker = attackerOf(puzzle);
  const position = useMemo(() => positionAt(puzzle, plies), [puzzle, plies]);
  const phase: MatePhase = plies === puzzle.line.length ? "done" : plies % 2 === 1 ? "reply" : "attack";
  const legal = useMemo(
    () => (plies % 2 === 0 && plies < puzzle.line.length ? legalAt(puzzle, plies / 2) : NO_MOVES),
    [puzzle, plies]
  );

  /** 주 수순의 다음 수를 판에 둔다. */
  const play = (move: string, before: Position, animate: boolean) => {
    const { from, to } = splitMove(move);
    const captured = before.board[to];
    playMoveSound(captured ? "capture" : "move");
    flyKey.current += 1;
    setFly(animate ? { from, to, captured, key: flyKey.current } : null);
  };

  const pushMove = (from: Square, to: Square, animate = true) => {
    setSelected(null);
    const move = from + to;
    if (move !== puzzle.line[plies]) {
      setNote({ kind: "wrong", move: describeMove(move, position.board).short });
      return;
    }

    play(move, position, animate);
    setShowing(false);
    const next = plies + 1;
    setPlies(next);
    if (next === puzzle.line.length) {
      setNote({ kind: "done", peeked });
      if (!peeked) onSolve(puzzle.id);
      return;
    }

    setNote({ kind: "correct" });
    timer.current = setTimeout(() => {
      timer.current = null;
      const reply = puzzle.line[next];
      const before = positionAt(puzzle, next);
      play(reply, before, true);
      setPlies(next + 1);
      setNote({ kind: "replied", move: describeMove(reply, before.board).short });
    }, REPLY_DELAY_MS);
  };

  const touch = useBoardTouch({
    legal,
    position,
    selected,
    setSelected,
    canTouch: phase === "attack",
    pushMove,
  });

  const last = plies > 0 ? splitMove(puzzle.line[plies - 1]) : null;

  return {
    position,
    attacker,
    phase,
    note,
    peeked,
    atStart: plies === 0 && !peeked,
    answerArrow: showing && phase === "attack" ? arrowOf(puzzle.line[plies]) : null,
    lastMove: last,
    flyMove: fly,
    matedKing: phase === "done" ? kingOf(position, position.turn) : null,
    selected,
    targets: touch.targets,
    canPick: touch.canPick,
    onSquareClick: touch.onSquareClick,
    onMove: touch.onMove,

    showAnswer: () => {
      if (phase !== "attack") return;
      setPeeked(true);
      setShowing(true);
      setNote({ kind: "shown" });
    },

    restart: () => {
      stopTimer();
      setPlies(0);
      setNote({ kind: "start" });
      setPeeked(false);
      setShowing(false);
      setSelected(null);
      setFly(null);
    },
  };
}
