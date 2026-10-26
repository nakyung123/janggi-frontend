// 로딩 화면 — 엔진과 신경망을 내려받는 동안, 또는 엔진을 띄우지 못했을 때
//
// 엔진이 준비되기 전에는 판을 그리지 않는다. 합법수·장군을 엔진이 알려 줘야 둘 수
// 있어서, 판이 먼저 떠도 누를 수 있는 것이 없다.

import type { LoadProgress } from "../../engine/types";
import {
  FeedbackButton,
  browserLabel,
  inAppLabel,
  outsideBrowserLink,
  systemLabel,
} from "../../report/feedback";

interface Props {
  /** true 면 까닭(error)을 보여주고, 아니면 내려받는 진행률을 보여준다. */
  failed: boolean;
  progress: LoadProgress | null;
  error: string | null;
}

/**
 * 못 띄운 브라우저가 어떤 브라우저였는지 한 줄.
 *
 *   크롬 154 · 안드로이드 · 격리 안 됨 · 코어 8 · 메모리 4GB
 *
 * **왜 담나** — 2026-10-08 첫 장애 제보가 "모바일 안되는거에용?" 한 줄이었다. 기기가
 * 무엇인지조차 몰라서 사흘을 짐작으로 보냈다. 이 줄이 있으면 다음 사람은 캡처 한 장으로
 * 끝난다.
 *
 * 무엇을 담는지가 중요하다. **앱 안에서 열었는지**는 안드로이드 앱 안 브라우저가 모두
 * 실패하던 2026-10 에 원인을 가린 단서였다. 격리 여부는 어느 엔진을 띄우려 했는지
 * 알려 준다(격리가 안 되면 단일 스레드 엔진, engine.ts 의 create).
 * 코어 수와 기기 메모리는 **1순위 용의자인 메모리 부족**을 가리기 위한 것이다(우리는
 * 코어 수로 스레드를 최대 4까지 올린다 - App.tsx). deviceMemory 는 크로미움 계열에만
 * 있어서 없으면 뺀다 - 없다는 것 자체도 단서다.
 */
function diagnosis(): string {
  const ua = navigator.userAgent;
  // deviceMemory 는 표준이 아니라 타입에 없다.
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return [
    browserLabel(ua),
    systemLabel(ua),
    // 앱 안에서 열었을 때만 붙는다. 없으면 한 칸도 안 쓴다.
    inAppLabel(ua),
    crossOriginIsolated ? "격리됨" : "격리 안 됨",
    `코어 ${navigator.hardwareConcurrency || "?"}`,
    mem ? `메모리 ${mem}GB` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function BootScreen({ failed, progress, error }: Props) {
  if (failed) {
    const diag = diagnosis();
    const outside = outsideBrowserLink(navigator.userAgent, window.location.href);
    return (
      <div className="boot">
        <h1>장기 AI</h1>
        <div className="boot-error">
          {/*
            **무엇이** 안 됐는지는 늘 여기서 말한다.

            한동안 engine.ts 가 보낸 글만 띄웠다. 한글이 없는 오류는 errors.ts 가 "알 수
            없는 오류입니다. (E-7F3A)" 로 바꿔 보내므로 **무엇이 안 됐는지가 통째로
            사라졌다.** 메모리 부족이 그 경로로 온다.
          */}
          <p>장기판을 띄우지 못했습니다.</p>
          {/* 까닭은 engine.ts 와 errors.ts 가 사람 말로 바꿔 보낸다. 여기서 다시 풀지 않는다. */}
          {error && <p className="muted small">{error}</p>}
          {/*
            진단 줄. 읽으라고 두는 것이 아니라 **옮겨 적으라고** 두는 것이라 네모 안에
            고정폭으로 둔다(ErrorBoundary 의 오류 코드와 같은 자리). 붉은색은 쓰지
            않는다 - 고장이 아니라 사실이다.
          */}
          <pre className="boot-diag">{diag}</pre>
          <p className="muted small">
            그래도 안 되면 아래로 알려 주세요 - 위 한 줄이 이미 적혀 있습니다.
          </p>
          <div className="boot-actions">
            {/*
              안드로이드 앱 안 브라우저에서만 선다. 거기서는 다시 시도해도 안 뜨므로 이것이
              할 일이고, 그래서 채운 버튼이다. 쪽 전체가 다른 앱으로 넘어가므로 링크다.
            */}
            {outside && (
              <a className="boot-outside" href={outside.href}>
                {outside.label}
              </a>
            )}
            <button type="button" onClick={() => window.location.reload()}>
              다시 시도
            </button>
          </div>
        </div>
        {/*
          실패 화면에도 제보 창구를 둔다.
          App.tsx 가 이 화면을 먼저 반환해 버려서 **엔진을 못 띄운 사람에게는 제보 버튼이
          아예 보이지 않았다.** 가장 제보가 필요한 사람이 창구를 못 본 셈이고, 그래서 그
          사람들은 디시에 댓글을 달았다.
        */}
        <FeedbackButton detail={`엔진 못 띄움 · ${diag}`} />
      </div>
    );
  }

  return (
    <div className="boot">
      <h1>장기 AI</h1>
      <p className="muted">
        {progress?.stage ?? "엔진"} 준비 중…
        {progress && progress.total > 0 && (
          <>
            {" "}
            {(progress.loaded / 1e6).toFixed(1)} / {(progress.total / 1e6).toFixed(1)} MB
          </>
        )}
      </p>
      <div className="boot-bar">
        <div
          style={{
            // 전체 크기를 모르면(서버가 길이를 안 알려 주면) 30% 에 세워 둔다.
            width:
              progress && progress.total ? `${(progress.loaded / progress.total) * 100}%` : "30%",
          }}
        />
      </div>
      <p className="muted small">
        Fairy-Stockfish 엔진과 11MB 장기 신경망을 내려받는 중입니다. 처음 한 번만 받고
        이후에는 브라우저가 캐시합니다.
      </p>
    </div>
  );
}
