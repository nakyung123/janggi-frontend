# fairy-stockfish.wasm 을 스레드 없이 빌드하게 고치는 패치.
# 원본 동작은 그대로 두고, SINGLE_THREAD 가 켜졌을 때만 바뀐다. 까닭은 README.md 에 있다.
# 쓰는 법: python -I patch.py <fairy-stockfish.wasm 저장소 경로>
# build.sh 가 부른다.
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
src = root / "src"


def replace(path, old, new):
    text = path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"{path.name}: 바꿀 자리를 정확히 하나 찾지 못했다 ({text.count(old)}개)")
    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"고침 {path.name}")


# 1. 스레드를 만들지 않는다.
replace(
    src / "thread_win32_osx.h",
    "#if defined(__APPLE__) || defined(__MINGW32__) || defined(__MINGW64__) || defined(USE_PTHREADS)",
    """#if defined(SINGLE_THREAD)

namespace Stockfish {
// 스레드를 만들지 않는다. 탐색은 부른 자리에서 바로 돈다(thread.cpp).
class NativeThread {
public:
  template<class T> NativeThread(void(T::*)(), T*) {}
  void join() {}
  void detach() {}
};
} // namespace Stockfish

#elif defined(__APPLE__) || defined(__MINGW32__) || defined(__MINGW64__) || defined(USE_PTHREADS)""",
)

# 2. 만들 때 기다리지 않는다(기다릴 스레드가 없다).
replace(
    src / "thread.cpp",
    """Thread::Thread(size_t n) : idx(n), stdThread(&Thread::idle_loop, this) {

  wait_for_search_finished();
}""",
    """Thread::Thread(size_t n) : idx(n), stdThread(&Thread::idle_loop, this) {

#if defined(SINGLE_THREAD)
  searching = false;
#else
  wait_for_search_finished();
#endif
}""",
)

# 3. "생각 시작" 이 그 자리에서 바로 생각한다. 끝날 때까지 다음 명령을 받지 않는다.
replace(
    src / "thread.cpp",
    """void Thread::start_searching() {

  std::lock_guard<std::mutex> lk(mutex);""",
    """void Thread::start_searching() {

#if defined(SINGLE_THREAD)
  if (exit)
      return;
  searching = true;
  search();
  searching = false;
  return;
#endif
  std::lock_guard<std::mutex> lk(mutex);""",
)

# 4. 스레드는 하나뿐이다. Threads 설정에 무엇을 넣어도 1 이다.
replace(
    src / "thread.cpp",
    """void ThreadPool::set(size_t requested) {
""",
    """void ThreadPool::set(size_t requested) {

#if defined(SINGLE_THREAD)
  requested = std::min(requested, size_t(1));
#endif
""",
)

# 5. go infinite 가 끝나도 stop 을 기다리며 돌지 않는다. stop 을 받을 길이 없어 영원히 돈다.
replace(
    src / "search.cpp",
    "  while (!Threads.stop && (ponder || Limits.infinite))",
    """#if defined(SINGLE_THREAD)
  if (false)
#else
  while (!Threads.stop && (ponder || Limits.infinite))
#endif""",
)

# 6. 명령을 스레드 관리자(PThread) 대신 엔진의 입력 대기열에 바로 넣는다.
#    PThread 가 없는 빌드에서 이 이름이 남아 있으면 closure 단계가 멈춘다.
pre = src / "emscripten" / "preamble.js"
replace(
    pre,
    """  // TODO: Acutally want to post only to main worker
  for (let worker of PThread.runningWorkers) {
    // prettier-ignore
    worker.postMessage({ "cmd": "custom", "userData": data });
  }""",
    """  // 스레드가 하나라 엔진이 이 자리에서 돈다. 입력 대기열에 바로 넣는다.
  Module["queue"].put(data);""",
)
replace(pre, "  PThread.terminateAllThreads();\n", "")

# 7. 빌드 설정: 스레드를 빼고 SINGLE_THREAD 를 켠다.
mk = src / "emscripten" / "Makefile"
replace(mk, "\t-s USE_PTHREADS=1 \\\n\t-s PROXY_TO_PTHREAD=1 \\\n", "")
replace(mk, "EM_CXXFLAGS +=\n", "EM_CXXFLAGS += -DSINGLE_THREAD\n")
