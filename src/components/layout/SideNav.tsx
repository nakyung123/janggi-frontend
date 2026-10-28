// 왼쪽 메뉴 - 넓은 화면(900 초과)에서 화면 왼쪽에 늘 서 있다
//
//   장기 AI
//   대국 · 기보                메뉴 목록(src/screens.ts)
//   ──────
//   업데이트 내역 · 고지 · 개인정보처리방침
//
// 내용은 폰의 ☰ 메뉴와 같은 것(MenuBody)을 쓴다. 폭 900 이하에서는 CSS 가 숨기고 ☰ 가 연다
// (layout.css 의 왼쪽 메뉴). 사용자가 2026-10-27 에 chess.com 처럼 왼쪽에 늘 서 있는 메뉴를 골랐다.

import { MenuBody } from "./MenuDrawer";
import type { MenuGroup, ScreenId } from "../../screens";

interface Props {
  menu: MenuGroup[];
  mode: ScreenId;
  onMode: (mode: ScreenId) => void;
  onUpdates: () => void;
  onNotice: () => void;
}

export function SideNav(props: Props) {
  return (
    <aside className="side-nav" aria-label="왼쪽 메뉴">
      <p className="side-name">장기 AI</p>
      <MenuBody {...props} />
    </aside>
  );
}
