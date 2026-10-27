// 메뉴 목록 - 폰의 ☰ 메뉴와 넓은 화면의 왼쪽 메뉴가 같이 읽는다
//
// 새 화면을 더하려면 SCREENS 에 한 줄을 넣고, 화면 컴포넌트는 자기 폴더에 둔다.
//
//   { id: "pieces", group: "learn", label: "기물", Component: PiecesScreen },
//
// 메뉴 두 곳에 저절로 뜨고, 누르면 App 이 그 컴포넌트를 헤더 아래에 세운다. 대국과 기보는
// 엔진·두던 판·복기를 쥔 App 이 직접 그리므로 Component 가 없다.
//
// 만든 화면만 넣는다. 빈 화면이나 "준비 중" 을 띄우지 않는다. 항목이 없는 묶음은 메뉴에
// 뜨지 않는다.

import type { ComponentType } from "react";

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

export type Screen =
  | { id: BoardMode; group: GroupId; label: string }
  | { id: string; group: GroupId; label: string; Component: ComponentType };

const list = [
  { id: "play", group: "play", label: "대국" },
  { id: "games", group: "record", label: "기보" },
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
