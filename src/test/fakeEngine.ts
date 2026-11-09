// 가짜 엔진 — 화면 테스트가 진짜 Fairy-Stockfish(wasm) 대신 쓴다
//
// App 이 엔진에 묻는 것(합법수·장군, 둘 수, 설정, 기보 검사)에 정해 둔 답을 준다.
// 장기 규칙을 다 알지는 않는다. 둘 차례인 쪽의 기물이 앞뒤·옆 한 칸의 빈 자리로 가는
// 수와 한수쉼(궁 제자리)만 합법수로 친다 - 테스트가 두는 수(졸 한 칸)에는 이것으로 된다.
// 엔진이 둘 수는 그 합법수 가운데 한수쉼이 아닌 첫 수다. 같은 국면이면 늘 같은 수를 둔다.
//
// 무엇을 물었는지 적어 둔다. 테스트는 '이 국면에서 탐색을 몇 번 시작했나' 를 세고,
// 탐색이 걸리는 시간·합법수를 알려 주는 때·기보 검사의 답을 손잡이로 바꾼다.
//
// 바꿔 끼우는 법(테스트 파일 맨 위):
//   vi.mock("./engine/engine", async () => ({
//     JanggiEngine: (await import("./test/fakeEngine")).FakeEngine,
//   }));
// useEngine 은 엔진을 한 번만 만들어 돌려 쓰므로, 테스트마다 FakeEngine.current.reset() 한다.
// 엔진은 App 이 뜨기 전부터 있다 - 테스트가 App 을 띄우기 전에 손잡이를 돌릴 수 있게.

import type {
  AnalysisSnapshot,
  EngineOptions,
  PositionProbe,
  PositionRef,
  SearchLimits,
  Variant,
} from "../engine/types";
import { positionKey } from "../engine/types";
import { FILES, RANKS, applyMove, fileIdxOf, parseFen, rankOf, sq, toFen } from "../janggi/board";
import type { Position } from "../janggi/board";
import { splitMove } from "../janggi/notation";
import { sideOf } from "../janggi/pieces";

export class FakeEngine {
  /** App 이 쓰는 가짜 엔진. 하나뿐이다. */
  static readonly current = new FakeEngine();

  static async create(): Promise<FakeEngine> {
    return FakeEngine.current;
  }

  // --- 손잡이 ----------------------------------------------------------------

  /** 탐색을 시작해 둘 수를 내놓기까지 걸리는 시간(ms). */
  searchMs = 0;
  /** true 를 돌려주는 국면은 합법수를 바로 알려 주지 않고 releaseProbes() 까지 붙잡는다. */
  holdProbe: ((ref: PositionRef) => boolean) | null = null;
  /** 기보 검사(firstIllegalMove)의 답. 규칙에 맞지 않는 첫 수의 번호, 다 맞으면 null. */
  illegalAt: number | null = null;
  /**
   * 합법수·장군 답을 바꿔치기한다. 돌려준 칸만 덮어쓰고, null 이면 가짜 규칙이
   * 낸 답을 그대로 쓴다.
   *
   * 끝나는 국면을 만들려고 둔다. 가짜 규칙은 한 칸짜리 수만 알고 장군은 영영
   * 모르는데, 외통·수몰은 "장군인데 한수쉼 말고 둘 게 없음" 이라야 선다. 진짜
   * 외통 국면을 FEN 으로 차려 놓는 길도 있지만, 그러면 가짜 규칙이 그 자리에서
   * 내놓는 수까지 맞춰야 해서 판정과 상관없는 것을 더 많이 꾸미게 된다.
   */
  probeAnswer: ((ref: PositionRef) => Partial<PositionProbe> | null) | null = null;
  /** true 면 한 국면 탐색(analyzeOnce, 복기가 쓴다)의 답을 releaseOnce() 까지 붙잡는다. 복기가 도는 채로 둘 때. */
  holdOnce = false;
  /**
   * 한 국면 탐색(analyzeOnce)의 점수(초 기준). 돌려주면 답에 그 점수의 줄 하나를 담는다. null 이거나
   * 손잡이가 없으면 지금처럼 줄 없이 답한다(복기·힌트 시험은 줄을 보지 않는다). 내 실수 문제의
   * 판정이 두 국면의 점수 차이를 보므로 둔다.
   */
  onceScore: ((ref: PositionRef) => { score: number; mate?: number | null } | null) | null = null;
  /**
   * true 면 탐색(analyze)의 답을 releaseSearches() 까지 붙잡는다. 풀면 그사이 stop 했어도 답을
   * 보낸다 - 진짜 엔진도 끊긴 탐색의 마지막 결과를 보낸다(engine.ts 의 runSearch 끝 flush).
   * 늦게 온 결과를 앱이 버리는지 볼 때 쓴다.
   */
  holdSearch = false;

  // --- 기록 ------------------------------------------------------------------

  /** 탐색을 시작한 국면의 열쇠(positionKey), 시작한 차례대로. */
  searches: string[] = [];
  /** 탐색을 끝내고 내놓은 수, 내놓은 차례대로. */
  answers: string[] = [];
  /** 합법수·장군을 물은 국면의 열쇠(positionKey), 물은 차례대로. */
  probes: string[] = [];
  /** 한 국면 탐색(analyzeOnce, 복기·힌트가 쓴다)을 받은 차례대로. 그때의 실력 손잡이와 탐색량까지. */
  onceCalls: { key: string; skill: number; limits: SearchLimits; answer: string | null }[] = [];

  private options: EngineOptions = { threads: 1, hashMb: 16, multiPV: 1, skill: 20, variant: "janggi" };
  private gen = 0;
  private held: (() => void)[] = [];
  private heldOnce: (() => void)[] = [];
  private heldSearch: (() => void)[] = [];

  /** 테스트를 시작할 때마다 손잡이와 기록을 처음으로 돌린다. */
  reset() {
    this.searchMs = 0;
    this.holdProbe = null;
    this.illegalAt = null;
    this.probeAnswer = null;
    this.holdOnce = false;
    this.onceScore = null;
    this.heldOnce = [];
    this.holdSearch = false;
    this.heldSearch = [];
    this.probes = [];
    this.searches = [];
    this.answers = [];
    this.onceCalls = [];
    this.held = [];
    this.gen++;
  }

  /** 붙잡아 둔 합법수 질문의 수. App 은 국면이 바뀌고 조금 뒤(0.06초)에 묻는다. */
  get heldProbes(): number {
    return this.held.length;
  }

  /** 붙잡아 둔 합법수 답을 모두 보낸다. */
  releaseProbes() {
    const held = this.held;
    this.held = [];
    for (const send of held) send();
  }

  /** 붙잡아 둔 탐색 답의 수 */
  get heldSearches(): number {
    return this.heldSearch.length;
  }

  /** 붙잡아 둔 탐색 답을 모두 보내고, 그 뒤로는 붙잡지 않는다. */
  releaseSearches() {
    this.holdSearch = false;
    const held = this.heldSearch;
    this.heldSearch = [];
    for (const send of held) send();
  }

  /** 붙잡아 둔 한 국면 탐색의 답을 모두 보내고, 그 뒤로는 붙잡지 않는다. */
  releaseOnce() {
    this.holdOnce = false;
    const held = this.heldOnce;
    this.heldOnce = [];
    for (const send of held) send();
  }

  // --- App 이 부르는 것 -------------------------------------------------------

  /**
   * 진짜 엔진은 신경망(11MB)을 뒤에서 받고 다 받으면 갈아 끼운다(engine.ts 의 loadNnue).
   * 가짜는 받을 것이 없으니 바로 끝난다.
   */
  whenStrong(): Promise<void> {
    return Promise.resolve();
  }

  async evaluationMode(): Promise<string> {
    return "NNUE evaluation (가짜 엔진)";
  }

  getOptions(): EngineOptions {
    return { ...this.options };
  }

  async setOptions(patch: Partial<EngineOptions>): Promise<void> {
    this.options = { ...this.options, ...patch };
  }

  async probe(ref: PositionRef): Promise<PositionProbe> {
    this.probes.push(positionKey(ref));
    const pos = positionOf(ref);
    const answer: PositionProbe = {
      fen: toFen(pos),
      checkers: [],
      legal: legalMoves(pos),
      ...this.probeAnswer?.(ref),
    };
    if (!this.holdProbe?.(ref)) return answer;
    return new Promise((resolve) => this.held.push(() => resolve(answer)));
  }

  /**
   * 탐색. searchMs 뒤에 둘 수를 한 번 알린다. 그 전에 stop 하면 알리지 않는다(holdSearch 로 붙잡은
   * 답은 빼고). 결과에는 설정의 MultiPV 만큼 줄을 담는다 - 합법수 앞에서부터, 점수 0.
   */
  analyze(ref: PositionRef, _limits: SearchLimits, onUpdate: (snap: AnalysisSnapshot) => void): void {
    this.searches.push(positionKey(ref));
    const gen = ++this.gen;
    const pos = positionOf(ref);
    const multiPV = this.options.multiPV;
    const send = () => {
      const move = bestMove(pos);
      if (move) this.answers.push(move);
      onUpdate(snapshotOf(move, linesOf(pos, multiPV)));
    };
    if (this.holdSearch) {
      this.heldSearch.push(send);
      return;
    }
    setTimeout(() => {
      if (gen !== this.gen) return;
      send();
    }, this.searchMs);
  }

  async analyzeOnce(ref: PositionRef, limits: SearchLimits): Promise<AnalysisSnapshot> {
    const move = bestMove(positionOf(ref));
    this.onceCalls.push({ key: positionKey(ref), skill: this.options.skill, limits, answer: move });
    const scored = this.onceScore?.(ref);
    const answer = snapshotOf(
      move,
      scored
        ? [{ multipv: 1, depth: 1, seldepth: 1, score: scored.score, mate: scored.mate ?? null, pv: move ? [move] : [] }]
        : []
    );
    if (!this.holdOnce) return answer;
    return new Promise((resolve) => this.heldOnce.push(() => resolve(answer)));
  }

  async stop(): Promise<void> {
    this.gen++;
  }

  async firstIllegalMove(_variant: Variant, _startFen: string, _moves: string[]): Promise<number | null> {
    return this.illegalAt;
  }
}

// --- 가짜 규칙 ------------------------------------------------------------------

function positionOf(ref: PositionRef): Position {
  let pos = parseFen(ref.startFen);
  for (const m of ref.moves) {
    const { from, to } = splitMove(m);
    pos = applyMove(pos, from, to);
  }
  return pos;
}

/** 둘 차례인 쪽의 기물이 앞뒤·옆 한 칸의 빈 자리로 가는 수, 그리고 한수쉼. */
function legalMoves(pos: Position): string[] {
  const moves: string[] = [];
  for (let f = 0; f < FILES; f++) {
    for (let r = 1; r <= RANKS; r++) {
      const from = sq(f, r);
      const piece = pos.board[from];
      if (!piece || sideOf(piece) !== pos.turn) continue;
      if (piece.toLowerCase() === "k") moves.push(from + from);
      for (const [df, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const tf = fileIdxOf(from) + df;
        const tr = rankOf(from) + dr;
        if (tf < 0 || tf >= FILES || tr < 1 || tr > RANKS) continue;
        const to = sq(tf, tr);
        if (!pos.board[to]) moves.push(from + to);
      }
    }
  }
  return moves;
}

function bestMove(pos: Position): string | null {
  return (
    legalMoves(pos).find((m) => {
      const { from, to } = splitMove(m);
      return from !== to;
    }) ?? null
  );
}

/** 추천 수 줄. 한수쉼이 아닌 합법수 앞에서부터 n 개. */
function linesOf(pos: Position, n: number): AnalysisSnapshot["lines"] {
  return legalMoves(pos)
    .filter((m) => {
      const { from, to } = splitMove(m);
      return from !== to;
    })
    .slice(0, n)
    .map((m, i) => ({ multipv: i + 1, depth: 1, seldepth: 1, score: 0, mate: null, pv: [m] }));
}

function snapshotOf(bestmove: string | null, lines: AnalysisSnapshot["lines"] = []): AnalysisSnapshot {
  return { lines, depth: 1, nodes: 1, nps: 1, timeMs: 1, hashfull: 0, bestmove, running: false };
}
