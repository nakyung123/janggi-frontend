---
paths:
  - "vercel.json"
  - "vite.config.ts"
  - "index.html"
---

# 헤더 · CSP · 되돌림

- **격리 헤더.** `Cross-Origin-Opener-Policy: same-origin` 과 `Cross-Origin-Embedder-Policy: require-corp` 가 있어야 SharedArrayBuffer 가 되고, 그래야 엔진이 뜬다. `credentialless` 는 WebKit 이 구현하지 않아 쓰지 않는다.
- **헤더는 `vercel.json` 과 `vite.config.ts` 두 곳에 같은 값으로 둔다.** 한쪽만 바꾸면 개발·미리보기와 배포본이 달라진다. CI(`scripts/check-headers.mjs`)가 세 곳(배포본·미리보기·개발 서버)을 비교하고, COOP·COEP·`connect-src 'self'` 는 값까지 본다.
- **CSP `connect-src 'self'` 는 "우리 서버하고만 이야기한다" 는 제한이다.** 바깥 도메인을 열어야 하는 도구는 쓰지 않거나, Vercel 되돌림으로 같은 출처가 되게 한다. 집계 스크립트를 `@vercel/analytics`·`@vercel/speed-insights` 로 고른 까닭이 이것이다(둘 다 `/_vercel/...` 에서 나온다).
- **`/api/` 되돌림은 짝이다.** 배포본은 `vercel.json` 의 `rewrites`, 로컬은 `vite.config.ts` 의 `proxy` 가 백엔드로 넘긴다. 한쪽만 바꾸지 않는다.
