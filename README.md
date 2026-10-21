# 장기 AI

[![CI][ci-shield]][ci-url]
[![License][license-shield]][license-url]

[![React][React-shield]][React-url]
[![TypeScript][TypeScript-shield]][TypeScript-url]
[![Vite][Vite-shield]][Vite-url]
[![Vitest][Vitest-shield]][Vitest-url]
[![WebAssembly][Wasm-shield]][Wasm-url]

브라우저에서 장기 AI 와 대국하고, 끝난 판을 수마다 분석하는 웹 앱입니다. AI 엔진은
WebAssembly 로 브라우저 안에서 실행하며, 로그인한 사용자는 백엔드를 통해 기보를 서버에
저장할 수 있습니다. 운영 중입니다.

서비스 [janggi-ai.vercel.app](https://janggi-ai.vercel.app) ·
백엔드 저장소 [janggi-backend](https://github.com/nakyung123/janggi-backend)

![장기 AI 대국 화면][product-screenshot]

## 주요 기능

| 기능 | 하는 일 |
| --- | --- |
| 대국 | 18급부터 9단까지 27단계 중 상대를 고릅니다. 상차림 4가지, 규칙 3가지(표준 · 현대 · 전통), 시계(5분 + 초읽기 30초 3회)를 고를 수 있습니다 |
| 기보 | 끝난 판이 목록에 남습니다(최근 100판). 다시 열어 한 수씩 되짚고, 파일로 저장하거나 불러옵니다 |
| 복기 | AI 가 판 전체를 다시 분석해 수마다 등급, 승률 변화, AI 가 고른 수를 보여 주고, 한 판의 정확도를 숫자 하나로 알려 줍니다 |
| 로그인 | 구글로 로그인하면 기보가 서버에도 저장되어 다른 기기에서 볼 수 있습니다 |

급수는 장기 급수의 이름을 빌린 이 앱 안의 단계입니다. 공인 급수가 아닙니다.

## 기술 구성

```
사용자 브라우저            React 화면 · WebAssembly AI 엔진
   │
   ▼
Vercel                     정적 파일 배포 · /api 요청 전달
   │
   ▼
Cloud Run                  Spring Boot API (janggi-backend)
   │
   ▼
Neon PostgreSQL            이벤트 · 계정 · 기보
```

- **브라우저 안의 AI 엔진** - Fairy-Stockfish 에 장기 전용 NNUE 신경망을 얹어
  WebAssembly 로 실행합니다. 그래서 **백엔드가 멈춰도 대국과 복기는 됩니다.** 로그인,
  서버 기보 저장, 사용 기록 전송만 되지 않습니다.
- **멀티스레드 실행 환경** - 엔진이 여러 스레드로 탐색하려면 `SharedArrayBuffer` 가
  필요하고, 브라우저는 응답 헤더 두 개(`Cross-Origin-Opener-Policy`,
  `Cross-Origin-Embedder-Policy`)가 있어야 이를 허용합니다. 이 헤더를
  [`vite.config.ts`](vite.config.ts) 와 [`vercel.json`](vercel.json) 에 넣었습니다.
- **같은 출처로만 통신** - CSP 의 `connect-src 'self'` 로 브라우저가 이 사이트 주소로만
  요청하게 막았습니다. 백엔드는 Vercel 이 `/api` 아래로 전달해 같은 출처로 부릅니다.

## 프로젝트 구조

```
janggi-frontend/
├── src/
│   ├── janggi/        장기 규칙 · 기보 · 복기 · 시계 (화면과 엔진을 모름)
│   ├── engine/        Fairy-Stockfish 실행 · 급수 표
│   ├── hooks/         규칙과 화면을 잇는 상태
│   ├── components/    화면 (board · play · games · layout · common)
│   ├── server/        백엔드 호출 (로그인 · 기보 올리기)
│   ├── report/        오류 · 제보 · 측정
│   └── updates/       업데이트 내역과 버전
├── public/            개인정보처리방침 · 소개 쪽 · 받은 엔진 파일
├── scripts/           엔진과 신경망 받기 · 엔진 점검
└── docs/images/       README 스크린샷
```

## 로컬 실행

Node.js `20.19` 이상 또는 `22.12` 이상이 필요합니다(Vite 8 의 요구 사항).

```sh
git clone https://github.com/nakyung123/janggi-frontend.git
cd janggi-frontend
npm install
npm run dev             # http://localhost:5173
```

처음 실행할 때 엔진과 신경망을 `public/engine/` 에 받습니다. 용량이 커서 저장소에는 넣지
않았습니다. 신경망 받기가 실패하면 <https://fairy-stockfish.github.io/nnue/> 에서
`janggi-9991472750de.nnue` 를 받아 `public/engine/` 에 넣습니다. 파일 이름은 바꾸지 않습니다.

```sh
npm test                # 테스트 (Vitest)
npm run build           # 프로덕션 빌드
npm run preview         # 빌드 결과를 응답 헤더까지 갖춰서 확인
npm run verify-engine   # 브라우저 없이 엔진만 점검
```

파일을 직접 열거나(`file://`) 응답 헤더를 지정할 수 없는 곳(GitHub Pages)에 올리면 엔진이
시작되지 않습니다. 개발 서버와 미리보기는 `/api` 요청을 `localhost:8080` 으로 넘깁니다.
백엔드를 띄우지 않아도 대국과 복기는 되고, 로그인과 기보 저장만 실패합니다.

## 관련 문서

| 문서 | 담은 것 |
| --- | --- |
| [`DESIGN.md`](DESIGN.md) | 화면 · 색 · 컴포넌트 규칙 |
| [`NOTICE.md`](NOTICE.md) | 제3자 저작물과 라이선스 |
| [개인정보처리방침](https://janggi-ai.vercel.app/privacy/) | 수집하는 정보, 보관 기간, 지우는 방법 |
| [janggi-backend](https://github.com/nakyung123/janggi-backend) | 백엔드 저장소 |
| [이슈](https://github.com/nakyung123/janggi-frontend/issues) | 버그 제보와 기능 제안 |

## 라이선스

**GPL v3 이상.** 전문은 [`LICENSE`](LICENSE) 에 있습니다.

`src/janggi/glyphs.ts` 의 기물 글자는 위키미디어 공용 그림의 2차적 저작물이라
**CC BY-SA 3.0** 을 따릅니다. 엔진 · 신경망 · 글꼴 · 아이콘의 출처와 라이선스는
[`NOTICE.md`](NOTICE.md) 에 있습니다.

<!-- 배지 주소 -->
[ci-shield]: https://github.com/nakyung123/janggi-frontend/actions/workflows/ci.yml/badge.svg
[ci-url]: https://github.com/nakyung123/janggi-frontend/actions/workflows/ci.yml
[license-shield]: https://img.shields.io/badge/license-GPL--3.0--or--later-blue?style=flat
[license-url]: https://github.com/nakyung123/janggi-frontend/blob/main/LICENSE
[product-screenshot]: docs/images/screenshot.png
[React-shield]: https://img.shields.io/badge/React%2019-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://react.dev/
[TypeScript-shield]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Vite-shield]: https://img.shields.io/badge/Vite%208-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vite.dev/
[Vitest-shield]: https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white
[Vitest-url]: https://vitest.dev/
[Wasm-shield]: https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white
[Wasm-url]: https://webassembly.org/
