// 헤더 한 줄
//
//   넓은 화면   앱 이름 · 모드 탭 ········ 판 상태 · 업데이트 내역
//   900 이하    ☰ · 앱 이름 ················ 판 상태 · 로그인
//
// 폰에서는 탭과 업데이트 내역을 ☰ 메뉴(MenuDrawer)로 옮기고 오른쪽 끝을 로그인에 준다.
// 320 폭에 넷이 다 서지 않는다. 두 모양은 같은 요소를 CSS 로 숨기고 보여서 바꾼다
// (layout.css 의 900 이하 규칙).
//
// 높이가 늘 모드 탭과 같은 40(터치 44)이다. 이 앱은 남는 세로가 곧 판 크기라,
// 헤더에 무엇이 뜨고 져도 줄 높이는 바뀌지 않아야 한다.
//
// 둘 차례·생각 중은 여기서 말하지 않는다. 대국자 카드가 이미 말한다. 헤더에는 판이
// 규칙에 맞지 않을 때(불러온 기보가 이상할 때)만 짧게 "잘못된 판" 을 건다. 360 폰에서
// 앱 이름·탭과 오른쪽 끝 사이에 남는 자리가 105 라 그보다 긴 말은 두 줄로 떨어진다.
//
// 소리 버튼은 뺐다. 켜고 끄고 싶다는 말이 실제로 나오면 그때 두면 된다 - 아직 아무도
// 쓰지 않는 앱에서 헤더 한 칸은 비싸다.

import { useRef, useState } from "react";
import { Menu } from "lucide-react";

import { LOGIN_PATH } from "../../server/api";
import { MenuDrawer } from "./MenuDrawer";
import { ModeTabs } from "./ModeTabs";
import type { Mode } from "./ModeTabs";

interface Props {
  mode: Mode;
  onMode: (mode: Mode) => void;
  /** 판이 규칙에 맞지 않는 까닭들. 있으면 "잘못된 판" 을 건다. 까닭은 화면 읽기 줄(spoken)이 말한다. */
  problems: string[] | null;
  /** 화면 읽기 프로그램에 한 줄로 알릴 판 상태(장군·결과·잘못된 판) */
  spoken: string;
  /** 업데이트 내역 창을 연다 */
  onUpdates: () => void;
  /** 고지 창을 연다 */
  onNotice: () => void;
  /** 로그인 상태. null 은 아직 확인하는 중이다. */
  loggedIn: boolean | null;
  /** 서버와 주고받는 중이면 로그아웃을 잠근다(기보 탭의 로그아웃과 같다). */
  busy: boolean;
  onSignOut: () => void;
}

export function AppHeader({
  mode,
  onMode,
  problems,
  spoken,
  onUpdates,
  onNotice,
  loggedIn,
  busy,
  onSignOut,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  // 메뉴를 닫으면 ☰ 로 초점을 돌린다. 키보드로 쓰는 사람이 쪽 맨 처음으로 튕기지 않게.
  const closeMenu = () => {
    setMenuOpen(false);
    menuRef.current?.focus();
  };

  return (
    <header className="top">
      <button
        ref={menuRef}
        type="button"
        className="ghost top-menu"
        aria-label="메뉴 열기"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
      >
        <Menu size={20} strokeWidth={2} aria-hidden="true" />
      </button>
      <h1>장기 AI</h1>
      <ModeTabs mode={mode} onMode={onMode} />

      <div className="top-end">
        {problems && (
          <span className="turn-tag">잘못된 판</span>
        )}
        {/*
          그 자리에서 창을 연다. 한동안 따로 선 쪽(/updates/)을 새 탭으로 열었는데,
          몇 줄 읽고 닫을 글 때문에 두던 화면을 떠나야 했다. 지금 버전은 창 안에 적혀 있다.
        */}
        <button type="button" className="ver" onClick={onUpdates}>
          업데이트 내역
        </button>
        {/*
          폰에서만 보인다. 확인하는 중에는 아무것도 세우지 않는다 - 로그인을 띄웠다가
          로그아웃으로 바꾸면 이미 로그인한 사람에게 잘못된 말을 한 번 한 셈이 된다.
          로그인은 단추가 아니라 링크다. 구글 동의 화면을 사람이 봐야 해서 쪽 전체가 옮겨간다.
          탈퇴는 여기 두지 않는다. 되돌리기 어려워 보이는 일이라 기보 탭에서 한 번 더 묻는다.
        */}
        {loggedIn === false && (
          <a className="top-login" href={LOGIN_PATH}>
            로그인
          </a>
        )}
        {loggedIn === true && (
          <button type="button" className="ghost top-logout" onClick={onSignOut} disabled={busy}>
            로그아웃
          </button>
        )}
      </div>

      <p className="sr-only" role="status">
        {spoken}
      </p>

      {menuOpen && (
        <MenuDrawer
          mode={mode}
          onMode={onMode}
          onUpdates={onUpdates}
          onNotice={onNotice}
          onClose={closeMenu}
        />
      )}
    </header>
  );
}
