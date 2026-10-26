# CLAUDE.md

브라우저에서 Fairy-Stockfish(WASM)와 장기를 두고 복기하는 앱이다. React 19 · TypeScript · Vite,
Vercel 에 배포한다. 측정·로그인·기보 저장은 백엔드(내 컴퓨터 `janggi-events`, 깃허브
`janggi-backend`)가 받는다.

| 무엇 | 이름 |
| --- | --- |
| 깃허브 저장소 | `janggi-frontend` |
| 내 컴퓨터 폴더 | `janggi` |
| 사이트 주소 | `janggi-ai.vercel.app` |

## 먼저 읽을 것

| 무엇을 할 때 | 어디를 본다 |
| --- | --- |
| 계획을 세울 때 | `c:\nakyung\work-base\projects\janggi\README.md` → 거기서 할 일에 맞는 파일 |
| 화면을 만들거나 고칠 때 | `DESIGN.md` → 거기에 없으면 `c:\nakyung\design-base\DESIGN-BASE.md` |
| 오류 · 제보 · 측정을 만질 때 | `src/report/CLAUDE.md` (그 폴더 파일을 열기 전에 먼저 읽는다) |
| 왜 이렇게 됐는지 알고 싶을 때 | `docs/DECISIONS.md` (로컬 전용. 저장소에 없다) |

`.claude/rules/` 의 파일(헤더·CSP, 화면, 코드 구조)은 맞는 파일을 열 때 자동으로 읽힌다.

## 명령

```bash
npx tsc -b          # 타입. 린트 대신이다 (noUnusedLocals 켜짐)
npx vitest run      # 테스트
npm run build       # 빌드
PAT=$(printf '\xef\xbf\xbd'); git grep -nF "$PAT" -- . && echo "깨진 글자 있음!" || echo "깨끗"
```

- 넷 다 올리기 전에 돌린다. CI(`.github/workflows/ci.yml`)도 같은 넷을 본다. Vercel 은 테스트를 돌리지 않는다.
- 깨진 글자 검사를 `$'\ufffd'` 로 쓰면 이 셸에서 아무것도 찾지 못하고 "깨끗" 이라고 한다.

## 구조

- 의존은 한쪽으로만: `components → hooks → janggi`, `hooks → server`. `components` 는 `engine` 의 타입과 급수 표만 쓴다.
- `janggi/` 는 장기 규칙만 있다. 화면·엔진·서버를 모른다.
- 엔진을 돌리는 것은 `App.tsx` 하나다.
- 새 기능은 규칙 → 상태 → 화면 순서로 만든다.

## 하지 말 것

- `components/` 에서 `useEngine`, `track()`, `server/` 를 부르지 않는다.
- 실패를 성공처럼 보이게 하지 않는다. 엔진이 안 뜬 것을 빈 판으로 때우거나 오류를 삼키고 기본값으로 넘기지 않는다. 예외는 `src/report/events.ts` 의 `track()` 하나다.
- 격리 헤더(COOP·COEP)와 CSP `connect-src 'self'` 를 깨지 않는다. 바깥 주소에 붙는 도구를 들이지 않는다.
- `VITE_` 로 시작하는 값에 비밀을 넣지 않는다. 번들에 그대로 박힌다. `.env*` 의 값을 열어 보거나 찍지 않는다.
- 기보 형식 이름 `janggi-board/2` 를 저장소 이름에 맞춰 바꾸지 않는다.
- 자동 도구가 만든 변경을 깨진 글자 검사 없이 머지하지 않는다.
- `README.md` 와 `DESIGN.md` 는 요청받았을 때만 고친다.
- `docs/DECISIONS.md` 는 묻지 않고 적되, 커밋 메시지에서 언급하지 않는다. `.git/info/exclude` 에 있어 올라가지 않는다.

## 되돌릴 수 없는 변경

계획을 파일로 남기고 승인받는다.

- **main 에 푸시하는 것.** Vercel 이 바로 배포한다.
- **기기에 저장하는 모양을 바꾸는 것.** `janggi:` 로 시작하는 키(`src/hooks/usePersisted.ts`)의 이름·저장 모양, 기보 형식 이름을 바꾸면 이미 저장된 것이 읽히지 않는다.
- **측정 이벤트 이름을 바꾸거나 더하는 것.** 서버 목록·쌓인 기록과 어긋난다. 더할 때는 서버를 먼저 배포한다. 서버 목록에 없는 이름은 CI(`scripts/check-event-names.mjs`)가 막는다.
- **로그인·기보 올리기를 실제로 불러 보는 것.** 운영 DB 에 쓴다. 프리뷰 배포도 `vercel.json` 의 되돌림으로 같은 서버에 붙는다.

## 푸시한 뒤

배포 상태와 라이브 화면까지 확인하고 보고한다. 번들 해시가 로컬 빌드와 같은지, 격리 헤더와 CSP 가 그대로인지, 바뀐 것이 실제로 반영됐는지 본다.

## 이 파일

항상 읽히는 파일이다. 특정 파일에만 해당하는 규칙은 `.claude/rules/` 에 `paths` 를 붙여 둔다. 일반 규칙은 `c:\nakyung\work-base` 에 있다. 여기에 되풀이하지 않는다.
