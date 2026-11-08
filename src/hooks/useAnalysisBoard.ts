// 분석판 - 기물을 마음대로 놓아 국면을 만들고, 양쪽 수를 둬 보며, AI 가 보는 형세와 추천 수를 본다
//
// 상태(만든 국면, 두어 본 수, 보는 수, 고른 도구)와 엔진에 묻는 일을 여기서 쥔다. 화면
// (components/analysis/)은 이 훅이 돌려준 값을 그리기만 하고 엔진을 모른다.
//
// **엔진은 App 이 넘긴다.** 엔진은 하나라 App 이 대국·힌트·복기·분석판에 나눠 쓴다. App 은
// 분석판 화면일 때만 엔진을 넘기고(다른 화면이면 null), 엔진 설정(MultiPV·규칙)도 App 이 화면에
// 따라 계산해 건다(App 의 options). 여기서는 setOptions 도 stop 도 부르지 않는다 - 설정을 바꿔
// 놓고 되돌리는 일을 하면 대국 탭의 설정이 어긋날 자리가 생기고, stop 을 더 보내면 줄을 선 남의
// 탐색까지 버려진다(engine.ts 의 searchGen).
//
// **잘못된 국면은 엔진에 넘기지 않는다**(janggi/editor.ts 머리 주석). 국면 검사에 걸리면
// useAnalysis 에 엔진 자리에 null 을 넘긴다. 그러면 합법수도 묻지 않고 탐색도 하지 않는다.
//
// 저장하지 않는다. App 이 쥔 상태라 다른 메뉴에 갔다 와도 남고, 새로고침하면 사라진다.

import { useCallback, useEffect, useMemo, useState } from "react";
import { playMoveSound } from "../audio/sound";
import type { JanggiEngine } from "../engine/engine";
import { ANALYSIS_LIMITS } from "../engine/levels";
import type { AnalysisSnapshot, PositionRef, Variant } from "../engine/types";
import { useAnalysis } from "../engine/useEngine";
import type { EngineStatus } from "../engine/useEngine";
import type { Board, Position, Square } from "../janggi/board";
import { START_FEN, parseFen, toFen } from "../janggi/board";
import {
  allowedAt,
  isFull,
  movePiece,
  moveRefusal,
  placePiece,
  placeRefusal,
  removePiece,
  setupProblems,
} from "../janggi/editor";
import type { HistoryEntry } from "../janggi/history";
import { movesOf, nextEntry, startHistory } from "../janggi/history";
import { arrowOf, splitMove } from "../janggi/notation";
import type { PieceChar, PieceType, Side } from "../janggi/pieces";
import { charOf, sideOf } from "../janggi/pieces";
import { gameStatus, outcomeOf, trailingPasses } from "../janggi/status";
import type { GameStatus, Outcome } from "../janggi/status";
import { useBoardTouch } from "./useBoardTouch";

/** 판을 누를 때 하는 일. 기물을 고르면 그 기물을 놓는다. */
export type EditTool = PieceType | "remove" | "move";

/** 국면 만들기 / 두어 보기 */
export type AnalysisMode = "edit" | "play";

/** 국면을 새로 놓는 시작점. 대국 판은 대국 탭에서 보는 국면이다(수순은 가져오지 않는다). */
export type StartKind = "empty" | "start" | "play";

/** 판(components/board/Board)에 넘길 것. 화면이 그대로 펼친다. */
export interface AnalysisBoardView {
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

export interface AnalysisBoard {
  /** 엔진이 떴는지. 뜨기 전이나 못 떴으면 두어 보기와 AI 분석을 할 수 없다(국면 만들기는 된다). */
  engineStatus: EngineStatus;
  mode: AnalysisMode;
  setMode: (mode: AnalysisMode) => void;
  /** 판에 선 국면 */
  position: Position;
  view: AnalysisBoardView;

  // --- 국면 만들기 ---
  tool: EditTool;
  setTool: (tool: EditTool) => void;
  /** 기물 칸이 놓는 쪽 */
  toolSide: Side;
  setToolSide: (side: Side) => void;
  /** 다 놓아서 더 놓을 수 없는 기물인지(지금 판 기준). 궁은 옮겨 놓으므로 늘 거짓이다. */
  full: (type: PieceType) => boolean;
  /** 방금 누른 자리에 놓지 못한 까닭. 다음에 무언가를 하면 지워진다. */
  note: string | null;
  setTurn: (side: Side) => void;
  load: (kind: StartKind) => void;
  canUndoEdit: boolean;
  undoEdit: () => void;
  flip: () => void;
  /** 엔진에 넘기기 전에 고쳐야 할 것. 비어 있어야 두어 보기와 AI 분석을 한다. */
  problems: string[];
  /** 분석판 규칙. 처음 값은 대국 탭 규칙이고 저장하지 않는다. */
  variant: Variant;
  setVariant: (v: Variant) => void;

  // --- 두어 보기 ---
  cursor: number;
  last: number;
  goTo: (i: number) => void;
  canPass: boolean;
  pass: () => void;
  /** 지금 국면의 판정. 엔진 답을 받기 전에는 "playing" 이다. */
  status: GameStatus;
  /** 지금 국면에서 판이 끝났으면 어떻게 */
  outcome: Outcome | null;

  // --- AI 분석 ---
  analysisOn: boolean;
  setAnalysisOn: (on: boolean) => void;
  /** 지금 국면의 탐색 결과. 국면이 바뀌면 앞 국면의 결과는 버린다(useAnalysis 의 국면 열쇠). */
  snapshot: AnalysisSnapshot | null;
}

interface Options {
  /** 분석판 화면일 때만 엔진. 다른 화면이면 null 이라 아무것도 묻지 않는다. */
  engine: JanggiEngine | null;
  engineStatus: EngineStatus;
  /** 대국 탭에서 보는 국면. [대국 판]이 가져온다. */
  playFen: string;
  /** 대국 탭 규칙. 분석판에서 규칙을 고르기 전에는 이 규칙을 쓴다. */
  defaultVariant: Variant;
}

/** 두어 본 수까지 담은 판 한 벌. 되돌리기가 이것을 통째로 돌려 놓는다. */
interface Snapshot {
  history: HistoryEntry[];
  cursor: number;
}

const EMPTY: Position = { board: {}, turn: "cho", halfmove: 0, fullmove: 1 };

/** 되돌리기를 얼마나 기억할지. */
const UNDO_LIMIT = 100;

const fresh = (pos: Position): Snapshot => ({ history: startHistory(toFen(pos)), cursor: 0 });

export function useAnalysisBoard(options: Options): AnalysisBoard {
  const { engine, engineStatus, playFen, defaultVariant } = options;

  const [mode, setModeState] = useState<AnalysisMode>("edit");
  const [state, setState] = useState<Snapshot>(() => fresh(parseFen(START_FEN)));
  const [undo, setUndo] = useState<Snapshot[]>([]);
  const [tool, setToolState] = useState<EditTool>("move");
  const [toolSide, setToolSideState] = useState<Side>("cho");
  const [selected, setSelected] = useState<Square | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  /**
   * 분석판에서 고른 규칙. 고르기 전(null)에는 대국 탭 규칙을 따라간다 - 이 훅은 앱이 뜰 때부터
   * 돌아서, 처음 값으로 굳히면 앱을 연 뒤 대국 탭에서 바꾼 규칙을 모른다. 저장하지 않으므로
   * 새로고침하면 다시 따라간다.
   */
  const [picked, setPicked] = useState<Variant | null>(null);
  const variant = picked ?? defaultVariant;
  const [analysisOn, setAnalysisOn] = useState(true);
  const [fly, setFly] = useState<{
    from: Square;
    to: Square;
    captured?: PieceChar;
    ply: number;
    key: number;
  } | null>(null);

  const { history, cursor } = state;
  const entry = history[cursor];
  const position = useMemo(() => parseFen(entry.fen), [entry.fen]);
  const problems = useMemo(() => setupProblems(position), [position]);

  /**
   * 규칙을 바꾼 바로 그 그림에서는 엔진을 넘기지 않는다.
   *
   * 합법수는 규칙마다 다를 수 있는데(빅장), useAnalysis 는 국면이 바뀔 때만 합법수를 다시 묻는다.
   * 엔진을 한 번 뺐다가 넣으면 같은 국면이라도 새로 묻는다. 새 규칙은 App 이 같은 그림에서
   * 엔진에 건다(setOptions 가 먼저 줄을 서고, 묻기·탐색은 60·180ms 뒤에 선다).
   */
  const [askedVariant, setAskedVariant] = useState(variant);
  useEffect(() => setAskedVariant(variant), [variant]);

  const asking = problems.length === 0 && askedVariant === variant ? engine : null;

  const ref: PositionRef = useMemo(
    () => ({ startFen: history[0].fen, moves: movesOf(history.slice(0, cursor + 1)) }),
    [history, cursor]
  );

  // 탐색을 다시 걸어야 하는 엔진 설정은 분석판에서는 규칙뿐이다(MultiPV 는 분석판에 있는 동안 늘 3).
  const { snapshot, legal, checkers, probed } = useAnalysis(
    asking,
    ref,
    analysisOn,
    ANALYSIS_LIMITS,
    variant
  );

  const status = useMemo(
    () =>
      gameStatus({
        position,
        legal,
        checkers,
        ready: probed,
        plies: cursor,
        pointsRule: variant !== "janggitraditional",
        bikjangRule: variant !== "janggimodern",
        passesInRow: trailingPasses(ref.moves),
      }),
    [position, legal, checkers, probed, cursor, variant, ref]
  );
  const outcome = useMemo(() => outcomeOf(status, null, null), [status]);

  // --- 바꾸기 ---------------------------------------------------------------

  /** 판을 고친다. 두어 본 수가 있으면 지우고, 고친 판이 새 시작 국면이 된다. 되돌릴 수 있다. */
  const edit = useCallback(
    (next: Position) => {
      setUndo((u) => [...u, state].slice(-UNDO_LIMIT));
      setState(fresh(next));
      setSelected(null);
      setNote(null);
      setFly(null);
    },
    [state]
  );

  const editBoard = (board: Board) => {
    if (board === position.board) return;
    edit({ ...position, board, halfmove: 0, fullmove: 1 });
  };

  /** 누른 자리에 고른 도구를 쓴다(기물을 놓거나 뺀다). 옮기기는 아래 따로. */
  const applyTool = (square: Square) => {
    if (tool === "move") return;
    if (tool === "remove") {
      if (position.board[square]) editBoard(removePiece(position.board, square));
      return;
    }
    const piece = charOf(tool, toolSide);
    const refusal = placeRefusal(position.board, piece, square);
    if (refusal) {
      setNote(refusal);
      return;
    }
    editBoard(placePiece(position.board, piece, square));
  };

  /** 만들기에서 판의 기물을 옮긴다. */
  const moveEdit = (from: Square, to: Square) => {
    const refusal = moveRefusal(position.board, from, to);
    if (refusal) {
      setNote(refusal);
      setSelected(null);
      return;
    }
    editBoard(movePiece(position.board, from, to));
  };

  // --- 두어 보기 -------------------------------------------------------------

  const pushMove = useCallback(
    (from: Square, to: Square, animate = true) => {
      const board = parseFen(state.history[state.cursor].fen).board;
      playMoveSound(from !== to && board[to] ? "capture" : "move");
      setFly(
        animate && from !== to
          ? { from, to, captured: board[to], ply: state.cursor + 1, key: Date.now() }
          : null
      );
      setSelected(null);
      setState((s) => {
        const base = s.history.slice(0, s.cursor + 1);
        return { history: [...base, nextEntry(base[base.length - 1].fen, from, to)], cursor: s.cursor + 1 };
      });
    },
    [state]
  );

  const touch = useBoardTouch({
    legal,
    position,
    selected,
    setSelected,
    canTouch: mode === "play" && asking !== null && outcome === null,
    pushMove,
  });

  /** 수를 오간다. 한 칸이면 그 수를 날린다(대국·기보와 같다). */
  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(history.length - 1, i));
      if (next === cursor) return;
      setSelected(null);
      const step = next === cursor + 1 ? history[next].move : null;
      const back = next === cursor - 1 ? history[cursor].move : null;
      const mv = step ?? back;
      const { from, to } = mv ? splitMove(mv) : { from: "", to: "" };
      setFly(
        from && to && from !== to
          ? {
              from: step ? from : to,
              to: step ? to : from,
              captured: step ? parseFen(history[cursor].fen).board[to] : undefined,
              ply: next,
              key: Date.now(),
            }
          : null
      );
      setState((s) => ({ ...s, cursor: next }));
    },
    [history, cursor]
  );

  // --- 판에 넘길 것 -----------------------------------------------------------

  /** 만들기에서 궁·사·졸을 놓거나 옮길 때, 갈 수 있는 자리에 점을 찍는다. 다른 기물은 아무 데나 간다. */
  const editTargets = useMemo(() => {
    const piece =
      tool === "move"
        ? selected
          ? position.board[selected]
          : undefined
        : tool === "remove"
          ? undefined
          : charOf(tool, toolSide);
    if (!piece || !["k", "a", "p"].includes(piece.toLowerCase())) return [];
    return Object.keys(SQUARES).filter(
      (s) => s !== selected && allowedAt(piece, s) && position.board[s] !== piece
    );
  }, [tool, toolSide, selected, position.board]);

  const editing = mode === "edit";

  const view: AnalysisBoardView = {
    board: position.board,
    flipped,
    selected: editing ? (tool === "move" ? selected : null) : selected,
    targets: editing ? editTargets : touch.targets,
    lastMove: editing ? null : arrowOf(entry.move),
    bestMove:
      analysisOn && asking && outcome === null ? arrowOf(snapshot?.lines[0]?.pv[0] ?? null) : null,
    checkedKing:
      checkers.length > 0
        ? (Object.entries(position.board).find(
            ([, p]) => p.toLowerCase() === "k" && sideOf(p) === position.turn
          )?.[0] ?? null)
        : null,
    // 만들기: 기물·빼기를 고른 동안에는 기물을 집지 않는다. 그래야 기물을 눌러도 onSquareClick 이
    // 온다(Board 는 집은 기물을 그 자리에서 떼면 누름으로 치지 않는다). 옮기기일 때만 집는다.
    canPick: editing ? (s) => tool === "move" && Boolean(position.board[s]) : touch.canPick,
    onPick: editing
      ? (s) => {
          setNote(null);
          setSelected(s);
        }
      : touch.onSquareClick,
    onSquareClick: editing
      ? (s) => {
          if (tool !== "move") return applyTool(s);
          if (selected && s !== selected) return moveEdit(selected, s);
          setSelected(selected === s || !position.board[s] ? null : s);
        }
      : touch.onSquareClick,
    onMove: editing ? (from, to) => (tool === "move" ? moveEdit(from, to) : undefined) : touch.onMove,
    flyMove: fly && fly.ply === cursor && !editing ? fly : null,
  };

  // --- 그 밖 ------------------------------------------------------------------

  const load = (kind: StartKind) =>
    edit(kind === "empty" ? EMPTY : parseFen(kind === "start" ? START_FEN : playFen));

  return {
    engineStatus,
    mode,
    setMode: (m) => {
      setModeState(m);
      setSelected(null);
      setNote(null);
    },
    position,
    view,
    tool,
    setTool: (t) => {
      setToolState(t);
      setSelected(null);
      setNote(null);
    },
    toolSide,
    setToolSide: (s) => {
      setToolSideState(s);
      setNote(null);
    },
    full: (type) => isFull(position.board, charOf(type, toolSide)),
    note,
    setTurn: (side) => {
      if (side !== position.turn) edit({ ...position, turn: side });
    },
    load,
    canUndoEdit: undo.length > 0,
    undoEdit: () => {
      const prev = undo[undo.length - 1];
      if (!prev) return;
      setUndo((u) => u.slice(0, -1));
      setState(prev);
      setSelected(null);
      setNote(null);
      setFly(null);
    },
    flip: () => setFlipped((f) => !f),
    problems,
    variant,
    setVariant: setPicked,
    cursor,
    last: history.length - 1,
    goTo,
    canPass: mode === "play" && asking !== null && outcome === null && touch.passSquare !== null,
    pass: touch.pass,
    status,
    outcome,
    analysisOn,
    setAnalysisOn,
    snapshot: asking ? snapshot : null,
  };
}

/** 판의 모든 교차점. 점 찍을 자리를 고를 때 쓴다. */
const SQUARES: Record<Square, true> = (() => {
  const out: Record<Square, true> = {};
  for (const f of "abcdefghi") for (let r = 1; r <= 10; r++) out[f + r] = true;
  return out;
})();
