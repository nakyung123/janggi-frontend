// 엔진을 React 에서 쓰는 훅 셋
//
//   useEngine    엔진(WASM)을 내려받아 띄우고, 준비 상태·진행률·오류를 알린다
//   useAnalysis  국면이 바뀔 때마다 합법수·장군을 묻고, 엔진 차례면 둘 수를 찾는다
//   useHint      내 차례에 누르면 그 국면에서 둘 수를 한 번 찾는다

import { useCallback, useEffect, useRef, useState } from "react";
import { noteTrouble } from "../report/errors";
import { track } from "../report/events";
import { JanggiEngine } from "./engine";
import type {
  AnalysisSnapshot,
  LoadProgress,
  PositionRef,
  SearchLimits,
} from "./types";
import { positionKey } from "./types";

export type EngineStatus = "loading" | "ready" | "error";

// 엔진은 한 탭에 하나면 충분하고, 11MB 신경망을 두 번 받을 이유도 없다.
// StrictMode 가 개발 모드에서 이펙트를 두 번 실행하므로 여기서 한 번으로 묶는다.
let shared: Promise<JanggiEngine> | null = null;
const progressWatchers = new Set<(p: LoadProgress) => void>();

function sharedEngine(): Promise<JanggiEngine> {
  if (!shared) {
    shared = JanggiEngine.create((p) => {
      for (const fn of progressWatchers) fn(p);
    }).catch((err) => {
      shared = null; // 실패했으면 다음 시도에서 다시 만들 수 있게 한다
      throw err;
    });
  }
  return shared;
}

export interface EngineState {
  engine: JanggiEngine | null;
  status: EngineStatus;
  progress: LoadProgress | null;
  error: string | null;
  /**
   * 신경망이 실제로 물렸는지 알려주는 엔진 자체 응답.
   *
   * 신경망은 뒤에서 받으므로(engine.ts 의 loadNnue) 처음에는 null 이고, 다 물린 뒤에
   * 채워진다. 여기서 classical 이 나오면 신경망이 끝내 안 붙은 것이라 실력이 떨어진다.
   */
  evalMode: string | null;
}

export function useEngine(): EngineState {
  const [state, setState] = useState<EngineState>({
    engine: null,
    status: "loading",
    progress: null,
    error: null,
    evalMode: null,
  });

  useEffect(() => {
    let alive = true;

    /*
     * 마지막 진행 상황을 따로 들고 있는다. 실패했을 때 **어느 단계에서 터졌는지**를
     * 같이 보내야 한다 - 엔진 파일을 받다가인지, 신경망을 받다가인지, wasm 을 켜다가
     * 인지에 따라 원인이 아주 다르다. setState 는 비동기라 catch 안에서 못 읽는다.
     */
    let lastProgress: LoadProgress | null = null;

    const onProgress = (progress: LoadProgress) => {
      lastProgress = progress;
      if (alive) setState((s) => ({ ...s, progress }));
    };
    progressWatchers.add(onProgress);

    sharedEngine()
      .then(async (engine) => {
        if (!alive) return;
        /*
         * 엔진(1.6MB)만 받으면 바로 둘 수 있다. 여기서 판을 띄운다.
         *
         * 예전에는 신경망 11MB 까지 다 받고서야 띄웠다. 처음 온 사람이 빈 화면을
         * 10초 넘게 봤다. 그 사이에도 엔진은 classical 평가로 멀쩡히 둔다.
         */
        setState({ engine, status: "ready", progress: null, error: null, evalMode: null });

        /*
         * 깔때기의 분자. performance.now() 는 **쪽이 열린 시점**부터 흐르므로 그대로
         * 쓴다 - 사람이 체감하는 것은 "열어서 판이 보이기까지" 이지 "엔진 만들기를
         * 시작해서부터" 가 아니다.
         */
        track("engine_ready", { ms: Math.round(performance.now()) });

        // 신경망이 물린 뒤에 한 번 물어본다. 진단용이라 급하지 않다.
        await engine.whenStrong();
        if (!alive) return;
        const evalMode = await engine
          .evaluationMode(
            "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1"
          )
          .catch(() => null);
        if (!alive) return;
        setState((s) => ({ ...s, evalMode }));
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // 엔진이 안 뜨면 앱이 통째로 멈추므로 화면에 까닭을 보여야 한다. 그래도 날것을
        // 그대로 쓰지는 않는다 - 우리가 쓴 한국어 글이면 그대로, 아니면 오류 코드다.
        const trouble = noteTrouble("엔진 준비", err);
        setState((s) => ({ ...s, status: "error", error: trouble.message }));

        /*
         * 지금 유일하게 알려진 장애다. 기기 정보는 공통으로 붙으니 여기서는 **이 실패에만
         * 있는 것**을 적는다.
         *
         * detail 은 영어 원문이다. 화면에는 안 띄우지만(겁만 주고 아무것도 안 알려준다)
         * 받는 쪽에는 사실이 가야 한다 - 1순위 용의자인 메모리 부족이 정확히 이 경로로
         * 오고, code 는 되돌릴 수 없는 해시라 그것만으로는 원문을 알 수 없다.
         *
         * code 를 같이 보내는 까닭 - 사람이 제보에 "E-7F3A" 를 적어 보내면 **그 코드로
         * 서버 기록을 찾아** 기기·단계·원문을 한꺼번에 볼 수 있다.
         */
        track("engine_failed", {
          code: trouble.code,
          stage: lastProgress?.stage ?? null,
          loaded: lastProgress?.loaded ?? null,
          total: lastProgress?.total ?? null,
          detail: trouble.detail.slice(0, 200),
          ms: Math.round(performance.now()),
        });
      });

    return () => {
      alive = false;
      progressWatchers.delete(onProgress);
    };
  }, []);

  return state;
}

export interface AnalysisState {
  snapshot: AnalysisSnapshot | null;
  /** 이 국면의 합법수 전체 */
  legal: Set<string>;
  /** 지금 궁을 노리는 기물들의 자리. 비어 있지 않으면 장군 */
  checkers: string[];
  /** 이 국면에 대한 엔진 응답을 받았는지. 받기 전에는 대국 종료로 판정하면 안 된다. */
  probed: boolean;
}

/**
 * 국면이 바뀔 때마다 합법수를 다시 구하고, 켜져 있으면 탐색도 다시 돌린다.
 * 탐색은 엔진이 제 수를 고를 때만 켜진다. 기보를 빠르게 넘기면 국면이 연달아
 * 들어오므로 살짝 늦춰서 처리한다.
 */
export function useAnalysis(
  engine: JanggiEngine | null,
  ref: PositionRef,
  enabled: boolean,
  limits: SearchLimits,
  optionsKey: string
): AnalysisState {
  // 분석 결과에 "어느 국면의 것인지" 꼬리표를 달아 둔다.
  // 국면이 바뀐 직후 낡은 결과가 새 국면의 것으로 읽히면, 엔진이 엉뚱한 수를 둔다.
  const [tagged, setTagged] = useState<{
    key: string;
    snap: AnalysisSnapshot;
  } | null>(null);
  /*
   * 합법수·장군도 '어느 국면의 것인지' 꼬리표를 단다.
   *
   * probed 를 따로 두고 국면이 바뀌면 effect 에서 false 로 돌리면 안 된다. effect 는
   * 그린 뒤에 돌아서, 수를 둔 직후 한 번은 probed 가 true 인 채 legal·checkers 가 앞
   * 국면의 것이다. 장군·멍군을 외치는 쪽이 그것을 새 국면의 값으로 읽으면, 엔진이
   * 장군을 피한 수를 "멍군!" 이라고 외친다. 꼬리표가 지금 국면과 맞을 때만 내보내면
   * 그 틈이 없다.
   */
  const [probe, setProbe] = useState<{
    key: string;
    legal: Set<string>;
    checkers: string[];
  } | null>(null);
  // 같은 국면이면 같은 문자열. 이걸로 늦게 도착한 결과를 걸러낸다.
  const key = positionKey(ref);
  const keyRef = useRef(key);
  keyRef.current = key;
  const refBox = useRef(ref);
  refBox.current = ref;

  useEffect(() => {
    if (!engine) return;
    let alive = true;

    const timer = window.setTimeout(() => {
      void engine
        .probe(refBox.current)
        .then((r) => {
          if (!alive) return;
          setProbe({ key, legal: new Set(r.legal), checkers: r.checkers });
        })
        .catch(() => {
          if (!alive) return;
          setProbe(null);
        });
    }, 60);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [engine, key]);

  useEffect(() => {
    if (!engine) return;
    if (!enabled) {
      void engine.stop();
      setTagged(null);
      return;
    }

    let alive = true;
    setTagged(null);

    const timer = window.setTimeout(() => {
      engine.analyze(refBox.current, limits, (snap) => {
        // 국면이 이미 바뀐 뒤 도착한 늦은 결과는 버린다.
        if (alive && keyRef.current === key) setTagged({ key, snap });
      });
    }, 180);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      void engine.stop();
    };
    // limits 는 매번 새 객체라 참조로 비교하면 무한 재실행된다. 문자열 키로 묶는다.
  }, [engine, key, enabled, optionsKey]);

  // 지금 국면의 결과일 때만 내보낸다.
  const snapshot = tagged && tagged.key === key ? tagged.snap : null;
  const probed = probe !== null && probe.key === key;

  return {
    snapshot,
    legal: probed ? probe.legal : NO_MOVES,
    checkers: probed ? probe.checkers : NO_CHECKERS,
    probed,
  };
}

export interface HintState {
  /** 지금 국면에서 찾은 수(엔진 좌표, 예: a4b4). 아직 안 찾았으면 null. */
  move: string | null;
  /** 지금 국면의 힌트를 찾는 중인지 */
  searching: boolean;
  /** 지금 국면에서 찾다가 못 찾았는지. 다시 누를 수 있다. */
  failed: boolean;
  /** 지금 국면에서 둘 수를 한 번 찾는다. 찾는 중이거나 이미 찾았으면 아무 일도 없다. */
  ask: () => void;
}

/**
 * 내 차례에 누르면 그 국면에서 둘 수를 한 번 찾는다(힌트).
 *
 * 엔진의 실력 손잡이는 따로 바꾸지 않는다. 내 차례에는 App 이 이미 가장 센 값(20)으로 둔다
 * (App 의 options) - 엔진은 하나라 여기서 바꾸면 App 이 건 설정과 엇갈린다.
 *
 * 답에 국면 열쇠를 단다. 찾는 동안 수를 두거나 무르면 늦게 온 답을 버린다 - 새 국면의 것으로
 * 읽으면 엉뚱한 자리에 화살표가 선다. 국면이 바뀌면 찾아 둔 수도 버린다. 무르다가 그 국면에
 * 돌아와도 저절로 뜨지 않고, 누른 국면에서만 보인다.
 *
 * 돌던 탐색을 여기서 끊지는 않는다. 국면이 내 차례로 바뀌면 useAnalysis 가, 엔진 차례로
 * 바뀌면 App 의 엔진 설정이 바뀌면서 setOptions 가 stop 을 보낸다. 한 번 더 보내면 그 사이에
 * 줄을 선 엔진의 탐색까지 버려질 수 있다(engine.ts 의 searchGen).
 */
export function useHint(
  engine: JanggiEngine | null,
  ref: PositionRef,
  limits: SearchLimits
): HintState {
  const key = positionKey(ref);
  const keyRef = useRef(key);
  keyRef.current = key;
  const refBox = useRef(ref);
  refBox.current = ref;

  const [hint, setHint] = useState<{
    key: string;
    status: "searching" | "found" | "failed";
    move: string | null;
  } | null>(null);

  // 국면이 바뀌면 그 국면의 힌트는 끝이다.
  useEffect(() => {
    setHint((h) => (h && h.key !== key ? null : h));
  }, [key]);

  const current = hint && hint.key === key ? hint : null;

  const ask = useCallback(() => {
    if (!engine || (current && current.status !== "failed")) return;
    const asked = keyRef.current;
    setHint({ key: asked, status: "searching", move: null });
    engine.analyzeOnce(refBox.current, limits).then(
      (snap) => {
        const move = snap.bestmove ?? snap.lines[0]?.pv[0] ?? null;
        setHint((h) =>
          h?.key === asked ? { key: asked, status: move ? "found" : "failed", move } : h
        );
      },
      (err: unknown) => {
        // 국면이 이미 바뀌었으면 끊긴 것이 맞다. 같은 국면에서 못 찾았을 때만 적고 알린다.
        if (keyRef.current !== asked) return;
        noteTrouble("힌트", err);
        setHint((h) => (h?.key === asked ? { key: asked, status: "failed", move: null } : h));
      }
    );
  }, [engine, current, limits]);

  return {
    move: current?.status === "found" ? current.move : null,
    searching: current?.status === "searching",
    failed: current?.status === "failed",
    ask,
  };
}

// 아직 응답이 없을 때 내보내는 빈 값. 매번 새로 만들면 받는 쪽 useMemo 가 헛돈다.
const NO_MOVES: Set<string> = new Set();
const NO_CHECKERS: string[] = [];
