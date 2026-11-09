// 내 실수 문제 - 목록, 연 문제, 엔진에 묻기, 둔 수의 판정
//
// 문제 목록은 기보 목록(App 이 쥔 games)에서 만든다(janggi/mistakes.ts). 엔진이 없어도 선다.
//
// **엔진은 App 이 넘긴다.** 엔진은 하나라 App 이 대국·복기·분석판·이 화면에 나눠 쓴다. App 은 이
// 화면일 때만 엔진을 넘기고(다른 화면이면 null), 엔진 규칙도 App 이 화면에 따라 건다(App 의 options 가
// 이 훅의 variant 를 읽는다). 여기서는 setOptions 도 stop 도 부르지 않는다 - 분석판(useAnalysisBoard)과
// 같은 까닭이다.
//
// 문제를 열면 엔진에 두 가지를 차례로 묻는다.
//   1. 합법수(probe). 받기 전에는 판이 잠긴다. 한수쉼은 뺀다 - 이 화면에 한수쉼 단추가 없고, 궁을
//      다시 누르면 한수쉼이 되는 일(useBoardTouch)도 막는다.
//   2. 문제 국면의 점수(analyzeOnce). 사람이 생각하는 동안 미리 잰다.
// 수를 두면 판정한다(mistakes.ts 머리 주석). AI 의 수와 그때 둔 수는 바로, 그 밖은 1 이 끝난 뒤
// 둔 뒤 국면을 같은 탐색량으로 재서. 엔진에 줄을 세우는 것은 늘 앞의 것이 끝난 뒤다 - analyzeOnce 는
// 줄을 선 앞 탐색을 버리므로(engine.ts 의 searchGen), 미리 재던 것이 끝나기 전에 새로 걸면 그것이 버려진다.
//
// **늦은 답을 버린다.** 답에는 "어느 문제·어느 규칙·몇 번째 시도" 꼬리표를 단다. 문제를 바꾸거나
// 다시 풀기를 누른 뒤 온 답은 버린다(useAnalysis·useHint 와 같은 방식).
//
// **규칙이 바뀐 직후에는 묻지 않는다.** 문제를 열면 App 이 그 판의 규칙을 건다. 규칙을 바꾸면 엔진이
// 하던 탐색을 끊는다(setOptions → stop). 끊긴 탐색은 그때까지의 얕은 답을 낸다. 그래서 분석판처럼
// 잠깐(ASK_DELAY_MS) 뒤에 묻는다. 그 사이 규칙이 또 바뀌면 꼬리표가 달라져 다시 묻는다.
//
// 저장하지 않는다(2026-11-09 사용자 결정). App 이 쥔 상태라 화면을 떠나면 닫는다(active).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playMoveSound } from "../audio/sound";
import type { JanggiEngine } from "../engine/engine";
import { HINT_LIMITS } from "../engine/levels";
import type { AnalysisSnapshot, PositionRef, Variant } from "../engine/types";
import { isVariant } from "../engine/types";
import type { EngineStatus } from "../engine/useEngine";
import type { ArchivedGame } from "../janggi/archive";
import type { Board, Position, Square } from "../janggi/board";
import { applyMove, parseFen } from "../janggi/board";
import type { Look, Mistake, MistakeList, Verdict } from "../janggi/mistakes";
import { flatMistakes, measuredVerdict, mistakesOf, quickVerdict } from "../janggi/mistakes";
import { arrowOf, describeMove, splitMove } from "../janggi/notation";
import type { PieceChar } from "../janggi/pieces";
import { noteTrouble } from "../report/errors";
import { useBoardTouch } from "./useBoardTouch";

/**
 * 두 국면을 재는 탐색량. 힌트와 같은 30만 노드, 상한 3초(노드와 시간 중 먼저 닿는 쪽에서 멈춘다).
 * 힌트를 폰에서 쓸 때 "2초 이내" 였다(2026-11-03 사용자 확인). PC 스레드 하나로 평균 1.19초를 쟀다.
 */
export const MISTAKE_LIMITS = HINT_LIMITS;

/** 문제를 열거나 규칙이 바뀐 뒤 엔진에 묻기까지(ms). 위 머리 주석의 "규칙이 바뀐 직후". */
export const ASK_DELAY_MS = 200;

/** 알림 줄에 설 말. 글은 화면이 정한다. */
export type MistakeNote =
  /** 엔진이 아직 안 떴다 */
  | { kind: "loading" }
  /** 엔진을 띄우지 못했다 */
  | { kind: "broken" }
  /** 합법수를 받는 중 */
  | { kind: "preparing" }
  /** 합법수를 못 받았다. 다시 물을 수 있다(retry) */
  | { kind: "probeFailed" }
  | { kind: "start" }
  /** 둔 수를 엔진이 재는 중. move 는 기보 표기 */
  | { kind: "measuring"; move: string }
  /** 재지 못했다. 다시 잴 수 있다(retry) */
  | { kind: "measureFailed"; move: string }
  | { kind: "verdict"; verdict: Verdict; move: string };

/** 판(components/board/Board)에 넘길 것. 화면이 그대로 펼친다. */
export interface MistakeBoardView {
  board: Board;
  flipped: boolean;
  selected: Square | null;
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  bestMove: { from: Square; to: Square } | null;
  onSquareClick: (square: Square) => void;
  onMove: (from: Square, to: Square) => void;
  canPick: (square: Square) => boolean;
  flyMove: { from: Square; to: Square; captured?: PieceChar; key: number } | null;
}

export interface Mistakes {
  list: MistakeList;
  /** 연 문제. 없으면 목록이다. */
  open: Mistake | null;
  show: (id: string) => void;
  back: () => void;
  /** 목록 순서의 다음 문제. 마지막이면 null */
  next: Mistake | null;
  /** 엔진에 걸 규칙. 연 문제가 없으면 null - App 이 대국 쪽 규칙을 쓴다. */
  variant: Variant | null;
  note: MistakeNote;
  view: MistakeBoardView;
  /** 답이 나왔다. 다시 풀기·기보에서 보기·다음 문제가 선다. */
  done: boolean;
  restart: () => void;
  /** 합법수·점수를 다시 묻는다(실패한 뒤). */
  retry: () => void;
  /** 기보 탭에서 그 판을 그 수(큰 실수)에 연다. */
  openInGames: () => void;
}

interface Options {
  /** 이 화면일 때만 엔진. 다른 화면이면 null 이라 아무것도 묻지 않는다. */
  engine: JanggiEngine | null;
  engineStatus: EngineStatus;
  /** 이 화면에 있는지. 떠나면 연 문제를 닫는다. */
  active: boolean;
  games: ArchivedGame[];
  /** 기보 탭에서 그 판을 연다. at 은 보일 수의 번호(기보 번호). App 이 탭을 옮긴다. */
  onOpenGame: (gameId: string, at: number) => void;
}

const isPass = (move: string) => {
  const { from, to } = splitMove(move);
  return from === to;
};

/** 탐색 결과의 첫 줄. 줄이 없으면 null(둘 수 없는 국면). */
const lookOf = (snap: AnalysisSnapshot): Look | null => {
  const line = snap.lines[0];
  return line ? { score: line.score, mate: line.mate } : null;
};

/** 엔진 실패를 사람 말로 남기고 그대로 던진다. 화면 글은 알림 줄이 고른다. */
const fail = (err: unknown): never => {
  noteTrouble("내 실수 문제", err);
  throw err;
};

type Asked =
  | { key: string; legal: ReadonlySet<string> }
  | { key: string; failed: true };

type Result =
  | { key: string; verdict: Verdict }
  | { key: string; failed: true };

const NO_MOVES: ReadonlySet<string> = new Set();
/** 연 문제가 없을 때 판 만지기 훅에 넘길 국면. 목록 화면이라 그려지지 않는다. */
const EMPTY: Position = { board: {}, turn: "cho", halfmove: 0, fullmove: 1 };

export function useMistakes(options: Options): Mistakes {
  const { engine, engineStatus, active, games, onOpenGame } = options;

  const list = useMemo(() => mistakesOf(games), [games]);
  const flat = useMemo(() => flatMistakes(list), [list]);

  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (flat.find((m) => m.id === openId) ?? null) : null;

  /** 다시 묻기를 누른 횟수. 꼬리표에 들어가 앞의 답을 버리고 새로 묻게 한다. */
  const [tries, setTries] = useState(0);
  /** 다시 풀기를 누른 횟수. 둔 수와 판정의 꼬리표에 들어간다. */
  const [attempt, setAttempt] = useState(0);
  const [asked, setAsked] = useState<Asked | null>(null);
  const [played, setPlayed] = useState<{ key: string; move: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [fly, setFly] = useState<MistakeBoardView["flyMove"]>(null);
  const flyKey = useRef(0);

  const variant: Variant | null = open && isVariant(open.variant) ? open.variant : null;
  /** 엔진에 묻는 것의 꼬리표: 문제 · 규칙 · 다시 묻기 */
  const askKey = open ? `${open.id}|${open.variant}|${tries}` : null;
  /** 둔 수의 꼬리표: 위 + 다시 풀기 */
  const tryKey = askKey ? `${askKey}|${attempt}` : null;
  const tryKeyRef = useRef(tryKey);
  tryKeyRef.current = tryKey;

  /** 미리 재는 문제 국면의 점수. 둔 수를 잴 때 이것이 끝나기를 기다린다. */
  const before = useRef<{ key: string; look: Promise<Look> } | null>(null);

  // 화면을 떠나면 닫는다. 돌아오면 목록부터.
  useEffect(() => {
    if (!active) setOpenId(null);
  }, [active]);

  useEffect(() => {
    if (!engine || !open || !askKey) return;
    let alive = true;
    const ref: PositionRef = { startFen: open.startFen, moves: open.moves };
    const timer = window.setTimeout(() => {
      const probe = engine.probe(ref);
      const look = probe
        .then(() => engine.analyzeOnce(ref, MISTAKE_LIMITS))
        .then((snap) => lookOf(snap) ?? Promise.reject(new Error("문제 국면을 재지 못했습니다.")));
      // 실패는 둔 수를 잴 때 받는다. 여기서 받지 않으면 처리되지 않은 거절로 남는다.
      look.catch(() => undefined);
      before.current = { key: askKey, look };
      probe.then(
        (r) => alive && setAsked({ key: askKey, legal: new Set(r.legal.filter((m) => !isPass(m))) }),
        (err: unknown) => {
          noteTrouble("내 실수 문제", err);
          if (alive) setAsked({ key: askKey, failed: true });
        }
      );
    }, ASK_DELAY_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // open 은 askKey 에 들어 있다. engine 이 바뀌면(화면을 떠났다 옴) 다시 묻는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, askKey]);

  const problem: Position | null = useMemo(() => (open ? parseFen(open.fen) : null), [open]);
  const mine = played && played.key === tryKey ? played.move : null;
  const outcome = result && result.key === tryKey ? result : null;
  const legalNow = asked && askKey && asked.key === askKey && "legal" in asked ? asked.legal : null;
  const probeFailed = Boolean(asked && asked.key === askKey && "failed" in asked);

  /** 둔 수를 재고 판정한다. 결과는 꼬리표가 지금과 같을 때만 남긴다. */
  const measure = useCallback(
    (m: Mistake, move: string, key: string) => {
      const pending = before.current;
      if (!engine || !pending || !askKey || pending.key !== askKey) {
        setResult({ key, failed: true });
        return;
      }
      const after: PositionRef = { startFen: m.startFen, moves: [...m.moves, move] };
      pending.look
        .then(async (b) => {
          const snap = await engine.analyzeOnce(after, MISTAKE_LIMITS);
          let a = lookOf(snap);
          if (!a) {
            // 둔 뒤 상대가 둘 수가 없다 - 내 수로 판이 끝났다(외통). 엔진에 물어 확인한다.
            const p = await engine.probe(after);
            if (p.legal.length > 0) throw new Error("둔 뒤 국면을 재지 못했습니다.");
            a = { score: 0, mate: m.mySide === "cho" ? 1 : -1 };
          }
          return measuredVerdict(m.mySide, b, a);
        })
        .catch(fail)
        .then(
          (verdict) => {
            if (tryKeyRef.current === key) setResult({ key, verdict });
          },
          () => {
            if (tryKeyRef.current === key) setResult({ key, failed: true });
          }
        );
    },
    [engine, askKey]
  );

  const ready = engineStatus === "ready" && engine !== null && legalNow !== null;
  const canTouch = ready && open !== null && mine === null;

  const pushMove = (from: Square, to: Square, animate = true) => {
    if (!open || !problem || !tryKey || mine !== null) return;
    setSelected(null);
    const move = from + to;
    const captured = problem.board[to];
    playMoveSound(captured ? "capture" : "move");
    flyKey.current += 1;
    setFly(animate ? { from, to, captured, key: flyKey.current } : null);
    setPlayed({ key: tryKey, move });
    const quick = quickVerdict(open, move);
    if (quick) setResult({ key: tryKey, verdict: quick });
    else measure(open, move, tryKey);
  };

  const position = problem ?? EMPTY;
  const touch = useBoardTouch({
    legal: legalNow ?? NO_MOVES,
    position,
    selected,
    setSelected,
    canTouch,
    pushMove,
  });

  const notation = mine && problem ? describeMove(mine, problem.board).short : "";
  const verdict = outcome && "verdict" in outcome ? outcome.verdict : null;
  const done = verdict !== null;

  const note: MistakeNote =
    engineStatus === "error"
      ? { kind: "broken" }
      : engineStatus === "loading" || !engine
        ? { kind: "loading" }
        : probeFailed
          ? { kind: "probeFailed" }
          : legalNow === null
            ? { kind: "preparing" }
            : mine === null
              ? { kind: "start" }
              : verdict
                ? { kind: "verdict", verdict, move: notation }
                : outcome
                  ? { kind: "measureFailed", move: notation }
                  : { kind: "measuring", move: notation };

  /*
   * 판. 재는 동안은 내 수를 둔 국면, 답이 나오면 문제 국면으로 돌아가 AI 의 수를 파란 화살표로, 내가
   * 둔 수를 칸 표시로 보인다. 내 수를 둔 판에 화살표를 그리면 내가 옮긴 기물이 AI 의 수 출발 칸을
   * 비울 수 있다. 화살표는 내 수가 AI 의 수와 같아도 그린다 - 파란 화살표는 늘 AI 의 수다.
   */
  const shown: Board =
    problem && mine && !done ? applyMove(problem, splitMove(mine).from, splitMove(mine).to).board : position.board;

  const view: MistakeBoardView = {
    board: shown,
    flipped: open?.mySide === "han",
    selected,
    targets: touch.targets,
    lastMove: mine ? splitMove(mine) : null,
    bestMove: done && open ? arrowOf(open.best) : null,
    onSquareClick: touch.onSquareClick,
    onMove: touch.onMove,
    canPick: touch.canPick,
    flyMove: done ? null : fly,
  };

  const clearTry = () => {
    setSelected(null);
    setFly(null);
    setPlayed(null);
    setResult(null);
  };

  const at = open ? flat.indexOf(open) : -1;

  return {
    list,
    open,
    show: (id) => {
      clearTry();
      setOpenId(id);
    },
    back: () => {
      clearTry();
      setOpenId(null);
    },
    next: at >= 0 ? (flat[at + 1] ?? null) : null,
    variant,
    note,
    view,
    done,
    restart: () => {
      clearTry();
      setAttempt((n) => n + 1);
    },
    retry: () => {
      clearTry();
      setTries((n) => n + 1);
    },
    openInGames: () => {
      if (open) onOpenGame(open.gameId, open.index);
    },
  };
}
