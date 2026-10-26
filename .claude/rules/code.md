---
paths:
  - "src/**/*.{ts,tsx,css}"
---

# 코드 구조

- `hooks/` 는 컴포넌트를 부르지 않는다. 반대로 가면 고리가 생긴다.
- 네트워크를 아는 곳은 `server/api.ts` 하나이고, 그걸 부르는 것은 `hooks/` 다. `janggi/` 가 서버를 알면 규칙을 검사할 때 서버가 필요해진다.
- `track()` 은 훅(`useEngine.ts`, `useReview.ts`)과 상태를 쥔 `App.tsx` 에서 부른다.

## 기준은 한 곳에만

같은 판단을 두 군데서 하지 않는다. 쓰는 쪽에 조건을 하나 더 붙이고 싶어지면 기준이 둘로 갈라지는 중이다.

| 무엇 | 어디 |
| --- | --- |
| 영어 오류를 사람 말로 바꾸기 | `src/report/errors.ts` |
| 기기 이름 붙이기 (브라우저 · OS · 인앱) | `src/report/feedback.tsx` |
| 측정을 바깥으로 내보내기 | `src/report/events.ts` 의 `send()` 하나 |
| 색 · 치수 · 컴포넌트 규칙 | `DESIGN.md` |

## 타입 검사가 못 잡는 것

- 내보낸 이름(export), CSS, 주석은 타입 검사가 못 잡는다. 쓰지 않게 된 export 는 손으로 찾아 지운다.
- CSS 클래스는 `"review-move g-" + r.grade` 처럼 이어 붙여 만드는 이름이 있다. 글자만 찾아보고 지우지 않는다.
- 같은 모양을 여러 군데 고칠 때는 `git grep` 을 고치기 전에 한 번, 닫기 전에 한 번 돌린다. `inAppLabel()` 을 이벤트에만 붙이고 화면의 진단 줄에는 안 붙인 적이 있다.
