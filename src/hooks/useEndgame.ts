// 끝내기·국면 연습 - 정해진 국면에서 내 쪽을 두고 AI 가 응수한다. 목표를 이뤘는지 보고, 깬 국면을 남긴다
//
// 상태(고른 국면, 둔 수, 보는 수)와 엔진에 묻는 일(합법수·장군, AI 의 수, 힌트)을 여기서 쥔다. 화면
// (components/endgame/)은 이 훅이 돌려준 값을 그리기만 하고 엔진을 모른다.
//
// **엔진은 App 이 넘긴다**(분석판의 hooks/useAnalysisBoard 와 같은 길). 엔진은 하나라 App 이 대국·힌트·
// 복기·분석판·끝내기에 나눠 쓴다. App 은 끝내기·국면 연습 화면일 때만 엔진을 넘기고, 엔진 설정(그
// 국면의 규칙, 실력 20)도 App 이 화면에 따라 계산해 건다. 여기서는 setOptions 도 stop 도 부르지
// 않는다 - 설정을 바꿔 놓고 되돌리면 대국 탭의 설정이 어긋날 자리가 생기고, stop 을 더 보내면 줄을
// 선 남의 탐색까지 버려진다(engine.ts 의 searchGen).
//
// AI 의 착수(뜸 0.45초, 같은 국면에서 두 번 두지 않기)는 App 의 대국 탭 착수와 같은 방식을 여기에 한
// 벌 더 둔다. App 쪽을 옮겨 같이 쓰게 하는 것은 대국 탭 착수를 고치는 일이라 따로 한다.
//
// **기보에 남기지 않는다.** 이 훅은 기보 목록을 모른다. 결과 창·측정 이벤트도 없다. 대국 탭에서
// 찍는 first_move·game_end·game_start 를 지나지 않는다.
//
// 깬 국면만 이 기기에 남긴다(janggi:endgame-cleared). usePersisted 를 쓰지 않는다 - 그것은 처음에 한 번
// 읽고 통째로 다시 써서, 같은 기기의 두 탭에서 쓰면 먼저 쓴 것이 지워진다. 남길 때 다시 읽어 합쳐 쓰고,
// 다른 탭이 쓴 것은 storage 이벤트로 받는다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playMoveSound } from "../audio/sound";
import type { JanggiEngine } from "../engine/engine";
import { ENDGAME_AI_LIMITS, HINT_LIMITS, MIN_THINK_MS } from "../engine/levels";
import type { AnalysisSnapshot, PositionRef, Variant } from "../engine/types";
import { forgetIfMoved, positionKey } from "../engine/types";
import { useAnalysis, useHint } from "../engine/useEngine";
import type { EngineStatus } from "../engine/useEngine";
import type { Board, Position, Square } from "../janggi/board";
import { parseFen, undoTarget } from "../janggi/board";
import type { ClearedRecord, EndgameGroup, EndgamePosition, GoalState } from "../janggi/endgame";
import { NO_CLEARED, goalState, isClearedRecord, mergeCleared, mySideOf } from "../janggi/endgame";
import type { HistoryEntry } from "../janggi/history";
import { movesOf, nextEntry, startHistory } from "../janggi/history";
import { arrowOf, describeMove, splitMove } from "../janggi/notation";
import type { PieceChar, Side } from "../janggi/pieces";
import { sideOf } from "../janggi/pieces";
import { gameStatus, outcomeOf, trailingPasses, variantRules } from "../janggi/status";
import type { GameStatus } from "../janggi/status";
import { useBoardTouch } from "./useBoardTouch";
import { readStored, writeStored } from "./usePersisted";

/** 깬 기록의 키(앞의 "janggi:" 는 usePersisted 가 붙인다). */
const CLEARED_KEY = "endgame-cleared";

/** 이번 국면은 모두 현대 규칙이다. 국면을 열기 전(목록)에도 이 규칙을 건다 - 열 때 설정이 바뀌지 않게. */
const DEFAULT_VARIANT: Variant = "janggimodern";

/** 판(components/board/Board)에 넘길 것. 화면이 그대로 펼친다. */
export interface EndgameBoardView {
  board: Board;
  flipped: boolean;
  selected: Square | null;
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  bestMove: { from: Square; to: Square } | null;
  checkedKing: Square | null;
  onSquareClick: (square: Square) => void;
  onMove: (from: Square, to: Square) => void;
  onPick: (square: Square) => void;
  canPick: (square: Square) => boolean;
  flyMove: { from: Square; to: Square; captured?: PieceChar; key: number } | null;
}

/** 판 조작 줄(components/board/BoardControls, 대국 모양)에 넘길 것. */
export interface EndgameControls {
  cursor: number;
  last: number;
  /** 판이 끝났는지. 끝나면 무르기·다시가 이전·다음이 된다. */
  finished: boolean;
  canPass: boolean;
  canHint: boolean;
  onJump: (i: number) => void;
  onUndo: () => void;
  onFlip: () => void;
  onPass: () => void;
  onHint: () => void;
}

/** 끝난 판의 결과. 끝난 그 국면에서 굳힌다 - 끝난 뒤 이전으로 되짚어도 바뀌지 않는다. */
export interface EndgameResult {
  achieved: boolean;
  reason: string;
  /** 힌트나 무르기를 썼는지. 썼으면 이뤄도 깬 국면으로 남기지 않는다. */
  assisted: boolean;
}

export interface EndgameBoard {
  /** 엔진이 떴는지. 뜨기 전이나 못 떴으면 국면을 둘 수 없다(목록은 선다). */
  engineStatus: EngineStatus;
  /** 엔진에 걸 규칙. App 의 엔진 설정이 읽는다. */
  variant: Variant;
  /** 두고 있는 국면. 목록을 보고 있으면 null. */
  open: EndgamePosition | null;
  start: (p: EndgamePosition) => void;
  /** 처음 국면으로 다시 놓는다. */
  restart: () => void;
  close: () => void;
  mySide: Side;
  position: Position;
  view: EndgameBoardView;
  controls: EndgameControls;
  /** AI 가 둘 차례이고 판이 끝나지 않았다. */
  thinking: boolean;
  /** 지금 국면의 판정(장군 등). 엔진 답을 받기 전에는 "playing". */
  status: GameStatus;
  /** 목표까지(남은 수) 또는 끝난 모양. 끝났으면 result 가 같은 것을 굳혀 둔다. */
  goal: GoalState;
  result: EndgameResult | null;
  /** 힌트 한 줄("AI의 수 43병53"). 없으면 null. */
  hintNote: string | null;
  /** 이 기기에서 깬 국면의 id. */
  cleared: ReadonlySet<string>;
  /** 엔진의 탐색 결과(시험용으로 늦은 답을 보려고 내보낸다). */
  snapshot: AnalysisSnapshot | null;
}

interface Options {
  /** 끝내기·국면 연습 화면일 때만 엔진. 다른 화면이면 null 이라 아무것도 묻지 않는다. */
  engine: JanggiEngine | null;
  engineStatus: EngineStatus;
  /** 지금 화면의 묶음. 다른 메뉴로 가거나(null) 다른 묶음으로 가면 두던 국면이 끝난다. */
  group: EndgameGroup | null;
}

interface Play {
  position: EndgamePosition;
  history: HistoryEntry[];
  cursor: number;
  assisted: boolean;
  result: EndgameResult | null;
}

const readCleared = (): ClearedRecord => readStored<ClearedRecord>(CLEARED_KEY, NO_CLEARED, isClearedRecord);

export function useEndgame(options: Options): EndgameBoard {
  const { engine, engineStatus, group } = options;

  const [play, setPlay] = useState<Play | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [fly, setFly] = useState<{ from: Square; to: Square; captured?: PieceChar; ply: number; key: number } | null>(null);
  const [cleared, setCleared] = useState<ClearedRecord>(readCleared);

  // 다른 메뉴나 다른 묶음으로 가면 두던 국면은 끝난다(외통 문제·연습 판과 같다).
  useEffect(() => {
    setPlay((p) => (p && p.position.group === group ? p : null));
    setSelected(null);
  }, [group]);

  // 다른 탭이 깬 기록을 쓰면 표시를 맞춘다.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "janggi:" + CLEARED_KEY) setCleared(readCleared());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const open = play?.position ?? null;
  const variant = open?.variant ?? DEFAULT_VARIANT;
  const mySide: Side = open ? mySideOf(open) : "cho";
  const aiSide: Side = mySide === "cho" ? "han" : "cho";
  const history = play?.history ?? EMPTY_HISTORY;
  const cursor = play?.cursor ?? 0;
  const entry = history[cursor];
  const position = useMemo(() => parseFen(entry.fen), [entry.fen]);
  const atTip = cursor === history.length - 1;
  const result = play?.result ?? null;

  const ref: PositionRef = useMemo(
    () => ({ startFen: history[0].fen, moves: movesOf(history.slice(0, cursor + 1)) }),
    [history, cursor]
  );

  const asking = open ? engine : null;
  const aiTurn = open !== null && atTip && position.turn === aiSide && result === null;

  // 탐색을 다시 걸 열쇠. App 이 규칙을 바꾸면(setOptions 가 탐색을 끊는다) 다시 건다.
  const { snapshot, legal, checkers, probed } = useAnalysis(
    asking,
    ref,
    aiTurn,
    ENDGAME_AI_LIMITS,
    `endgame|${variant}|${aiTurn}`
  );

  const status = useMemo(
    () =>
      gameStatus({
        position,
        legal,
        checkers,
        ready: probed,
        plies: cursor,
        ...variantRules(variant),
        passesInRow: trailingPasses(ref.moves),
      }),
    [position, legal, checkers, probed, cursor, variant, ref]
  );
  const outcome = useMemo(() => outcomeOf(status, null, null), [status]);

  const moved = useMemo(() => {
    let my = 0;
    let ai = 0;
    for (const h of history.slice(1, cursor + 1)) {
      if (h.mover === mySide) my++;
      else if (h.mover) ai++;
    }
    return { my, ai };
  }, [history, cursor, mySide]);

  const goal: GoalState = useMemo(
    () =>
      open
        ? goalState({ goal: open.goal, me: mySide, outcome, myMoves: moved.my, aiMoves: moved.ai, ready: probed })
        : { done: false, left: 0 },
    [open, mySide, outcome, moved, probed]
  );

  // 판 끝에서 목표가 끝나면 결과를 굳히고, 힌트·무르기 없이 이뤘으면 깬 국면으로 남긴다.
  useEffect(() => {
    if (!play || play.result || !atTip || !goal.done) return;
    const done: EndgameResult = { achieved: goal.achieved, reason: goal.reason, assisted: play.assisted };
    setPlay((p) => (p && p.position === play.position && !p.result ? { ...p, result: done } : p));
    setSelected(null);
    if (done.achieved && !done.assisted) {
      // 쓰기 직전에 다시 읽어 합친다. 다른 탭이 그사이 남긴 것을 지우지 않게.
      const next = mergeCleared(readCleared(), { cleared: [play.position.id] });
      writeStored(CLEARED_KEY, next);
      setCleared((c) => mergeCleared(c, next));
    }
  }, [play, atTip, goal]);

  // --- 수 두기 ------------------------------------------------------------------

  const pushMove = useCallback(
    (from: Square, to: Square, animate = true) => {
      if (!play) return;
      const board = parseFen(play.history[play.cursor].fen).board;
      playMoveSound(from !== to && board[to] ? "capture" : "move");
      setFly(animate && from !== to ? { from, to, captured: board[to], ply: play.cursor + 1, key: Date.now() } : null);
      setSelected(null);
      setPlay((p) => {
        if (!p) return p;
        const base = p.history.slice(0, p.cursor + 1);
        // 되짚은 자리에서 두면 뒤의 수를 버린다. 무르기를 쓴 것과 같다.
        const rewound = p.cursor < p.history.length - 1;
        return {
          ...p,
          history: [...base, nextEntry(base[base.length - 1].fen, from, to)],
          cursor: p.cursor + 1,
          assisted: p.assisted || rewound,
        };
      });
    },
    [play]
  );

  // AI 가 둔다. 대국 탭(App)과 같다: 탐색이 끝난 수를 뜸을 들여 두고, 같은 국면에서 두 번 두지 않는다.
  const playedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = positionKey(ref);
    playedFor.current = forgetIfMoved(playedFor.current, key);
    if (!aiTurn || goal.done) return;
    if (!snapshot || snapshot.running || !snapshot.bestmove) return;
    if (playedFor.current === key) return;
    const { from, to } = splitMove(snapshot.bestmove);
    if (!from || !to) return;
    const timer = window.setTimeout(() => {
      playedFor.current = key;
      pushMove(from, to);
    }, MIN_THINK_MS);
    return () => window.clearTimeout(timer);
  }, [aiTurn, goal.done, snapshot, ref, pushMove]);

  // --- 판 만지기 -----------------------------------------------------------------

  const myTurn = open !== null && result === null && position.turn === mySide && !goal.done;

  const touch = useBoardTouch({
    legal,
    position,
    selected,
    setSelected,
    canTouch: myTurn,
    pushMove,
  });

  /** 힌트 - 대국 탭의 힌트와 같다(가장 센 설정, 30만 노드·3초). 쓰면 깬 국면으로 남기지 않는다. */
  const hint = useHint(asking, ref, HINT_LIMITS);
  const canHint = myTurn && probed && !hint.searching && hint.move === null;
  const askHint = () => {
    if (!canHint) return;
    setPlay((p) => p && { ...p, assisted: true });
    hint.ask();
  };
  const hintNote = hint.searching
    ? "힌트를 찾는 중…"
    : hint.move
      ? `AI의 수 ${describeMove(hint.move, position.board).short}`
      : hint.failed
        ? "힌트를 찾지 못했습니다."
        : null;

  /** 수를 오간다. 한 칸이면 그 수를 날린다(대국·기보와 같다). */
  const goTo = useCallback(
    (i: number) => {
      if (!play) return;
      const next = Math.max(0, Math.min(play.history.length - 1, i));
      if (next === play.cursor) return;
      setSelected(null);
      const h = play.history;
      const step = next === play.cursor + 1 ? h[next].move : null;
      const back = next === play.cursor - 1 ? h[play.cursor].move : null;
      const mv = step ?? back;
      const { from, to } = mv ? splitMove(mv) : { from: "", to: "" };
      setFly(
        from && to && from !== to
          ? {
              from: step ? from : to,
              to: step ? to : from,
              captured: step ? parseFen(h[play.cursor].fen).board[to] : undefined,
              ply: next,
              key: Date.now(),
            }
          : null
      );
      setPlay((p) => p && { ...p, cursor: next });
    },
    [play]
  );

  /** 무르기 - 내 차례가 나올 때까지(보통 두 칸) 되감는다(대국과 같다). 쓰면 깬 국면으로 남기지 않는다. */
  const undo = () => {
    if (!play || result) return;
    setSelected(null);
    setFly(null);
    setPlay(
      (p) =>
        p && {
          ...p,
          cursor: undoTarget(
            p.history.map((h) => h.fen),
            p.cursor,
            mySide
          ),
          assisted: true,
        }
    );
  };

  // --- 판에 넘길 것 ----------------------------------------------------------------

  const checkedKing =
    checkers.length > 0
      ? (Object.entries(position.board).find(([, p]) => p.toLowerCase() === "k" && sideOf(p) === position.turn)?.[0] ?? null)
      : null;

  const view: EndgameBoardView = {
    board: position.board,
    flipped,
    selected,
    targets: touch.targets,
    lastMove: arrowOf(entry.move),
    bestMove: arrowOf(hint.move),
    checkedKing,
    onSquareClick: touch.onSquareClick,
    onMove: touch.onMove,
    onPick: touch.onSquareClick,
    canPick: touch.canPick,
    flyMove: fly && fly.ply === cursor ? fly : null,
  };

  const controls: EndgameControls = {
    cursor,
    last: history.length - 1,
    finished: result !== null,
    canPass: myTurn && touch.passSquare !== null,
    canHint,
    onJump: goTo,
    onUndo: undo,
    onFlip: () => setFlipped((f) => !f),
    onPass: touch.pass,
    onHint: askHint,
  };

  const begin = (p: EndgamePosition) => {
    setPlay({ position: p, history: startHistory(p.fen), cursor: 0, assisted: false, result: null });
    setSelected(null);
    setFly(null);
    // 내 쪽을 아래에 둔다. 한을 잡으면 뒤집어 놓는다.
    setFlipped(mySideOf(p) === "han");
    playedFor.current = null;
  };

  return {
    engineStatus,
    variant,
    open,
    start: begin,
    restart: () => open && begin(open),
    close: () => {
      setPlay(null);
      setSelected(null);
      setFly(null);
    },
    mySide,
    position,
    view,
    controls,
    thinking: aiTurn && !goal.done,
    status,
    goal,
    result,
    hintNote,
    cleared: useMemo(() => new Set(cleared.cleared), [cleared]),
    snapshot: asking ? snapshot : null,
  };
}

const EMPTY_HISTORY: HistoryEntry[] = startHistory("4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1");
