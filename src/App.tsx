// 장기 AI — 화면 조립과 대국 흐름
//
// 판은 둘이다. 대국 탭의 두던 판(play*)과, 기보 탭에서 목록에서 골라 연 지난 판
// (openGame). 아래의 history·cursor 는 '지금 화면에 떠 있는 판' 이라 탭에 따라 둘
// 중 하나를 가리킨다. 두던 판은 대국 탭만 만지고, 기보 탭은 연 판을 읽기만 한다.
//
// 여기서 하는 일
//   · 화면 고르기 — 메뉴 목록(screens.ts)의 화면 하나. 대국·기보는 여기서 그리고, 나머지는
//     목록에 적힌 컴포넌트를 헤더 아래에 세운다
//   · 두던 판 — 수 두기, 엔진 차례, 무르기, 새 대국·기권, 끝난 판을 기보 목록에 넣기
//   · 기보 탭 — 판 열기, 복기, 파일로 저장·불러오기
//   · 화면 — 왼쪽 메뉴(넓은 화면) / 헤더 / 판 칸(판, 폰에서는 위아래 대국자 카드) / 오른쪽 칸(대국자 카드,
//     판 조작 줄, 대국 패널 또는 복기·형세·기보)
//
// 규칙 판정은 엔진에 묻고(janggi/status.ts), 시계·복기·기보 목록 저장·판 크기 재기는
// hooks/ 에 있다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Board } from "./components/board/Board";
import { BoardControls } from "./components/board/BoardControls";
import { PlayerCard } from "./components/board/PlayerCard";
import { ConfirmDialog } from "./components/common/ConfirmDialog";
import { FeedbackButton } from "./report/feedback";
import { track } from "./report/events";
import { EvalGraph } from "./components/games/EvalGraph";
import { GameBar } from "./components/games/GameBar";
import { GameList } from "./components/games/GameList";
import { ReviewPanel } from "./components/games/ReviewPanel";
import { AppHeader } from "./components/layout/AppHeader";
import { BootScreen } from "./components/layout/BootScreen";
import { NoticeDialog } from "./components/layout/NoticeDialog";
import { SideNav } from "./components/layout/SideNav";
import { UpdatesDialog } from "./components/layout/UpdatesDialog";
import { GameOverDialog } from "./components/play/GameOverDialog";
import { PlayPanel } from "./components/play/PlayPanel";

import { playMoveSound } from "./audio/sound";
import {
  DEFAULT_LEVEL_ID,
  DEFAULT_REVIEW_DEPTH_ID,
  ENGINE_MOVE_CAP_MS,
  LEVELS,
  MIN_THINK_MS,
  REVIEW_DEPTHS,
  levelById,
  limitsOf,
  reviewDepthById,
  reviewPlan,
} from "./engine/levels";
import type { EngineOptions, PositionRef, SearchLimits, Variant } from "./engine/types";
import { forgetIfMoved, isEnginePrefs, isVariant, positionKey } from "./engine/types";
import { useAnalysis, useEngine } from "./engine/useEngine";
import { useBoardFit } from "./hooks/useBoardFit";
import { useClockTicking, useGameClock } from "./hooks/useGameClock";
import { useKeyboard } from "./hooks/useKeyboard";
import { useNarrow } from "./hooks/useNarrow";
import { readStored, usePersisted, writeStored } from "./hooks/usePersisted";
import { useBoardTouch } from "./hooks/useBoardTouch";
import { useCallout } from "./hooks/useCallout";
import { useGames } from "./hooks/useGames";
import { useServerGames } from "./hooks/useServerGames";
import { useReview } from "./hooks/useReview";

import { newGameId, upsertGame } from "./janggi/archive";
import type { ArchivedGame, ArchivedResult } from "./janggi/archive";
import type { Position, Square } from "./janggi/board";
import { START_FEN, parseFen, toFen, undoTarget } from "./janggi/board";
import { CLOCK_PRESETS, DEFAULT_CLOCK_ID, clockPresetById, moveBudgetMs } from "./janggi/clock";
import type { HistoryEntry } from "./janggi/history";
import { hangulHistory, movesOf, nextEntry, startHistory } from "./janggi/history";
import { arrowOf, splitMove } from "./janggi/notation";
import type { PieceChar, PieceType, Side } from "./janggi/pieces";
import { sideOf } from "./janggi/pieces";
import { bestArrowOf } from "./janggi/review";
import type { SavedGame } from "./janggi/savedGame";
import { isSavedGame } from "./janggi/savedGame";
import { applySetup, detectSetup } from "./janggi/setups";
import type { Setup } from "./janggi/setups";
import {
  capturedPieces,
  gameStatus,
  outcomeMessage,
  outcomeOf,
  scoreBoard,
  sideTag,
  statusMessage,
  trailingPasses,
} from "./janggi/status";
import type { Outcome } from "./janggi/status";

import { SCREENS, menuOf } from "./screens";
import type { ScreenId } from "./screens";

/** 메뉴 두 곳(폰 ☰ · 왼쪽 메뉴)이 그리는 목록. */
const MENU = menuOf(SCREENS);

export default function App() {
  const { engine, status, progress, error } = useEngine();
  const [mode, setMode] = useState<ScreenId>("play");
  const screen = SCREENS.find((s) => s.id === mode);
  /** 목록에 적힌 컴포넌트로 서는 화면. 대국·기보면 null 이다(판은 여기서 그린다). */
  const Page = screen && "Component" in screen ? screen.Component : null;
  const narrow = useNarrow();

  // --- 두던 판 (대국 탭) --------------------------------------------------

  /** 새로고침 전에 두던 판. 한 수 이상 둔 판만 되살린다. */
  const savedGame = useMemo(() => {
    const g = readStored<SavedGame | null>("game", null, isSavedGame);
    // 예전 판은 기보 표기가 한자다(73卒63). 이 판이 끝나 목록에 들 때 한글 표기와 섞이지 않게.
    return g && g.history.length > 1 ? { ...g, history: hangulHistory(g.history) } : null;
  }, []);

  const [playHistory, setPlayHistory] = useState<HistoryEntry[]>(
    savedGame ? savedGame.history : startHistory(START_FEN)
  );
  const [playCursor, setPlayCursor] = useState(savedGame ? savedGame.cursor : 0);
  /** 이 판의 이름표. 끝난 판을 목록에 넣을 때 같은 판이면 한 줄로 바뀐다(upsertGame). */
  const [gameId, setGameId] = useState(() => savedGame?.id ?? newGameId());
  /** 기권한 쪽 */
  const [resigned, setResigned] = useState<Side | null>(savedGame ? savedGame.resigned : null);
  const [flipped, setFlipped] = usePersisted("flipped", false, (v) => typeof v === "boolean");
  /** 집어 든 기물의 자리 */
  const [selected, setSelected] = useState<Square | null>(null);
  /**
   * 화면 읽기 프로그램에 한 번 말하고 마는 알림. 4초 뒤 비운다. 화면에는 띄우지 않는다 -
   * 보이는 알림은 누른 자리에 있다(넣은 판의 카드, 목록 제목 아래 한 줄).
   * 떠 있는 알림은 오른쪽 칸의 무언가(복기 설명, 쪽 번호)를 가렸다.
   */
  const [notice, setNotice] = useState<string | null>(null);

  // --- 대국 설정 (브라우저에 남는다) ----------------------------------------
  // 남겨 둔 값이 지금 목록에 없으면(옛 급수·옛 시계 등) usePersisted 가 기본값으로 돌린다.

  const [mySide, setMySide] = usePersisted<Side>("mySide", "cho", (v) => v === "cho" || v === "han");
  const [levelId, setLevelId] = usePersisted(
    "levelId",
    DEFAULT_LEVEL_ID,
    (v) => typeof v === "string" && LEVELS.some((l) => l.id === v)
  );
  const [clockId, setClockId] = usePersisted(
    "clockId",
    DEFAULT_CLOCK_ID,
    (v) => typeof v === "string" && CLOCK_PRESETS.some((c) => c.id === v)
  );
  /** 엔진 설정. 화면에서 고르는 것은 규칙(variant)뿐이고 스레드·해시는 처음 값 그대로다. */
  const [prefs, setPrefs] = usePersisted<Omit<EngineOptions, "skill">>(
    "enginePrefs",
    {
      threads: Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 4)),
      hashMb: 128,
      multiPV: 3,
      variant: "janggi",
    },
    isEnginePrefs
  );
  const level = levelById(levelId);
  /*
   * 목록 속 객체 그대로다(렌더마다 같은 참조). 엔진이 쓸 시간과 시계가 이 값을 의존성으로
   * 쥐고 있어서, 새 객체가 되면 탐색이 계속 다시 시작돼 엔진이 한 수도 못 둔다.
   */
  const clockSettings = clockPresetById(clockId);
  const clock = useGameClock(clockSettings, savedGame ? savedGame.flagged : null);
  const { clocks, flagged, clocksRef, commit: commitClock, reset: resetClocks } = clock;

  // --- 기보 탭 ----------------------------------------------------------

  const [reviewDepthId, setReviewDepthId] = usePersisted(
    "reviewDepthId",
    DEFAULT_REVIEW_DEPTH_ID,
    (v) => typeof v === "string" && REVIEW_DEPTHS.some((d) => d.id === v)
  );
  const review = useReview(engine);

  /*
   * 기보 탭이 들고 있던 것 일곱(목록·연 판·쪽·오류·방금 넣은 판·보는 수·뒤집기)과
   * 거기서 하는 일(열기·닫기·파일 넣고 빼기)을 한 훅에 모았다. 일곱이 늘 같이
   * 움직여서, 흩어 두면 그중 하나를 빠뜨리는 것이 버그가 된다.
   */
  const archive = useGames({
    active: mode === "games",
    busy: review.running,
    engine,
    variant: prefs.variant,
    onLoaded: setNotice,
  });
  const { games, setGames, openGame, listView } = archive;

  /*
   * 로그인 상태와 "서버에도 남기기". 목록을 넘겨주면 바뀌는 것을 보고 알아서 올린다 -
   * 판이 끝나는 자리와 복기가 끝나는 자리에 각각 붙이지 않는 까닭은 그 훅 주석에 있다.
   */
  const server = useServerGames(games);

  // --- 지금 화면에 떠 있는 판 ---------------------------------------------

  /*
   * 복기가 도는 동안의 중간 결과. 지금 연 판의 것일 때만 쓴다.
   * 다 끝나기를 기다리지 않고 설명과 형세를 띄우려는 것이다 - 1차가 끝나면(기보 전체를
   * 가볍게 훑는 데 몇 초) 모든 수에 설명이 붙고, 2차가 고른 수를 갈아 끼운다.
   */
  const partial =
    review.partial && openGame && review.partial.gameId === openGame.id
      ? review.partial
      : null;

  const history = openGame ? (partial?.history ?? openGame.history) : playHistory;
  const cursor = openGame ? archive.cursor : playCursor;
  const setCursor = openGame ? archive.setCursor : setPlayCursor;
  const reviewed = openGame?.reviewed ?? partial?.reviewed ?? null;
  const boardFlipped = openGame ? archive.flipped : flipped;

  const entry = history[cursor];
  const position = useMemo(() => parseFen(entry.fen), [entry.fen]);
  /** 대국 탭의 판에 한 수라도 뒀는지. 시계·규칙 잠금·새 대국 확인이 본다. */
  const started = playHistory.length > 1;

  /*
   * 첫 수를 둔 것을 한 판에 한 번만 알린다.
   *
   * **판 번호로 기억하는 까닭** - `started` 만 보면 무르기로 첫 수를 되돌렸다가 다시 둘 때
   * 또 찍힌다. 그러면 '한 수라도 둔 사람' 수가 실제보다 많아지고, 하필 그 숫자가 우리가
   * 보려는 깔때기의 가운데 칸이다.
   *
   * **두던 판을 들고 들어온 사람은 처음부터 보낸 것으로 친다.** 그러지 않으면 쪽이 뜨는
   * 순간 `started` 가 이미 참이라 **수를 한 개도 안 뒀는데 찍힌다.** 2026-10-12 에 실제로
   * 그랬다 - 엔진이 1102ms 에 떴는데 첫 수가 126ms 로 찍혀 있었다. 엔진이 뜨기 전에 둘
   * 수는 없으니, 그 줄은 사람이 아니라 복구가 만든 것이다.
   *
   * 대가로 **이어서 두는 사람은 안 세어진다.** 그 대신 새 판을 시작하면(`gameId` 가
   * 바뀌면) 그때부터 정상으로 센다. 세려던 것이 "들어와서 수를 두나" 라서, 부풀리는
   * 쪽보다 덜 세는 쪽을 골랐다 - **깔때기는 과장되면 쓸모가 없다.**
   */
  const firstMoveSent = useRef<string | null>(savedGame ? gameId : null);
  useEffect(() => {
    if (!started || firstMoveSent.current === gameId) return;
    firstMoveSent.current = gameId;
    // 엔진이 뜬 시각과 같은 잣대(performance.now)를 쓴다. 빼면 '엔진이 뜨고 몇 초 만에
    // 첫 수를 뒀나' 가 나온다.
    track("first_move", { ms: Math.round(performance.now()), level: levelId, side: mySide });
    // gameId 와 started 만 본다. 급수·내 쪽을 넣으면 그것만 바뀌어도 다시 돈다.
  }, [started, gameId]);
  /** 연 판은 그 판을 둔 규칙으로 판정한다. 빅장·수 반복이 규칙마다 다르다. */
  const variant: Variant =
    openGame && isVariant(openGame.variant) ? openGame.variant : prefs.variant;

  /**
   * 엔진에 넘길 국면. FEN 만이 아니라 수순까지 준다 - 장군반복 금지·빅장은 '어떻게
   * 여기까지 왔는가' 를 봐야 판정된다.
   */
  const positionRef: PositionRef = useMemo(
    () => ({ startFen: history[0].fen, moves: movesOf(history.slice(0, cursor + 1)) }),
    [history, cursor]
  );

  // --- 엔진 차례 --------------------------------------------------------

  const engineSide: Side | null = mode === "play" ? (mySide === "cho" ? "han" : "cho") : null;
  /** 기보 끝을 보고 있는지. 무르거나 되짚는 중에는 엔진이 두지 않는다(기보를 잘라먹지 않게). */
  const atTip = cursor === history.length - 1;
  const engineTurn = mode === "play" && atTip && engineSide === position.turn;

  /**
   * 엔진이 이번 수에 쓸 시간(ms). 0 이면 시계를 쓰지 않는다.
   * 차례가 바뀔 때 한 번만 정하고 그 수를 두는 동안은 붙잡아 둔다 - 200ms 마다 줄어드는
   * 시계를 탐색 한계에 그대로 물리면 한계가 계속 바뀌어 탐색이 처음부터 다시 시작된다.
   */
  const [moveBudget, setMoveBudget] = useState(0);
  useEffect(() => {
    if (!clockSettings.enabled || !engineTurn) {
      setMoveBudget(0);
      return;
    }
    setMoveBudget(Math.round(moveBudgetMs(clocksRef.current[position.turn], clockSettings)));
  }, [engineTurn, position.turn, entry.fen, clockSettings, clocksRef]);

  /**
   * 엔진의 탐색량. 급수대로 노드를 걸고 시간 한계도 함께 건다. 엔진은 둘 중 먼저 닿는
   * 쪽에서 멈춘다. 시계를 껐어도 상한(ENGINE_MOVE_CAP_MS)은 둔다 - 높은 급수는 노드가
   * 수백만이라 상한이 없으면 한 수에 분 단위로 기다린다.
   */
  const searchLimits: SearchLimits = useMemo(
    () => ({ ...limitsOf(level), movetimeMs: moveBudget > 0 ? moveBudget : ENGINE_MOVE_CAP_MS }),
    [level, moveBudget]
  );

  const options: EngineOptions = useMemo(
    () => ({
      ...prefs,
      variant,
      // 엔진은 제 수 하나만 고른다. 후보를 넓게 보면 느려질 뿐이다.
      multiPV: 1,
      // 제 차례가 아니면 합법수·장군만 물으므로 실력은 상관없다.
      skill: engineTurn ? level.skill : 20,
    }),
    [prefs, variant, engineTurn, level.skill]
  );

  /** 탐색을 다시 걸어야 하는지 가리는 열쇠. 이 값이 바뀔 때만 useAnalysis 가 새로 묻는다. */
  const optionsKey = useMemo(
    () =>
      [
        options.threads,
        options.hashMb,
        options.multiPV,
        options.skill,
        options.variant,
        searchLimits.depth,
        searchLimits.movetimeMs,
        searchLimits.nodes,
        searchLimits.infinite,
        engineTurn,
      ].join("|"),
    [options, searchLimits, engineTurn]
  );

  // 복기가 도는 동안에는 엔진을 복기에 내준다. 엔진은 하나라 둘이 나눠 쓸 수 없다.
  useEffect(() => {
    if (engine && !review.running) void engine.setOptions(options);
  }, [engine, options, review.running]);

  /*
   * 국면마다 엔진에 합법수·장군을 묻고(probed 가 되면 답이 온 것), 엔진 차례면 둘 수를
   * 찾는다(snapshot.bestmove).
   */
  const { snapshot, legal, checkers, probed } = useAnalysis(
    engine,
    positionRef,
    !review.running && engineTurn,
    searchLimits,
    optionsKey
  );

  // --- 판정 ------------------------------------------------------------

  /** 점수제(200수·빅장·양쪽 한수쉼을 점수로 가림)가 있는지. 전통 규칙은 없고 비긴다. */
  const pointsRule = variant !== "janggitraditional";
  /** 빅장 규칙이 있는지. 현대(카카오) 규칙에서는 두 궁이 마주 봐도 아무 일이 없다. */
  const bikjangRule = variant !== "janggimodern";
  const passesInRow = useMemo(() => trailingPasses(positionRef.moves), [positionRef]);
  const gstatus = useMemo(
    () =>
      gameStatus({
        position,
        legal,
        checkers,
        ready: probed,
        // 지금 보고 있는 국면까지 둔 수. history[0] 이 시작 국면이다.
        plies: cursor,
        pointsRule,
        bikjangRule,
        passesInRow,
      }),
    [position, legal, checkers, probed, cursor, pointsRule, bikjangRule, passesInRow]
  );

  /**
   * 대국 탭의 판이 지금 보고 있는 국면에서 끝났는지, 끝났다면 어떻게(outcomeOf).
   * 기보 탭에서는 null 이다 - 그때 gstatus 는 연 판의 것이고 기권·시간패는 두던 판의
   * 것이라 섞으면 안 된다.
   */
  const outcome = useMemo(
    () => (mode === "play" ? outcomeOf(gstatus, resigned, flagged) : null),
    [mode, gstatus, resigned, flagged]
  );
  const over = outcome !== null;

  /**
   * 기보 탭에서 연 판의 결과. 마지막 수에 가 있을 때만 적는다 - 중간 국면에 "기권패" 가
   * 붙어 있으면 그 국면에서 기권한 것처럼 읽힌다. 중단한 판은 적을 결과가 없다.
   */
  const viewOutcome: Outcome | null = useMemo(() => {
    if (!openGame || !atTip) return null;
    const { kind, winner } = openGame.result;
    if (kind === "abandoned") return null;
    return { kind, winner };
  }, [openGame, atTip]);

  /** 대국자 카드와 화면 읽기에 알릴 결과. 있으면 두 카드를 다 눌러 둔다(둘 차례가 없다). */
  const shownOutcome = mode === "play" ? outcome : viewOutcome;
  const showOver = shownOutcome !== null;

  // 수를 둘 때마다 두던 판을 남긴다(savedGame.ts). 시계는 넣지 않는다.
  useEffect(() => {
    writeStored("game", {
      id: gameId,
      history: playHistory,
      cursor: playCursor,
      resigned,
      flagged,
    } satisfies SavedGame);
  }, [gameId, playHistory, playCursor, resigned, flagged]);

  // 판이 끝나면 집어 든 기물을 놓는다. 선택 링과 갈 곳 점이 남아 있으면 아직 둘 수 있는 것처럼 보인다.
  useEffect(() => {
    if (showOver) setSelected(null);
  }, [showOver]);

  // --- 끝난 판을 기보 목록에 ----------------------------------------------

  /** 대국 탭의 판을 기보 목록에 넣을 모양으로. */
  const archiveOf = useCallback(
    (result: ArchivedResult): ArchivedGame => ({
      id: gameId,
      endedAt: Date.now(),
      mySide,
      levelId,
      levelName: level.name,
      variant: prefs.variant,
      result,
      history: playHistory,
      reviewed: null,
    }),
    [gameId, mySide, levelId, level.name, prefs.variant, playHistory]
  );

  /*
   * 판이 끝나면 기보 목록에 넣고, 방금 끝났으면 결과 창을 띄운다.
   *
   * '방금 끝났는지' 는 목록이 답한다. 같은 결과로 이미 들어 있으면 본 판이라 창을
   * 띄우지 않는다 - 새로고침하거나 탭을 오갈 때마다 아는 결과가 다시 뜨지 않게.
   */
  const [resultOpen, setResultOpen] = useState(false);
  useEffect(() => {
    if (!outcome || playHistory.length < 2) return;
    const prev = games.find((g) => g.id === gameId);
    const sameResult =
      prev !== undefined &&
      prev.result.kind === outcome.kind &&
      prev.result.winner === outcome.winner;
    if (sameResult && prev.history.length === playHistory.length) return;
    setGames((list) => upsertGame(list, archiveOf(outcome)));
    if (!sameResult) {
      setResultOpen(true);
      // 여기가 '방금 끝났다' 다. 위에서 이미 본 판을 걸러냈으므로 한 판에 한 번만 찍힌다.
      track("game_end", {
        kind: outcome.kind,
        won: outcome.winner === mySide,
        moves: playHistory.length - 1,
        level: levelId,
      });
    }
  }, [outcome, games, gameId, playHistory, archiveOf, setGames]);

  /**
   * 대국 탭의 판이 끝났는지 - 지금 보는 국면이 아니라 판 전체로. 판·무르기·설정 잠금과
   * 새 대국의 '중단' 기록·확인 문구가 본다.
   *
   * over 는 보고 있는 국면의 판정이라, 외통으로 끝난 판을 '이전' 으로 되짚으면 false 가
   * 된다. 그래서 끝나는 순간 목록에 들어간 결과가 있고 수순이 그대로면 끝난 판으로 친다.
   * 끝난 판은 잠겨서 수순이 바뀌지 않으므로 새 대국을 누를 때까지 끝난 판으로 남는다.
   */
  const archivedSelf = games.find((g) => g.id === gameId);
  const ended =
    over ||
    (archivedSelf !== undefined &&
      archivedSelf.result.kind !== "abandoned" &&
      archivedSelf.history.length === playHistory.length);

  // --- 장군·멍군·빅장 외치기 ------------------------------------------------

  /*
   * 방금 둔 수로 장군·멍군·빅장이 걸렸으면 판 가운데에 한 번 외친다. 어느 국면에서
   * 외쳤는지와 앞 국면이 장군이었는지를 기억해야 해서 따로 뒀다(useCallout).
   */
  const callouts = useCallout({
    active: mode === "play",
    probed,
    checkers,
    cursor: playCursor,
    kind: gstatus.kind,
  });

  // --- 수 두기 ----------------------------------------------------------

  /** 둘 차례인 쪽. 시계가 이 쪽의 시간을 깎는다. */
  const mover = position.turn;

  /**
   * 방금 둔 수가 날아가는 모양(Board 의 flyMove). ply 는 그 수로 생긴 국면 번호라,
   * 무르거나 되짚어 다른 국면을 보고 있으면 날지 않는다.
   */
  const [fly, setFly] = useState<{
    from: Square;
    to: Square;
    captured?: PieceChar;
    ply: number;
    /** 날 때마다 다른 값. 무르고 같은 번호의 국면을 다시 둬도 새로 난다. */
    key: number;
  } | null>(null);

  /**
   * 한 수를 둔다. 사람의 수도 엔진의 수도 여기를 지난다. from === to 는 한수쉼.
   * animate 가 false 면 날리지 않는다(끌어서 둔 수는 이미 손으로 옮겼다).
   * 되짚던 자리에서 두면 그 뒤의 수는 버리고 새로 잇는다.
   */
  const pushMove = useCallback(
    (from: Square, to: Square, animate = true) => {
      // 소리는 판을 고치기 전에 낸다 - 잡는 수인지 지금 판에서 본다.
      playMoveSound(from !== to && position.board[to] ? "capture" : "move");
      setFly(
        animate && from !== to
          ? { from, to, captured: position.board[to], ply: playCursor + 1, key: Date.now() }
          : null
      );
      callouts.justMoved(playCursor + 1);
      setPlayHistory((prev) => {
        const base = prev.slice(0, playCursor + 1);
        return [...base, nextEntry(base[base.length - 1].fen, from, to)];
      });
      setPlayCursor((c) => c + 1);
      setSelected(null);
      commitClock(mover);
    },
    [playCursor, mover, position.board, commitClock, callouts]
  );

  // --- 시계 ------------------------------------------------------------

  /**
   * 시계가 도는지. 첫 수가 놓여야 돈다(급수·상차림을 고르는 동안 깎이지 않게). 되짚는
   * 중(기보 끝이 아님)·끝난 뒤·기보 탭에 가 있는 동안에는 선다.
   */
  const clockRunning = clockSettings.enabled && mode === "play" && started && atTip && !over;
  // 초읽기 소리는 내 차례에만 - 엔진은 시간에 쫓기지 않고, 소리는 사람에게 하는 말이다.
  useClockTicking(clock, clockRunning, mover, !engineTurn && mover === mySide ? mySide : null);

  // --- 엔진이 두기 --------------------------------------------------------

  /** 엔진이 이미 둔 국면의 열쇠. 같은 국면에서 두 번 두지 않게(forgetIfMoved 주석). */
  const playedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = positionKey(positionRef);
    // 국면을 벗어났으면 기억을 버린다. 안 버리면 무르고 같은 수를 다시 뒀을 때 엔진이 영영 두지 않는다.
    playedFor.current = forgetIfMoved(playedFor.current, key);

    if (!engineTurn || over) return;
    if (!snapshot || snapshot.running || !snapshot.bestmove) return;
    if (playedFor.current === key) return;
    const { from, to } = splitMove(snapshot.bestmove);
    if (!from || !to) return;

    // 약한 급수는 2천 노드만 보고 끝나 눈 깜짝할 새에 둔다. 최소한의 뜸(MIN_THINK_MS)을 들인다.
    const timer = window.setTimeout(() => {
      playedFor.current = key;
      pushMove(from, to);
    }, MIN_THINK_MS);
    return () => window.clearTimeout(timer);
  }, [engineTurn, snapshot, positionRef, pushMove, over]);

  // --- 기보 오가기 --------------------------------------------------------

  /*
   * 기보를 오간다. 한 칸만 움직일 때는 기물이 날아간다.
   *
   * 예전에는 되짚어 볼 때 기물이 순간이동했다. 한 수씩 짚어 보는 것이 복기의 전부인데,
   * 무엇이 어디서 어디로 갔는지를 눈이 따라가지 못해 매번 두 판을 머릿속에서 비교해야
   * 했다. 날려 주면 그 일을 눈이 한다.
   *
   * 두 칸 이상(처음·끝·무르기·슬라이더로 멀리)은 날리지 않는다. 지나친 수를 다 건너뛰는
   * 것이라 날릴 '한 수' 가 없고, 한 수만 날리면 나머지가 순간이동한 것처럼 보여 오히려
   * 거짓말이 된다.
   */
  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(history.length - 1, i));
      if (next === cursor) return;
      setSelected(null);

      // 앞으로 한 칸이면 그 수를, 뒤로 한 칸이면 그 수를 거꾸로 날린다.
      const step = next === cursor + 1 ? history[next].move : null;
      const back = next === cursor - 1 ? history[cursor].move : null;
      const mv = step ?? back;
      const { from, to } = mv ? splitMove(mv) : { from: "", to: "" };
      setFly(
        from && to && from !== to
          ? {
              from: (step ? from : to) as Square,
              to: (step ? to : from) as Square,
              // 앞으로 갈 때 잡힌 기물은 날아오는 동안 제자리에 남는다.
              captured: step ? parseFen(history[cursor].fen).board[to] : undefined,
              ply: next,
              key: Date.now(),
            }
          : null
      );
      setCursor(next);
    },
    [cursor, history, setCursor]
  );

  /**
   * 대국의 무르기. 내 차례가 나올 때까지(보통 내 수 + 엔진 응수 두 칸) 되감는다.
   * 한 칸만 되감으면 엔진 차례에 멈추는데, 기보 끝이 아니라 엔진이 두지 않아서 판이
   * 조용히 멈춘 것처럼 보인다. 기보 탭과 끝난 판의 '이전' 은 한 칸씩(goTo)이다.
   */
  const undoMove = useCallback(() => {
    setSelected(null);
    setPlayCursor((c) =>
      undoTarget(
        playHistory.map((h) => h.fen),
        c,
        mySide
      )
    );
  }, [mySide, playHistory]);

  const flip = useCallback(
    () => (openGame ? archive.flip() : setFlipped((f) => !f)),
    [openGame, archive, setFlipped]
  );

  // --- 판 만지기 ----------------------------------------------------------

  /**
   * 판을 만질 수 있는지. 대국 탭에서 내 차례에만, 판이 끝나기 전까지. 기보 탭은 읽기만 한다.
   * over 가 아니라 ended 를 본다 - 끝난 판을 앞 국면으로 되짚어도 잠겨 있어야 한다.
   */
  const canTouchBoard = mode === "play" && !ended && !engineTurn;

  /** 집고·끌고·한수쉼. 엔진이 알려 준 합법수를 '이 기물은 어디로 가나' 로 바꾼다. */
  const touch = useBoardTouch({
    legal,
    position,
    selected,
    setSelected,
    canTouch: canTouchBoard,
    pushMove,
  });

  // --- 판 새로 놓기 -------------------------------------------------------

  /** 날던 수·외친 말·장군 기억을 버린다. 판을 새로 놓으면 국면 번호가 다시 0부터다. */
  const forgetMoves = () => {
    setFly(null);
    callouts.forget();
  };

  /** 상차림을 바꾸면 그 판을 새 시작 국면으로 삼는다. 첫 수를 두기 전에만 된다. */
  const startFrom = (next: Position) => {
    setPlayHistory(startHistory(toFen(next)));
    setPlayCursor(0);
    setSelected(null);
    setResigned(null);
    resetClocks();
    forgetMoves();
  };

  /**
   * 새 대국. 시작 국면(상차림 포함)은 그대로 두고 수만 지운다.
   *
   * 두던 판은 남기지 않는다. 한동안 '중단' 으로 목록에 넣었는데(끝난 판은 끝날 때 이미
   * 들어간다), 목록이 '기보' 인 이상 거기 선 것은 다 둔 판으로 읽힌다. 몇 수 두다 만
   * 판이 섞여 서면 끝난 판을 골라내기가 오히려 어렵다. 없어지는 것은 새 대국을 묻는
   * 창이 미리 말한다. 파일에서 불러온 끝나지 않은 기보는 그대로 '중단' 으로 든다 -
   * 그건 사람이 일부러 가져온 것이다.
   */
  const newGame = () => {
    /*
     * **세션의 첫 판은 여기를 지나지 않는다.** 앱이 뜨면 판이 이미 놓여 있어서 '시작'
     * 이라는 순간이 없다. 그래서 이것은 "판을 시작했다" 가 아니라 **"한 판 더 뒀다"** 다.
     * 깔때기에서는 app_open·engine_ready 가 그 자리를 맡는다.
     */
    track("game_start", { level: levelId, side: mySide, clock: clockId, variant: prefs.variant });

    const base = parseFen(playHistory[0].fen);
    setPlayHistory(startHistory(toFen({ ...base, turn: "cho", halfmove: 0, fullmove: 1 })));
    setPlayCursor(0);
    setGameId(newGameId());
    setSelected(null);
    setResigned(null);
    resetClocks();
    forgetMoves();
    playedFor.current = null;
  };

  const resign = () => setResigned(mySide);

  /** 판을 끝내는 두 동작(새 대국·기권)은 확인 창으로 한 번 더 묻는다. */
  const [asking, setAsking] = useState<"new" | "resign" | null>(null);

  /** 메뉴의 '업데이트 내역' 으로 여는 창. 두던 판은 그대로 있다. */
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  // --- 탭 오가기 ----------------------------------------------------------

  /**
   * 탭을 옮긴다. 기보 탭은 늘 목록의 첫 쪽(가장 최근 판)에서 시작한다. 복기가 도는
   * 동안에는 엔진을 복기가 쥐고 있으므로 옮기지 않는다.
   */
  const goMode = useCallback(
    (next: ScreenId) => {
      if (review.running) return;
      setMode(next);
      archive.reset();
      setSelected(null);
      // 탭을 옮기면 판이 통째로 바뀐다. 남아 있던 '날아가는 수' 가 새 판에서 같은 국면
      // 번호를 만나 엉뚱하게 날지 않도록 지운다.
      setFly(null);
    },
    [review.running, archive]
  );

  /** 기기에 있는 판을 연다. 목록 쪽 일은 훅이 하고, 판 바깥의 뒷정리만 여기 남는다. */
  const 기기에서열기 = (id: string) => {
    if (!archive.open(id)) return;
    setMode("games");
    setSelected(null);
    setFly(null);
    review.clearError();
  };

  /**
   * 받아 온 판을 **다음 그림에서** 연다.
   *
   * 받자마자 바로 열 수 없다. 목록에 넣는 것은 한 박자 뒤에 반영되므로, 그 자리에서
   * 열려고 하면 "그런 판 없다" 가 되고, 다시 받으러 가면 **끝없이 받는다.** 실제로
   * 그렇게 돌다가 서버의 분당 한도에 걸려 멈췄다(2026-10-14, 로컬 확인).
   */
  const [받고열판, set받고열판] = useState<string | null>(null);

  useEffect(() => {
    if (받고열판 === null) return;
    if (!games.some((g) => g.id === 받고열판)) return;
    기기에서열기(받고열판);
    set받고열판(null);
    // 기기에서열기 는 렌더마다 새로 만들어지지만 하는 일은 같다. 목록에 들어온 것만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [받고열판, games]);

  /**
   * 기보 탭에서 한 판을 연다.
   *
   * **다른 기기에서 둔 판은 먼저 받아 온다.** 받은 판은 이 기기의 목록에 들어가므로
   * 그다음부터는 여기 있던 판과 똑같이 돈다 - 되짚기·복기·파일 저장이 갈라지지 않는다.
   */
  const openArchived = (id: string) => {
    const 줄 = server.rows.find((r) => r.id === id);
    if (줄 && !줄.local && 줄.serverId !== null) {
      void server.pull(줄.serverId).then((game) => {
        if (!game) return;
        setGames((list) => upsertGame(list, game));
        set받고열판(game.id);
      });
      return;
    }
    기기에서열기(id);
  };

  useKeyboard(
    useMemo(
      () => ({
        prev: () => goTo(cursor - 1),
        next: () => goTo(cursor + 1),
        first: () => goTo(0),
        last: () => goTo(history.length - 1),
        flip,
      }),
      [cursor, goTo, history.length, flip]
    ),
    // 창이 떠 있거나 판이 없는 화면(목록·메뉴의 다른 화면)·복기 중에는 키를 가로채지 않는다.
    !review.running && !listView && !Page && asking === null && !resultOpen
  );

  // --- 복기 -------------------------------------------------------------

  /**
   * 연 판을 복기하고, 얻은 평가치·등급을 목록의 그 판에 남긴다(다시 열 때 또 돌리지 않게).
   * 중간에 멈춘 복기는 남기지 않는다 - 그 판은 복기 전(또는 지난 복기) 그대로다.
   */
  const startReview = async () => {
    const game = openGame;
    if (!game) return;
    const run = await review.start(
      game,
      { ...prefs, variant, multiPV: 1, skill: 20 },
      reviewPlan(reviewDepthById(reviewDepthId), game.history.length - 1)
    );
    if (!run?.complete) return;
    setGames((list) =>
      list.map((g) => (g.id === game.id ? { ...g, history: run.history, reviewed: run.reviewed } : g))
    );
    setNotice("복기가 끝났습니다.");
  };

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // --- 판 위 표시 ---------------------------------------------------------

  const currentReview = useMemo(
    () => reviewed?.find((r) => r.index === cursor) ?? null,
    [reviewed, cursor]
  );
  /** 복기한 판에서, 고른 수 대신 뒀어야 할 수 */
  const bestArrow = openGame ? bestArrowOf(currentReview) : null;
  const lastMove = useMemo(() => arrowOf(entry.move), [entry.move]);

  /** 장군을 맞은 궁의 자리. 판에서 붉게 테를 두른다. */
  const checkedKing = useMemo(() => {
    if (checkers.length === 0) return null;
    return (
      Object.entries(position.board).find(
        ([, p]) => p.toLowerCase() === "k" && sideOf(p) === position.turn
      )?.[0] ?? null
    );
  }, [checkers, position]);

  const tableRef = useBoardFit(status === "ready" && !listView && !Page);

  // --- 대국자 카드 ------------------------------------------------------

  // 판은 초를 아래에 놓고 그린다. 뒤집으면 위아래가 바뀐다.
  const bottomSide: Side = boardFlipped ? "han" : "cho";
  const topSide: Side = boardFlipped ? "cho" : "han";

  const scores = useMemo(() => scoreBoard(position), [position]);

  /**
   * 두던 판을 어떤 상차림으로 시작했는지. 대국 패널이 고른 칸을 짚는다. 시작 국면에서
   * 읽는다 - 몇 수 두면 마·상이 움직여 지금 판으로는 되읽을 수 없다.
   */
  const startSetups = useMemo(() => {
    const board = parseFen(playHistory[0].fen).board;
    return { cho: detectSetup(board, "cho"), han: detectSetup(board, "han") };
  }, [playHistory]);

  const playerOf = useCallback(
    (side: Side) => {
      const me = openGame ? openGame.mySide : mySide;
      // 시계는 대국 탭에서만 보여준다. 지난 판에 남은 시간이 떠 있으면 아직 두는 판처럼 읽힌다.
      const timed = mode === "play" && clockSettings.enabled;
      return {
        side,
        name: me === side ? "나" : openGame ? openGame.levelName : level.name,
        kind: (me === side ? "human" : "engine") as "human" | "engine",
        score: side === "cho" ? scores.cho : scores.han,
        // 이 진영이 잡아낸 기물 = 상대가 잃은 기물
        captured: capturedPieces(position, side === "cho" ? "han" : "cho") as PieceType[],
        active: !showOver && position.turn === side,
        thinking: engineTurn && position.turn === side,
        clock: timed ? clocks[side] : null,
        settings: timed ? clockSettings : null,
        tag: sideTag(gstatus, shownOutcome, side),
        layout: (narrow ? "row" : "stacked") as "row" | "stacked",
      };
    },
    [
      openGame, mySide, level.name, scores, position, showOver, engineTurn, mode,
      clockSettings, clocks, gstatus, shownOutcome, narrow,
    ]
  );

  // 판이 규칙에 맞지 않을 때(불러온 기보가 이상할 때)만 헤더가 "잘못된 판" 을 건다.
  const problems = gstatus.kind === "invalid" && !listView && !Page ? gstatus.problems : null;

  // 눈으로는 대국자 카드와 헤더가 말하는 것을 화면 읽기 프로그램에 한 줄로 알린다.
  const spoken = listView || Page
    ? ""
    : shownOutcome
      ? outcomeMessage(shownOutcome)
      : (statusMessage(gstatus) ?? "");

  // --- 화면 -------------------------------------------------------------

  if (status !== "ready") {
    return <BootScreen failed={status === "error"} progress={progress} error={error} />;
  }

  const thinking = engineTurn && Boolean(snapshot?.running);

  /* 연 판의 머리 한 줄(목록으로·어떤 판인지·저장). 폰에서는 판 위로 올라간다. */
  const gameBar = openGame && (
    <GameBar game={openGame} busy={review.running} onClose={archive.close} onSave={archive.save} />
  );

  return (
    <div className={"app" + (Page ? " on-page" : "")}>
      <SideNav
        menu={MENU}
        mode={mode}
        onMode={goMode}
        onUpdates={() => setUpdatesOpen(true)}
        onNotice={() => setNoticeOpen(true)}
      />
      <AppHeader
        menu={MENU}
        mode={mode}
        onMode={goMode}
        problems={problems}
        spoken={spoken}
        onUpdates={() => setUpdatesOpen(true)}
        onNotice={() => setNoticeOpen(true)}
        loggedIn={server.loggedIn}
        loginPath={server.loginPath}
        busy={server.busy}
        onSignOut={server.signOut}
      />
      {/* 처음부터 있어야 새 말을 읽어 준다. 내용이 없어도 요소는 남겨 둔다. */}
      <p className="sr-only" role="status">
        {notice}
      </p>

      {Page ? (
        <main className="page">
          <Page />
        </main>
      ) : listView ? (
        <main className="layout list">
          <GameList
            rows={server.rows}
            now={Date.now()}
            onOpen={openArchived}
            onLoad={archive.load}
            page={archive.page}
            onPage={archive.setPage}
            error={archive.error}
            freshId={archive.freshId}
            server={server}
          />
        </main>
      ) : (
        <main className="layout">
          <section className="board-col">
            <div className="table" ref={tableRef}>
              {/*
                판 칸에는 판만 둔다. 판 크기가 남은 높이로 정해져서, 위아래에 무언가
                뜨고 지면 판이 줄었다 늘었다 한다. 폰은 오른쪽 칸이 판 아래로 내려가서
                대국자 카드를 판 위아래에 붙이고, 연 판의 머리 줄을 맨 위에 둔다(판은
                폰에서 폭으로 크기가 정해져 줄지 않는다).
              */}
              {narrow && gameBar}
              {narrow && <PlayerCard {...playerOf(topSide)} />}

              <div className="board-stage">
                <Board
                  board={position.board}
                  flipped={boardFlipped}
                  selected={selected}
                  targets={touch.targets}
                  lastMove={lastMove}
                  bestMove={bestArrow}
                  checkedKing={checkedKing}
                  onSquareClick={touch.onSquareClick}
                  onMove={touch.onMove}
                  onPick={touch.onSquareClick}
                  canPick={touch.canPick}
                  // 지금 보고 있는 국면이 방금 난 그 국면일 때만 난다. 두 탭 모두에서.
                  flyMove={fly && fly.ply === cursor ? fly : null}
                  callout={mode === "play" ? callouts.callout : null}
                />
              </div>

              {narrow && <PlayerCard {...playerOf(bottomSide)} />}
            </div>
          </section>

          <section className={"side-col" + (mode === "play" ? " play" : "")}>
            {!narrow && gameBar}

            {/* 상대가 위, 내가 아래 - 판과 같은 순서로 포갠다. */}
            {!narrow && (
              <div className="players">
                <PlayerCard {...playerOf(topSide)} />
                <PlayerCard {...playerOf(bottomSide)} />
              </div>
            )}

            <BoardControls
              mode={mode === "games" ? "games" : "play"}
              cursor={cursor}
              last={history.length - 1}
              canPass={canTouchBoard && touch.passSquare !== null}
              finished={mode === "play" && ended}
              onJump={goTo}
              onUndo={undoMove}
              onFlip={flip}
              onPass={touch.pass}
            />

            {mode === "play" && (
              <PlayPanel
                mySide={mySide}
                levelId={levelId}
                started={started}
                ended={ended}
                clockId={clockId}
                onClock={setClockId}
                variant={prefs.variant}
                onVariant={(v) => setPrefs((o) => ({ ...o, variant: v }))}
                thinking={thinking}
                onMySide={(s) => {
                  setMySide(s);
                  // 고른 쪽을 아래에 놓는다. 앉은 자리에서 보는 것이 기본이고,
                  // 뒤집어 보고 싶으면 판 뒤집기로 언제든 바꾼다.
                  setFlipped(s === "han");
                  playedFor.current = null;
                }}
                onLevel={setLevelId}
                setups={startSetups}
                onSetup={(side: Side, setup: Setup) =>
                  startFrom({ ...position, board: applySetup(position.board, side, setup) })
                }
                onNewGame={() => setAsking("new")}
                onResign={() => setAsking("resign")}
              />
            )}

            {/*
              형세가 위, 복기가 아래 - 지금 국면의 형세를 보고 그 수의 설명으로 들어간다.
              형세는 복기 전에는 그릴 것이 없어 뜨지 않는다. 수를 옮기는 것은 판 조작 줄이
              (이전·다음과 수 슬라이더로) 맡는다.
            */}
            {openGame && (
              <>
                <EvalGraph history={history} cursor={cursor} />
                <ReviewPanel
                  moveCount={openGame.history.length - 1}
                  depthId={reviewDepthId}
                  threads={engine?.singleThread ? 1 : prefs.threads}
                  onDepth={setReviewDepthId}
                  running={review.running}
                  progress={review.progress}
                  reviewed={reviewed}
                  mySide={openGame.mySide}
                  cursor={cursor}
                  error={review.error}
                  onStart={() => void startReview()}
                  onStop={review.stop}
                />
              </>
            )}
          </section>
        </main>
      )}

      {/*
        제보 버튼. 어느 탭에서나 같은 자리에 있다 - 사고는 어디서든 나고, 그때
        찾아 헤매게 하면 제보가 오지 않는다. 지금 보고 있는 판을 같이 담아 준다.
      */}
      <FeedbackButton
        detail={`${screen?.label ?? mode} · ${history.length - 1}수 · ${entry.fen}`}
      />

      {/* 결과 창은 대국 탭에서 판이 끝나는 순간에만 뜬다. 기보 탭에서 끝난 판을 열 때는 뜨지 않는다. */}
      {mode === "play" && resultOpen && outcome && (
        <GameOverDialog
          outcome={outcome}
          mySide={mySide}
          onReview={() => {
            setResultOpen(false);
            openArchived(gameId);
          }}
          onClose={() => setResultOpen(false)}
        />
      )}

      {updatesOpen && (
        <UpdatesDialog
          onClose={() => setUpdatesOpen(false)}
          onNotice={() => {
            setUpdatesOpen(false);
            setNoticeOpen(true);
          }}
        />
      )}
      {noticeOpen && <NoticeDialog onClose={() => setNoticeOpen(false)} />}

      {/* 새 대국은 언제 눌러도 묻는다. 무엇이 달라지는지 한 줄만 상황마다 다르게 적는다. */}
      {asking === "new" && (
        <ConfirmDialog
          title="새 대국을 시작할까요?"
          message={
            !started
              ? "판을 처음 모양으로 다시 놓습니다."
              : ended
                ? "끝난 판은 기보 목록에서 다시 볼 수 있습니다."
                : "두던 판은 사라집니다. 기보 목록에는 끝난 판만 남습니다."
          }
          confirmLabel="새 대국"
          onConfirm={() => {
            setAsking(null);
            newGame();
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {asking === "resign" && (
        <ConfirmDialog
          title="기권할까요?"
          message="이 판은 기권패로 끝납니다."
          confirmLabel="기권"
          danger
          onConfirm={() => {
            setAsking(null);
            resign();
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </div>
  );
}
