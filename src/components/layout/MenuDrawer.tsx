// 메뉴 칸 - 폰의 ☰ 를 누르면 왼쪽에서 나온다
//
//   대국 · 기보            메뉴 목록(src/screens.ts)에 있는 화면
//   업데이트 내역 · 고지 · 개인정보처리방침
//
// 폭 900 이하에서만 쓴다. 넓은 화면은 같은 내용(MenuBody)이 왼쪽 메뉴(SideNav.tsx)에 늘 서 있다.
// 폰 헤더에 앱 이름 · 탭 · 업데이트 내역 · 로그인이 다 서려면 320 폭에서 자리가
// 모자란다. 그래서 자주 바꾸지 않는 것을 여기로 모으고, 헤더 오른쪽은 로그인에 준다.
//
// 항목을 누르면 그 일을 하고 닫힌다. 화면을 옮기는 일은 왼쪽 메뉴와 같은 함수를 부르므로
// 복기가 도는 동안 화면을 못 옮기는 규칙도 그대로 따른다.

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import type { MenuGroup, ScreenId } from "../../screens";

interface BodyProps {
  menu: MenuGroup[];
  mode: ScreenId;
  onMode: (mode: ScreenId) => void;
  onUpdates: () => void;
  onNotice: () => void;
  /** 개인정보처리방침을 누른 뒤(새 탭으로 열린다). 메뉴 칸은 이때 닫는다. */
  onPrivacy?: () => void;
}

/**
 * 메뉴의 내용. 폰 메뉴 칸과 넓은 화면의 왼쪽 메뉴가 이것 하나를 같이 쓴다 - 둘이 각자
 * 목록을 들고 있으면 한쪽에만 화면을 더하는 일이 생긴다.
 *
 * 항목이 하나뿐인 묶음은 이름 없이 항목만 선다(screens.ts 의 menuOf).
 */
export function MenuBody({ menu, mode, onMode, onUpdates, onNotice, onPrivacy }: BodyProps) {
  return (
    <>
      <nav className="menu-modes" aria-label="모드">
        {menu.map((group) => (
          <div
            key={group.heading ?? group.items[0].id}
            className={"menu-group" + (group.heading ? " named" : "")}
          >
            {group.heading && <p className="menu-heading">{group.heading}</p>}
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  "menu-item" + (group.heading ? " sub" : "") + (mode === item.id ? " active" : "")
                }
                aria-current={mode === item.id ? "page" : undefined}
                onClick={() => onMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="menu-more">
        <button type="button" className="menu-sub" onClick={onUpdates}>
          업데이트 내역
        </button>
        <button type="button" className="menu-sub" onClick={onNotice}>
          고지
        </button>
        {/* 새 탭으로 연다. 같은 탭으로 가면 두던 판을 떠나게 된다(기보 탭의 링크와 같다). */}
        <a
          className="menu-sub"
          href="/privacy/"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onPrivacy}
        >
          개인정보처리방침
        </a>
      </div>
    </>
  );
}

interface Props extends Omit<BodyProps, "onPrivacy"> {
  onClose: () => void;
}

export function MenuDrawer({ menu, mode, onMode, onUpdates, onNotice, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Esc 로 닫는다(가운데 창들과 같다).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** 그 일을 하고 닫는다. */
  const then =
    <A extends unknown[]>(run: (...args: A) => void) =>
    (...args: A) => {
      onClose();
      run(...args);
    };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="메뉴"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <button
            ref={closeRef}
            type="button"
            className="ghost drawer-close"
            aria-label="메뉴 닫기"
            onClick={onClose}
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="drawer-name">장기 AI</span>
        </div>

        <MenuBody
          menu={menu}
          mode={mode}
          onMode={then(onMode)}
          onUpdates={then(onUpdates)}
          onNotice={then(onNotice)}
          onPrivacy={onClose}
        />
      </div>
    </div>
  );
}
