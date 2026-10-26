// 단일 스레드 엔진을 이 Worker 안에서 돌린다. 화면 쪽(src/engine/workerEngine.ts)과는 메시지로만 주고받는다.
//
// 엔진은 생각하는 동안 이 Worker 를 붙잡는다. 화면 쪽에서 돌리면 그동안 화면이 멈춘다.
// 생각 중에는 아래 onmessage 도 돌지 않으므로 stop 을 받지 못한다. 멈추려면 화면 쪽이 Worker 를 끝낸다.
//
// 받는 것
//   { type: "init", glue, wasmBinary }  엔진 파일(stockfish.js) 주소와 wasm 내용. 맨 처음 한 번.
//   { type: "command", command }        UCI 명령 한 줄
//   { type: "file", path, data }        엔진의 가상 파일시스템에 쓸 파일(신경망)
// 보내는 것
//   { type: "ready" }                   엔진이 떴다
//   { type: "line", line }              엔진 출력 한 줄
//   { type: "error", message }          엔진을 띄우지 못했다

let engine = null;
// 엔진이 뜨기 전에 온 메시지. 뜨면 온 순서대로 넣는다.
const waiting = [];

onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") start(m);
  else if (engine) run(m);
  else waiting.push(m);
};

async function start({ glue, wasmBinary }) {
  try {
    importScripts(glue);
    engine = await Stockfish({ wasmBinary });
    engine.addMessageListener((line) => postMessage({ type: "line", line }));
    for (const m of waiting.splice(0)) run(m);
    postMessage({ type: "ready" });
  } catch (err) {
    postMessage({ type: "error", message: String(err && err.message ? err.message : err) });
  }
}

function run(m) {
  if (m.type === "file") engine.FS.writeFile(m.path, m.data);
  else engine.postMessage(m.command);
}
