// 안드로이드 앱 안 브라우저에서 바깥 브라우저로 넘기는 링크
//
// 안드로이드 웹뷰는 교차 출처 격리가 되지 않아 엔진이 못 뜬다. 엔진이 못 뜬 화면에
// 바깥 브라우저로 여는 버튼을 두는데, 어느 기기에 무엇을 거는지가 이 표다.
// 사용자 에이전트는 실제 기기의 모양을 따랐다.

import { describe, expect, it } from "vitest";
import { outsideBrowserLink } from "./feedback";

const SITE = "https://janggi-ai.vercel.app/?ref=x";

const UA = {
  카카오톡안드로이드:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.0.0 Mobile Safari/537.36;KAKAOTALK 2511000",
  네이버앱안드로이드:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.10.5)",
  크롬안드로이드:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36",
  카카오톡아이폰:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.11.0",
};

describe("바깥 브라우저로 넘기는 링크", () => {
  it("안드로이드 카카오톡은 카카오톡의 바깥 브라우저 열기로 같은 주소를 넘긴다", () => {
    expect(outsideBrowserLink(UA.카카오톡안드로이드, SITE)).toEqual({
      href: "kakaotalk://web/openExternal?url=https%3A%2F%2Fjanggi-ai.vercel.app%2F%3Fref%3Dx",
      label: "다른 브라우저로 열기",
    });
  });

  it("안드로이드 네이버앱은 같은 주소를 크롬으로 연다", () => {
    expect(outsideBrowserLink(UA.네이버앱안드로이드, SITE)).toEqual({
      href: "intent://janggi-ai.vercel.app/?ref=x#Intent;scheme=https;package=com.android.chrome;end",
      label: "크롬으로 열기",
    });
  });

  it("안드로이드 크롬 자체에서는 넘길 곳이 없다", () => {
    expect(outsideBrowserLink(UA.크롬안드로이드, SITE)).toBeNull();
  });

  it("아이폰 카카오톡은 넣지 않았다", () => {
    expect(outsideBrowserLink(UA.카카오톡아이폰, SITE)).toBeNull();
  });
});
