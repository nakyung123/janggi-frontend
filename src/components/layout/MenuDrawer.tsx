// 메뉴 칸 - 폰의 ☰ 를 누르면 왼쪽에서 나온다
//
//   대국 · 기보            지금 탭과 같은 일을 한다
//   업데이트 내역 · 고지 · 개인정보처리방침
//
// 폭 900 이하에서만 쓴다. 넓은 화면은 헤더에 탭과 업데이트 내역이 그대로 있다.
// 폰 헤더에 앱 이름 · 탭 · 업데이트 내역 · 로그인이 다 서려면 320 폭에서 자리가
// 모자란다. 그래서 자주 바꾸지 않는 것을 여기로 모으고, 헤더 오른쪽은 로그인에 준다.
//
// 항목을 누르면 그 일을 하고 닫힌다. 탭을 옮기는 일은 헤더의 탭과 같은 함수를 부르므로
// 복기가 도는 동안 탭을 못 옮기는 규칙도 그대로 따른다.

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import type { Mode } from "./ModeTabs";

interface Props {
  mode: Mode;
  onMode: (mode: Mode) => void;
  onUpdates: () => void;
  onNotice: () => void;
  onClose: () => void;
}

const MODES: { id: Mode; label: string }[] = [
  { id: "play", label: "대국" },
  { id: "games", label: "기보" },
];

export function MenuDrawer({ mode, onMode, onUpdates, onNotice, onClose }: Props) {
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
  const then = (run: () => void) => () => {
    onClose();
    run();
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

        <nav className="drawer-modes" aria-label="모드">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={"drawer-item" + (mode === m.id ? " active" : "")}
              aria-current={mode === m.id ? "page" : undefined}
              onClick={then(() => onMode(m.id))}
            >
              {m.label}
            </button>
          ))}
        </nav>

        <div className="drawer-more">
          <button type="button" className="drawer-sub" onClick={then(onUpdates)}>
            업데이트 내역
          </button>
          <button type="button" className="drawer-sub" onClick={then(onNotice)}>
            고지
          </button>
          {/* 새 탭으로 연다. 같은 탭으로 가면 두던 판을 떠나게 된다(기보 탭의 링크와 같다). */}
          <a
            className="drawer-sub"
            href="/privacy/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
          >
            개인정보처리방침
          </a>
        </div>
      </div>
    </div>
  );
}
