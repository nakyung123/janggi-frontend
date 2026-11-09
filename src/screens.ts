// 메뉴 목록 - 폰의 ☰ 메뉴와 넓은 화면의 왼쪽 메뉴가 같이 읽는다
//
// 새 화면을 더하려면 SCREENS 에 한 줄을 넣고, 화면 컴포넌트는 자기 폴더에 둔다.
//
//   { id: "pieces", group: "learn", label: "기물", Component: PiecesScreen },
//
// 메뉴 두 곳에 저절로 뜨고, 누르면 App 이 그 컴포넌트를 헤더 아래에 세운다. 대국과 기보는
// 엔진·두던 판·복기를 쥔 App 이 직접 그리므로 Component 가 없다.
//
// 컴포넌트는 App 이 쥔 기보 목록과 로그인·서버 상태를 props(ScreenProps)로 받는다. 쓰지 않는
// 화면은 받지 않는 것처럼 두면 된다(배우기 화면). 분석판은 App 이 쥔 분석판 상태도 받는다(PageProps).
//
// 만든 화면만 넣는다. 빈 화면이나 "준비 중" 을 띄우지 않는다. 항목이 없는 묶음은 메뉴에
// 뜨지 않는다.

import type { ComponentType } from "react";
import { AnalysisScreen } from "./components/analysis/AnalysisScreen";
import { CoordsScreen } from "./components/learn/CoordsScreen";
import { OpeningsScreen } from "./components/learn/OpeningsScreen";
import { ReadingsScreen } from "./components/learn/ReadingsScreen";
import { PiecesScreen } from "./components/learn/PiecesScreen";
import { RulesScreen } from "./components/learn/RulesScreen";
import { TermsScreen } from "./components/learn/TermsScreen";
import { DailyScreen } from "./components/mate/DailyScreen";
import { MateScreen } from "./components/mate/MateScreen";
import { TimedScreen } from "./components/mate/TimedScreen";
import { MistakesScreen } from "./components/mistakes/MistakesScreen";
import { StatsScreen } from "./components/record/StatsScreen";
import type { AnalysisBoard } from "./hooks/useAnalysisBoard";
import type { Mistakes } from "./hooks/useMistakes";
import type { ServerGames } from "./hooks/useServerGames";
import type { ArchivedGame } from "./janggi/archive";

/** 메뉴의 묶음. 이 순서로 선다. */
export const GROUPS = [
  { id: "play", label: "대국" },
  { id: "puzzle", label: "문제" },
  { id: "learn", label: "배우기" },
  { id: "practice", label: "연습" },
  { id: "record", label: "기록" },
] as const;

export type GroupId = (typeof GROUPS)[number]["id"];

/** 판을 띄우는 두 화면. App 이 직접 그린다. */
export type BoardMode = "play" | "games";

/**
 * 메뉴 화면이 App 에게서 받는 것. 이 기기의 기보 목록과 로그인·서버 상태는 App 이 하나씩만
 * 쥔다 - 화면이 따로 만들면 같은 판을 두 번 올리거나 목록이 둘로 갈라진다.
 */
export interface ScreenProps {
  games: ArchivedGame[];
  server: ServerGames;
}

/**
 * App 이 메뉴 화면에 넘기는 것 전부. ScreenProps 에 엔진을 쓰는 화면의 상태를 더한 것이다 - 엔진은
 * App 하나가 돌리므로 App 이 훅(useAnalysisBoard, useMistakes)을 쥐고 넘긴다. 그 화면 말고는 쓰지 않는다.
 *
 * ScreenProps 에 바로 넣지 않은 까닭: ScreenProps 를 통째로 받는 화면(내 전적)의 시험이 그 모양으로
 * props 를 만들어 넘긴다. 칸이 늘면 쓰지도 않는 분석판 상태를 시험마다 지어 넣어야 한다.
 */
export interface PageProps extends ScreenProps {
  analysis: AnalysisBoard;
  /** 내 실수 문제의 상태. 둘 수 있는 수와 판정에 엔진을 써서 App 이 쥔다(분석판과 같은 까닭). */
  mistakes: Mistakes;
}

export type Screen =
  | { id: BoardMode; group: GroupId; label: string }
  | { id: string; group: GroupId; label: string; Component: ComponentType<PageProps> };

const list = [
  { id: "play", group: "play", label: "대국" },
  { id: "mate", group: "puzzle", label: "외통 문제", Component: MateScreen },
  { id: "daily", group: "puzzle", label: "오늘의 문제", Component: DailyScreen },
  { id: "timed", group: "puzzle", label: "시간 도전", Component: TimedScreen },
  { id: "mistakes", group: "puzzle", label: "내 실수 문제", Component: MistakesScreen },
  { id: "pieces", group: "learn", label: "기물", Component: PiecesScreen },
  { id: "rules", group: "learn", label: "규칙", Component: RulesScreen },
  { id: "terms", group: "learn", label: "용어", Component: TermsScreen },
  { id: "coords", group: "learn", label: "좌표", Component: CoordsScreen },
  { id: "openings", group: "learn", label: "포진", Component: OpeningsScreen },
  { id: "readings", group: "learn", label: "읽을거리", Component: ReadingsScreen },
  { id: "analysis", group: "practice", label: "분석판", Component: AnalysisScreen },
  { id: "games", group: "record", label: "기보" },
  { id: "stats", group: "record", label: "내 전적", Component: StatsScreen },
] as const satisfies readonly Screen[];

export const SCREENS: readonly Screen[] = list;

export type ScreenId = (typeof list)[number]["id"];

/**
 * 메뉴에 그릴 모양. heading 이 null 이면 묶음 이름 없이 항목만 선다 - 항목이 하나뿐인
 * 묶음에 이름을 달면 "대국 / 대국" 처럼 같은 말이 두 번 선다.
 */
export interface MenuGroup {
  heading: string | null;
  items: { id: ScreenId; label: string }[];
}

export function menuOf(screens: readonly Screen[]): MenuGroup[] {
  return GROUPS.flatMap((g) => {
    const items = screens
      .filter((s) => s.group === g.id)
      .map((s) => ({ id: s.id as ScreenId, label: s.label }));
    if (items.length === 0) return [];
    return [{ heading: items.length > 1 ? g.label : null, items }];
  });
}
