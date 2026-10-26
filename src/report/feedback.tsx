// 제보 창구 — 누르면 미리 채워진 구글 폼이 열린다
//
// 한동안 App.tsx 바닥에 있었다. 오류 장부(errors.ts)가 생기면서 제보에 붙는 글이
// 거기서 한 줄을 가져오게 돼, 둘을 같은 폴더에 둔다.

import { APP_VERSION } from "../updates/log";
import { troubleLine } from "./errors";

/*
 * 아직 열지 않았으면(값이 비어 있으면) 버튼을 아예 그리지 않는다 -
 * 눌러도 갈 데가 없는 버튼을 두지 않는다. 값의 이름은 .env.example 에 있다.
 */
const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL ?? "";
/** 폼의 받는 칸 이름표(entry.NNN). 있으면 그 칸을 미리 채워서 연다. */
const FEEDBACK_ENTRY = import.meta.env.VITE_FEEDBACK_ENTRY ?? "";

/*
 * 브라우저와 운영체제를 짧은 말로 옮긴다.
 *
 * 긴 userAgent 를 그대로 적으면 보내는 사람이 그 덩어리를 보게 된다 - 자기가 적은 말보다
 * 긴 알 수 없는 글이 폼에 들어 있으면 지우거나, 보내기를 그만둔다. 필요한 것은 "크롬
 * 154 · 윈도우" 한 토막이다.
 *
 * 차례가 중요하다. 엣지·웨일·삼성 인터넷은 userAgent 에 Chrome 을 같이 적고, 크롬도
 * Safari 를 같이 적는다. 좁은 것부터 본다.
 */
const BROWSERS: [RegExp, string][] = [
  [/Edg\/(\d+)/, "엣지"],
  [/OPR\/(\d+)/, "오페라"],
  [/Whale\/(\d+)/, "웨일"],
  [/SamsungBrowser\/(\d+)/, "삼성 인터넷"],
  [/Firefox\/(\d+)/, "파이어폭스"],
  [/Chrome\/(\d+)/, "크롬"],
  [/Version\/(\d+)[\d.]*\s+(?:Mobile\/\S+\s+)?Safari/, "사파리"],
  /*
   * 아이폰 앱 안의 브라우저는 **Safari 토큰을 빼고** 자기 이름을 붙인다.
   *
   *   ... Version/17.5 Mobile/15E148 KAKAOTALK 10.5.0
   *
   * 위 줄이 Safari 로 끝나기를 요구하므로 여기에 안 걸리고, 그러면 아래의 "모르는
   * 브라우저는 그대로" 규칙에 떨어져 **UA 원문 180자가 통째로** 들어갔다. 진단 줄은
   * 320 폰에서 한 줄이어야 하는데 그것만으로 화면을 덮었다. 측정을 붙여 보고 알았다.
   */
  [/Version\/(\d+)[\d.]*\s+Mobile\//, "사파리"],
];

const SYSTEMS: [RegExp, string][] = [
  [/Windows/, "윈도우"],
  [/iPhone/, "아이폰"],
  [/iPad/, "아이패드"],
  [/Android/, "안드로이드"],
  [/Mac OS X/, "맥"],
  [/Linux/, "리눅스"],
];

export function browserLabel(ua: string): string {
  for (const [re, name] of BROWSERS) {
    const m = re.exec(ua);
    if (m) return `${name} ${m[1]}`;
  }
  // 모르는 브라우저는 그대로 보낸다. 드물고, 드물 때가 제일 궁금하다.
  return ua;
}

export function systemLabel(ua: string): string | null {
  for (const [re, name] of SYSTEMS) if (re.test(ua)) return name;
  return null;
}

/*
 * 앱 안에서 열었는가.
 *
 * **왜 필요한가** - 실패 화면이 "카카오톡·디시 같은 앱 안에서 열면 이럴 수 있어요" 라고
 * 말하면서, 정작 그것을 확인할 수단이 없었다. 위의 BROWSERS 표는 이들을 그냥 "크롬" 으로
 * 적는다 - 인앱 브라우저도 UA 에 Chrome 을 같이 적기 때문이다. 유입이 디시 글이었으니
 * **가장 유력한 경로가 바로 안 보이던 자리**다.
 *
 * `; wv)` 는 안드로이드 웹뷰 공통 표시다. 이름을 안 붙이는 앱(디시 등)이 여기 걸린다.
 * 그래서 맨 뒤에 둔다 - 이름이 있는 쪽을 먼저 본다.
 *
 * **한계** - 아이폰의 이름 없는 웹뷰는 못 가려낸다. UA 가 사파리와 거의 같다. 이름을
 * 붙이는 앱(카카오톡·네이버 등)은 아이폰에서도 잡힌다.
 */
const IN_APP: [RegExp, string][] = [
  [/KAKAOTALK/i, "카카오톡"],
  [/NAVER\(inapp/i, "네이버앱"],
  [/Instagram/i, "인스타그램"],
  [/FBAN|FBAV/, "페이스북"],
  [/Line\//, "라인"],
  [/DaumApps/i, "다음앱"],
  [/; wv\)/, "앱 안 브라우저"],
];

/** 앱 안에서 열었으면 그 앱 이름. 아니면 null. */
export function inAppLabel(ua: string): string | null {
  for (const [re, name] of IN_APP) if (re.test(ua)) return name;
  return null;
}

/**
 * 안드로이드 앱 안 브라우저에서 같은 주소를 바깥 브라우저로 여는 링크. 아니면 null.
 *
 * **왜 두나** - 안드로이드 웹뷰는 COOP/COEP 를 보내도 교차 출처 격리가 되지 않는다
 * (크로미움 버그 40914606). 그래서 엔진이 못 뜬다. 2026-10-20~26 에 네이버앱 4명,
 * 카카오톡 1명이 들어와 전원 실패했다. 메뉴를 찾아 "다른 브라우저로 열기" 를 누르라는
 * 글만으로는 대부분 그냥 나갔다.
 *
 * - 카카오톡은 `kakaotalk://web/openExternal` 로 바깥 브라우저를 연다. 공식 기능이
 *   아니라 카카오톡이 바꾸면 안 될 수 있다.
 * - 나머지는 안드로이드에 크롬으로 열라고 요청한다(`intent://`). 크롬이 없으면 아무 일도
 *   없다. 대체 주소(browser_fallback_url)는 지금 그 앱 안에서 열려 같은 화면으로 돌아오므로
 *   넣지 않았다. 화면의 안내 글이 남아 있어 그때는 그것을 따른다.
 *
 * 아이폰은 넣지 않았다. 실패한 기록이 없고, 앱 안에서 사파리를 여는 길도 다르다.
 */
export function outsideBrowserLink(
  ua: string,
  href: string
): { href: string; label: string } | null {
  if (!/Android/i.test(ua) || !inAppLabel(ua)) return null;
  if (/KAKAOTALK/i.test(ua)) {
    return {
      href: "kakaotalk://web/openExternal?url=" + encodeURIComponent(href),
      label: "다른 브라우저로 열기",
    };
  }
  const url = new URL(href);
  const scheme = url.protocol.replace(":", "");
  return {
    href: `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;end`,
    label: "크롬으로 열기",
  };
}

/**
 * 제보에 같이 붙일 것. 두 줄, 터진 적이 있으면 세 줄이다.
 *
 *   장기 AI v0.1.0 · 크롬 154 · 윈도우 · 창 1440×900
 *   기보 · 42수 · rnba1abnr/4k4/...
 *   마지막 오류: E-7F3A 기보 불러오기 (2분 전)
 *
 * "말이 안 움직여요" 만 오면 아무것도 못 한다. 어느 버전인지, 어떤 브라우저인지,
 * 어떤 판이었는지를 매번 되물어야 하는데 - 제보는 몇 건 안 오고 되물으면 절반은
 * 답이 오지 않는다. 그래서 적되, **읽는 사람이 겁먹지 않을 만큼만** 적는다.
 *
 * 셋째 줄은 터진 적이 있을 때만 붙는다. 이 한 줄이 "안 돼요" 를 자리로 바꾼다.
 *
 * @param sep 줄을 잇는 글자. 폼의 받는 칸이 **장문형이어야** 줄바꿈이 남는다.
 *   단답형이면 줄바꿈이 지워져 붙어 버리므로 가운뎃점(" · ")으로 넘긴다.
 */
export function reportInfo(detail: string, sep = "\n"): string {
  const ua = navigator.userAgent;
  const 자리 = [
    `장기 AI v${APP_VERSION}`,
    browserLabel(ua),
    systemLabel(ua),
    `창 ${window.innerWidth}×${window.innerHeight}`,
  ].filter(Boolean);
  return [자리.join(" · "), detail, troubleLine()].filter(Boolean).join(sep);
}

/**
 * 누르면 열릴 주소. 이름표가 있으면 받는 칸을 미리 채운 폼이다.
 *
 * 구글 폼은 주소 뒤에 `?usp=pp_url&entry.NNN=값` 을 붙이면 그 칸이 채워진 채로 열린다.
 * 붙여넣기를 시키면 절반은 그냥 비워 둔 채 보낸다 - 보내는 사람에게 할 일을 하나라도
 * 덜 주는 쪽이 받는 쪽에 이롭다.
 */
export function feedbackLink(detail: string): string {
  if (!FEEDBACK_ENTRY) return FEEDBACK_URL;
  const sep = FEEDBACK_URL.includes("?") ? "&" : "?";
  // 받는 칸이 장문형이라 줄바꿈이 그대로 남는다(단답형이었을 때는 줄이 뭉개져 붙었다).
  const info = encodeURIComponent(reportInfo(detail));
  return `${FEEDBACK_URL}${sep}usp=pp_url&${FEEDBACK_ENTRY}=${info}`;
}

/** 창구가 열려 있는지. 버튼을 그릴지 말지 가른다. */
export const hasFeedback = Boolean(FEEDBACK_URL);

/**
 * 제보 버튼.
 *
 * 화면 오른쪽 아래에 떠 있다. DESIGN.md 는 떠 있는 것을 두지 않기로 했는데(오른쪽
 * 칸의 무언가를 가렸다) 이것만 예외다 - 까닭은 docs/DECISIONS.md 에 적었다.
 * 가리지 않도록 오른쪽 칸과 목록 칸 아래에 이 버튼 높이만큼 여백을 둔다.
 *
 * 누르면 제보 창구를 새 탭으로 연다. 폼의 칸 이름표(VITE_FEEDBACK_ENTRY)가 있으면
 * 버전·브라우저·보던 판·마지막 오류가 이미 적힌 채로 열리고, 없으면 빈 폼이 열린다.
 *
 * 한동안 이름표가 없을 때 그 정보를 클립보드에 담아 줬다. 뺐다 - 폼에 받을 칸이 없으면
 * 붙여넣을 데도 없어서 담아 봐야 쓰이지 않고, 담았다고 알리려고 버튼 글자가 바뀌면
 * 떠 있는 버튼의 폭이 그때마다 달라진다.
 */
export function FeedbackButton({ detail }: { detail: string }) {
  if (!hasFeedback) return null;

  return (
    /*
     * 버그만 받는 창구가 아니다.
     *
     * 한동안 `버그 제보`(91)로 짧게 뒀다 - 넓을수록 많이 가려서다. 그런데 그 글자는
     * 받을 것을 좁힌다. "이건 버그는 아닌데" 싶은 말은 보내지 않게 되고, 쓰는 사람이
     * 바라는 것은 대개 버그가 아니라 그쪽이다. 가려지는 것은 Known Gaps 에 적었다.
     */
    /*
     * 버튼이 아니라 링크다.
     *
     * 예전에는 <button> 에서 window.open 을 불렀는데, 팝업 차단기가 막으면 window.open 이
     * null 을 돌려주고 조용히 끝난다. 우리는 그 값을 보지 않았으므로 **눌러도 아무 일도
     * 일어나지 않았다** - 실제로 그런 제보를 받았고 WebKit 으로 재현했다. 차단기는
     * 스크립트가 여는 창을 막지, 사람이 누른 링크는 막지 않는다. 애초에 팝업이 아니게 둔다.
     *
     * 생김새는 .feedback-fab 이 그대로 맡는다(base.css 의 button 규칙이 주던 테두리와
     * 가운데 정렬을 그쪽에 직접 적어 두었다).
     */
    <a
      className="feedback-fab"
      href={feedbackLink(detail)}
      target="_blank"
      rel="noopener noreferrer"
    >
      피드백 및 버그 제보
    </a>
  );
}
