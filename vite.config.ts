/// <reference types="vitest/config" />
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/*
 * 내보내는 헤더. vercel.json 과 **같은 값을 유지해야 한다.**
 *
 * 개발·미리보기에서만 느슨하면 배포하고 나서야 깨진 것을 본다. 특히 CSP 는 어긋나는
 * 순간 화면이 하얗게 되는 종류라, 여기서 똑같이 겪어 두는 편이 싸다.
 */

// Fairy-Stockfish WASM 은 멀티스레드 탐색에 SharedArrayBuffer 를 쓴다.
// 브라우저가 SharedArrayBuffer 를 열어주려면 아래 두 헤더가 반드시 필요하다.
// 이게 빠지면 엔진이 조용히 로드 실패한다.
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/*
 * 가져올 수 있는 곳을 우리 서버 하나로 묶는다(Content-Security-Policy).
 *
 * 이 앱은 바깥에서 받아오는 것이 하나도 없다 - 글꼴(Pretendard)·아이콘(Lucide)은 번들에
 * 들어 있고, 탭 아이콘은 index.html 안의 data: URI 이고, 엔진과 신경망은 /engine/ 에서
 * 온다. 그래서 'self' 로 전부 닫아도 잃는 것이 없다.
 *
 * 'wasm-unsafe-eval' 만 열어 둔다. 이름이 사납지만 **wasm 을 컴파일해도 된다**는 뜻일
 * 뿐이고, 자바스크립트 eval 은 열지 않는다. 엔진 스크립트를 뒤져보니 eval·new Function·
 * blob URL 을 하나도 쓰지 않아서(importScripts 하나뿐) 이 이상은 열 것이 없다.
 *
 * style-src 에 'unsafe-inline' 이 붙은 까닭 - 판 크기를 재서 넣는 자리가 인라인 스타일이다
 * (React 의 style={{...}}). 스타일로 할 수 있는 나쁜 짓은 거의 없고, 열지 않으면 판이 안 그려진다.
 *
 * frame-ancestors 'none' 은 남의 사이트가 우리 화면을 액자처럼 덮어 두고 엉뚱한 것을
 * 누르게 하는 짓(클릭재킹)을 막는다. COOP/COEP 는 이것을 막아 주지 않는다.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

const headers = {
  ...crossOriginIsolation,
  "Content-Security-Policy": csp,
  // 서버가 말한 종류를 브라우저가 멋대로 다시 추측하지 않게 한다.
  "X-Content-Type-Options": "nosniff",
  // 제보 창구(구글 폼)로 넘어갈 때 우리 주소를 딸려 보내지 않는다.
  "Referrer-Policy": "no-referrer",
};

/*
 * 개발 서버(npm run dev)에서만 표식(nonce) 하나를 더 연다.
 *
 * 개발 서버는 화면을 새로 고치지 않고 바꿔 끼우려고(React Fast Refresh) index.html 안에
 * 스크립트 한 토막을 **직접 적어 넣는다.** script-src 'self' 는 쪽 안에 적힌 스크립트를
 * 막으므로 그 토막이 돌지 못하고, 그러면 앱이 통째로 안 떠서 화면이 하얗다(콘솔에
 * "can't detect preamble"). 위의 CSP 를 넣을 때 미리보기에서만 확인해서 몰랐고, 서버를
 * 새로 켠 날 드러났다.
 *
 * Vite 가 자기가 넣는 태그에 이 표식을 붙여 주므로(html.cspNonce), 헤더에서 같은 표식만
 * 허락한다. 'unsafe-inline' 으로 통째로 여는 것보다 좁다. 표식이 고정 글자라 비밀은 아니다 -
 * 내 컴퓨터에서만 도는 서버라 그래도 된다.
 *
 * 미리보기와 배포본에는 그 토막이 없으니 위의 엄격한 값을 그대로 쓴다. "개발에서만 느슨하면
 * 배포하고 나서야 깨진 것을 본다" 는 걱정은 미리보기가 맡는다.
 */
const DEV_NONCE = "vite-dev";
const devHeaders = {
  ...headers,
  "Content-Security-Policy": csp.replace(
    "script-src 'self'",
    `script-src 'self' 'nonce-${DEV_NONCE}'`
  ),
};

/*
 * /api/ 로 오는 것을 측정 서버로 넘긴다. **vercel.json 의 되돌림과 짝이다.**
 *
 * 왜 서버 주소를 직접 부르지 않나 - CSP 의 `connect-src 'self'` 가 막는다. 브라우저는
 * 포트가 다르면 다른 곳으로 보고, 4173 에서 8080 을 부르는 것은 남의 집에 말 거는 일이다.
 * 실제 배포에서도 같은 이유로 Vercel 이 한 주소 뒤에 둘을 세운다. **여기서 같은 모양을
 * 만들어야 로컬에서 미리 해 볼 수 있다.**
 *
 * 쓰려면 서버를 먼저 띄운다(janggi-events 저장소).
 *
 *     docker run -d --name ev -p 8080:9090 -e PORT=9090 janggi-events:dev
 *
 * 안 띄워 두면 /api/ 요청만 실패한다. 측정은 실패해도 앱을 깨뜨리지 않으므로 화면은
 * 그대로 돈다 - 그래서 **안 띄운 줄 모르고 "기록이 안 온다" 고 헤맬 수 있다.**
 */
/*
 * 폴더 주소(/privacy/)를 그 안의 index.html 로 바꾼다. 개발 서버와 미리보기 둘 다.
 *
 * Vite 는 파일을 내보낼 때 확장자 추측을 꺼 둔다(extensions: []). 그래서 /privacy/ 를
 * privacy/index.html 로 찾아 주지 않고, 못 찾은 주소는 SPA 되돌림이 받아서 **앱이 뜬다.**
 * vercel.json 에는 그 되돌림이 없어 배포본은 진짜 파일을 준다 - 그래서 여기서만 다르게
 * 보인다.
 *
 * 2026-10-19 에 이것 때문에 "개인정보처리방침 링크가 홈으로 간다" 고 잘못 읽었다.
 * 로컬에서 본 것이 배포본의 증거가 되려면 둘이 같아야 한다. 미리보기까지 거는 까닭도
 * 같다 - 거기가 배포본과 같은 번들로 확인하는 자리다.
 *
 * 파일이 있는지는 보지 않는다 - 그러려면 node 타입을 들여야 하는데, 그러면 src 에서
 * setTimeout 의 반환형이 number 에서 NodeJS.Timeout 으로 바뀐다. 볼 필요도 없다.
 * /없는폴더/index.html 은 어차피 없어서 지금과 똑같이 SPA 되돌림이 받는다.
 */
function 폴더주소(req: { url?: string }, _res: unknown, next: () => void) {
  const 주소 = req.url;
  if (주소) {
    const 길 = 주소.split("?")[0];
    // '..' 이 섞인 주소는 건드리지 않는다.
    if (길.length > 1 && 길.endsWith("/") && !길.includes("..")) {
      req.url = 길 + "index.html" + 주소.slice(길.length);
    }
  }
  next();
}

function 폴더주소플러그인(): Plugin {
  return {
    name: "janggi-folder-index",
    configureServer(server) {
      server.middlewares.use(폴더주소);
    },
    configurePreviewServer(server) {
      server.middlewares.use(폴더주소);
    },
  };
}

const API_PROXY = {
  "/api": {
    target: "http://localhost:8080",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ""),
  },
};

export default defineConfig(({ command, isPreview }) => ({
  plugins: [react(), 폴더주소플러그인()],
  // 빌드한 index.html 에는 표식을 남기지 않는다. 개발 서버일 때만 붙인다.
  html: command === "serve" && !isPreview ? { cspNonce: DEV_NONCE } : undefined,
  server: { headers: devHeaders, proxy: API_PROXY },
  // 미리보기에도 같이 건다. 배포본과 같은 번들로 확인하는 자리라, 여기에만 길이
  // 없으면 "개발에서는 되는데 미리보기에서는 안 되는" 상태가 된다.
  preview: { headers, proxy: API_PROXY },
  // 11MB 신경망과 1.6MB wasm 은 public/ 에 그대로 두고 fetch 로 읽는다.
  // 번들러가 건드리지 않도록 assetsInlineLimit 는 기본값을 유지한다.

  // React 를 따로 묶는다. 한 파일이면 앱 코드 한 줄만 바뀌어도 이름이 바뀌어, 다시 오는
  // 사람이 React(gzip 60KB)까지 새로 받는다. 따로 두면 React 판이 그대로인 배포에서는 그
  // 파일 이름이 같아 1년 캐시(vercel.json /assets/)에서 꺼내 쓴다. 아이콘·Vercel 측정은
  // Dependabot 이 자주 올려서 같이 묶지 않는다 - 섞으면 React 파일 이름도 자주 바뀐다.
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }],
        },
      },
    },
  },

  /*
   * 쪽은 하나다(index.html). 한동안 업데이트 내역을 /updates/ 로 따로 세워
   * 진입점이 둘이었는데, 그 글을 앱 안의 창으로 옮기면서 하나로 돌아왔다.
   */

  // 순수 로직 테스트(*.test.ts)는 node 에서 돈다. 화면 테스트(*.test.tsx)는 파일 맨 위의
  // `@vitest-environment jsdom` 으로 브라우저 흉내 속에서 돌고, 엔진(wasm)은 가짜로 바꿔
  // 끼운다(src/test/fakeEngine.ts). 진짜 엔진은 브라우저가 있어야 해서 여기서 다루지 않는다.
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
}));
