# 단일 스레드 엔진

격리(cross-origin isolation)가 안 되는 브라우저에서 쓰는 Fairy-Stockfish 빌드다.
안드로이드의 앱 안 브라우저(카카오톡, 네이버 앱 등)가 그렇다.

- 지금 엔진(`fairy-stockfish-nnue.wasm` 패키지)은 스레드를 쓰고, 스레드에는 SharedArrayBuffer 가 필요하다.
- SharedArrayBuffer 는 격리가 돼야 생긴다. 안드로이드 WebView 는 헤더를 줘도 격리가 안 된다.
- 그래서 스레드를 빼고 다시 빌드했다. 앱은 격리가 안 될 때만 이 빌드를 쓴다(`src/engine/engine.ts` 의 `create`).

## 파일

| 파일 | 무엇 |
| --- | --- |
| `stockfish.js`, `stockfish.wasm` | 빌드 결과. 앱이 그대로 싣는다 |
| `worker.js` | Web Worker 안에서 엔진을 띄운다. 화면 쪽은 `src/engine/workerEngine.ts` |
| `patch.py` | 원본 소스를 고치는 패치 |
| `build.sh` | 원본을 받아 패치하고 빌드한다 |

## 원본

- 저장소: https://github.com/fairy-stockfish/fairy-stockfish.wasm
- 커밋: `b2e693ef1e111233ce3fb40685921708b3276ed6` (태그 1.1.12). 지금 쓰는 패키지 `fairy-stockfish-nnue.wasm@1.1.12` 와 같은 저장소, 같은 버전이다.
- 빌드 도구: Docker 이미지 `emscripten/emsdk:2.0.26` (지문은 `build.sh` 에 있다)

## 고친 것

모두 `SINGLE_THREAD` 가 켜졌을 때만 바뀐다. 자세한 것은 `patch.py` 에 있다.

1. 스레드를 만들지 않는다.
2. 탐색을 시작하면 그 자리에서 끝까지 돈다.
3. Threads 설정에 무엇을 넣어도 1 이다.
4. `go infinite` 는 끝나지 않으므로 기다리지 않는다. 앱은 쓰지 않는다.
5. 명령을 스레드 관리자 대신 엔진의 입력 대기열에 바로 넣는다.
6. 빌드 설정에서 `USE_PTHREADS`, `PROXY_TO_PTHREAD` 를 빼고 `SINGLE_THREAD` 를 켠다.

## 다시 빌드하기

```bash
bash engine-single/build.sh <빈 작업 폴더>
```

git, python, Docker 가 필요하다. 2분쯤 걸린다. 결과는 작업 폴더의 `out/` 에 생기고, 끝에 SHA-256 을 찍는다.
아래 값과 같으면 저장소의 파일이 위 소스에서 나온 것이다.

```text
fadebeb97284fec614841bc0970fda4c17009e9ff019e160e46899a92ad02d1c  stockfish.js
9e7facf28ed47dd70524549de69f480c0e6182ed875728d2cc5dec2040a58900  stockfish.wasm
```

2026-10-26 에 두 번 빌드해 같은 값을 얻었다.

## 이 엔진의 한계

- 스레드가 하나라 폰의 4스레드보다 약 4배 느리다. 같은 노드 수면 같은 수를 둔다.
- 생각하는 중에는 `stop` 을 받지 못한다. 앱은 멈춰야 할 때 Worker 를 끝내고 새로 띄운다(`src/engine/workerEngine.ts`).

## 라이선스

GPL v3. 원본과 같다. 저작자 목록은 원본 패키지의 `AUTHORS` 를 그대로 싣는다(`/engine/AUTHORS`).
