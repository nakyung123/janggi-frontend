// 대국 상태 판정 — 장군·외통·수몰·빅장·점수, 결과 문구, 대국자 카드의 표시
//
// 규칙 판정은 전부 엔진에게 맡긴다. 여기서는 엔진이 알려준 세 가지
// (합법수, 장군 여부, 판 위의 기물)를 사람이 읽을 말로 옮기기만 한다.
//
// 외통을 "둘 수가 하나도 없음"으로 판정하면 안 된다. 장기에는 한수쉼이 있어서
// 궁이 잡히게 생긴 자리에서도 엔진은 한수쉼 하나는 내놓기 때문이다.
// 엔진 동작을 확인해 보면 이렇게 갈린다.
//
//   피할 수 있는 장군 → 실제 도피수를 내놓는다 (한수쉼은 아예 안 준다)
//   외통             → 한수쉼 하나만 남는다
//
// 그래서 판정 기준은 "장군인데 한수쉼 말고는 둘 게 없음" 이다.

import type { Variant } from "../engine/types";
import type { Position, Square } from "./board";
import { rankOf, validate } from "./board";
import { 이가 } from "./korean";
import { splitMove } from "./notation";
import type { Side } from "./pieces";
import { SIDE_LABEL, materialScore, sideOf } from "./pieces";

export type GameStatus =
  /** 궁이 없거나 둘인 판처럼 대국으로 성립하지 않는 국면(이상한 기보를 불러왔을 때) */
  | { kind: "invalid"; problems: string[] }
  /** 외통 — 장군을 맞았는데 피할 수가 없다 */
  | { kind: "checkmate"; loser: Side; winner: Side }
  /** 수몰 — 장군은 아닌데 둘 수 있는 수가 없다 */
  | { kind: "stalemate"; loser: Side; winner: Side }
  /** 장군 — 아직 피할 수 있다 */
  | { kind: "check"; side: Side; by: Square[] }
  /**
   * 빅장이 걸렸다 — 두 궁이 한 줄에서 사이에 아무것도 없이 마주 본다.
   * side(둘 차례)가 궁을 비키거나 기물로 막아 풀고, 한수쉼을 두면 빅장을 받아
   * 판이 끝난다(bikjang). 궁을 그 줄에 둔 채 옮기는 수는 엔진이 주지 않는다.
   */
  | { kind: "facing"; side: Side }
  /** 수 제한에 걸려 점수로 갈렸다 */
  | { kind: "points"; winner: Side | null; cho: number; han: number }
  /** 빅장을 받아 끝났다. 점수제 규칙이면 점수로 갈리고, 아니면(전통) 비긴다 */
  | { kind: "bikjang"; winner: Side | null; cho: number; han: number }
  /** 양쪽이 한수쉼을 이어 두어 끝났다. 점수제 규칙이면 점수로, 아니면 비긴다 */
  | { kind: "passes"; winner: Side | null; cho: number; han: number }
  | { kind: "playing" };

/**
 * 수 제한. 이 수를 넘기면 점수로 승부를 가린다.
 *
 * 카카오장기가 쓰는 값이라 그대로 맞췄다. 여기서 어긋나면 그쪽에서 온 사람은
 * 끝나야 할 판이 안 끝난다고 느낀다. 양쪽을 합한 총 수(플라이)다.
 */
export const MOVE_LIMIT = 200;

/** 출발과 도착이 같은 수 = 한수쉼 */
function isPassMove(move: string): boolean {
  const { from, to } = splitMove(move);
  return Boolean(from) && from === to;
}

/** 수순 끝에서부터 한수쉼이 몇 번 이어졌는지. 양쪽이 이어 쉬면(2) 판이 끝난다. */
export function trailingPasses(moves: string[]): number {
  let n = 0;
  for (let i = moves.length - 1; i >= 0 && isPassMove(moves[i]); i--) n++;
  return n;
}

/** 두 궁이 한 줄(세로)에서 사이에 아무 기물 없이 마주 보는지. 빅장이다. */
export function kingsFacing(position: Position): boolean {
  let cho: Square | null = null;
  let han: Square | null = null;
  for (const [square, piece] of Object.entries(position.board)) {
    if (piece === "K") cho = square;
    else if (piece === "k") han = square;
  }
  if (!cho || !han || cho[0] !== han[0]) return false;
  const lo = Math.min(rankOf(cho), rankOf(han));
  const hi = Math.max(rankOf(cho), rankOf(han));
  for (let r = lo + 1; r < hi; r++) {
    if (position.board[cho[0] + r]) return false;
  }
  return true;
}

/**
 * 규칙마다 판정에 쓰는 것이 있는지. 대국 탭과 분석판이 같이 쓴다 - 두 곳이 따로 정하면 규칙을
 * 더하거나 고칠 때 같은 국면을 다르게 판정한다.
 *   pointsRule  점수제(200수·빅장·양쪽 한수쉼을 점수로 가림). 전통 규칙은 없고 비긴다.
 *   bikjangRule 빅장. 현대(카카오) 규칙에서는 두 궁이 마주 봐도 아무 일이 없다.
 */
export function variantRules(variant: Variant): { pointsRule: boolean; bikjangRule: boolean } {
  return {
    pointsRule: variant !== "janggitraditional",
    bikjangRule: variant !== "janggimodern",
  };
}

export interface StatusInput {
  position: Position;
  legal: Set<string>;
  checkers: string[];
  /** 엔진 응답을 아직 못 받았으면 판정을 미룬다 */
  ready: boolean;
  /** 지금까지 둔 총 수. 수 제한을 재는 데 쓴다. */
  plies?: number;
  /** 점수제를 쓰는 규칙인지. 전통 규칙에는 점수제가 없다. */
  pointsRule?: boolean;
  /** 빅장 규칙을 쓰는지. 현대(카카오) 규칙에는 없다. */
  bikjangRule?: boolean;
  /** 수순 끝에서부터 이어진 한수쉼 수(trailingPasses). */
  passesInRow?: number;
}

export function gameStatus(input: StatusInput): GameStatus {
  const { position, legal, checkers, ready } = input;

  const problems = validate(position);
  if (problems.length > 0) return { kind: "invalid", problems };

  // 엔진 응답 전에는 "수가 없다"를 대국 종료로 오해하면 안 된다.
  if (!ready) return { kind: "playing" };

  const loser = position.turn;
  const winner: Side = loser === "cho" ? "han" : "cho";

  // 한수쉼은 궁이 제자리로 가는 수로 표기된다. 그것 말고 실제로 둘 수 있는 수.
  const realMoves = [...legal].filter((m) => !isPassMove(m));

  if (realMoves.length === 0) {
    if (checkers.length > 0) return { kind: "checkmate", loser, winner };
    // 한수쉼만 가능한 평범한 국면은 아직 대국 중
    if (legal.size > 0) return { kind: "playing" };
    return endedWithoutMoves(input, loser, winner);
  }

  // 외통이 먼저다. 제한 수에 걸리는 그 수가 외통이면 점수가 아니라 외통으로 끝난다.
  if (input.pointsRule && (input.plies ?? 0) >= MOVE_LIMIT) {
    const s = scoreBoard(position);
    return { kind: "points", winner: s.leader, cho: s.cho, han: s.han };
  }

  if (checkers.length > 0) {
    return { kind: "check", side: position.turn, by: checkers };
  }
  if (input.bikjangRule && kingsFacing(position)) {
    return { kind: "facing", side: position.turn };
  }
  return { kind: "playing" };
}

/*
 * 장군이 아닌데 엔진이 둘 수를 하나도 내놓지 않는 국면.
 *
 * 장기에는 한수쉼이 있어서 장군만 아니면 둘 수가 늘 하나는 있다. 그런데도 엔진이
 * 한수쉼까지 거두는 것은 규칙으로 판이 끝났다는 뜻이다. 엔진(Fairy-Stockfish)에
 * 물어 확인한 경우는 둘이다.
 *
 *   빅장을 받았다   두 궁이 마주 본 채 받은 쪽이 한수쉼을 뒀다 (표준·전통)
 *   양쪽 한수쉼     두 쪽이 한수쉼을 이어 뒀다 (세 규칙 모두)
 *
 * 둘 다 점수제 규칙(표준·현대)이면 덤을 넣은 점수로, 전통이면 비김으로 갈린다.
 * 이것을 '수몰'(둘 차례인 쪽의 패)로 읽으면, 전통 규칙에서 엔진이 비기려고
 * 한수쉼으로 빅장을 받은 판이 내 패로 적힌다. 수몰은 이 둘이 아닐 때만 남긴다.
 */
function endedWithoutMoves(input: StatusInput, loser: Side, winner: Side): GameStatus {
  const { position } = input;
  const s = scoreBoard(position);
  const byRule = input.pointsRule ? s.leader : null;
  if (input.bikjangRule && kingsFacing(position)) {
    return { kind: "bikjang", winner: byRule, cho: s.cho, han: s.han };
  }
  if ((input.passesInRow ?? 0) >= 2) {
    return { kind: "passes", winner: byRule, cho: s.cho, han: s.han };
  }
  return { kind: "stalemate", loser, winner };
}

export const isGameOver = (s: GameStatus): boolean =>
  s.kind === "checkmate" ||
  s.kind === "stalemate" ||
  s.kind === "points" ||
  s.kind === "bikjang" ||
  s.kind === "passes";

/** 대국이 끝나는 일곱 가지 길. */
export type OutcomeKind =
  | "checkmate"
  | "stalemate"
  | "points"
  | "bikjang"
  | "passes"
  | "resign"
  | "flag";

export interface Outcome {
  /**
   * 어떻게 끝났는지. record 는 파일에서 불러온 기보다 - 누가 이겼는지만 적혀
   * 있고 어떻게 끝났는지는 모른다(기보 형식 janggi-board/2 에 그 칸이 없다).
   */
  kind: OutcomeKind | "record";
  /** 이긴 쪽. 점수가 같아 비겼으면 null */
  winner: Side | null;
}

/**
 * 대국이 어떻게 끝났는지 한곳에서 답한다.
 *
 * 끝나는 길이 다섯인데 쓰는 자리마다 따로 훑다 보니 매번 몇 가지가 빠졌다.
 * 기보에 적는 승부에서는 시간패와 점수가 빠져 전부 'unfinished' 로 저장됐고,
 * 대국 패널의 결과 줄에서는 수몰과 점수가 빠져 판이 끝났는데 아무 말도 없었고,
 * 기권 버튼은 그 두 경우에 끝난 판에서도 눌렸다. 같은 실수가 세 군데서 따로
 * 났으니 목록을 각자 들고 있는 것이 문제다. 여기서 한 번 답하고 나머지는 묻는다.
 *
 * 기권과 시간패가 먼저다. 둘은 '국면' 이 아니라 '대국' 에 붙는 결과라 기보를
 * 되짚는 중에도 그대로인 반면, 나머지 셋은 지금 보고 있는 국면의 판정이다.
 */
export function outcomeOf(
  status: GameStatus,
  resigned: Side | null,
  flagged: Side | null
): Outcome | null {
  if (resigned) return { kind: "resign", winner: resigned === "cho" ? "han" : "cho" };
  if (flagged) return { kind: "flag", winner: flagged === "cho" ? "han" : "cho" };
  if (status.kind === "checkmate") return { kind: "checkmate", winner: status.winner };
  if (status.kind === "stalemate") return { kind: "stalemate", winner: status.winner };
  if (status.kind === "points") return { kind: "points", winner: status.winner };
  if (status.kind === "bikjang") return { kind: "bikjang", winner: status.winner };
  if (status.kind === "passes") return { kind: "passes", winner: status.winner };
  return null;
}

const OUTCOME_HOW: Record<Outcome["kind"], string> = {
  checkmate: "외통",
  stalemate: "둘 수가 없음",
  points: `${MOVE_LIMIT}수 점수`,
  bikjang: "빅장",
  passes: "양쪽 한수쉼",
  resign: "기권",
  flag: "시간패",
  record: "불러온 기보",
};

/** 끝난 사연을 한 줄로. "외통 - 초가 이겼습니다." */
export function outcomeMessage(o: Outcome): string {
  const how = OUTCOME_HOW[o.kind];
  if (o.winner === null) return `${how} - 비겼습니다.`;
  return `${how} - ${이가(SIDE_LABEL[o.winner])} 이겼습니다.`;
}

/** 화면 읽기 프로그램에 알릴 한 줄. 상태마다 말투가 다르다. */
export function statusMessage(s: GameStatus): string | null {
  switch (s.kind) {
    case "checkmate":
      return `외통 - ${SIDE_LABEL[s.winner]} 승`;
    case "stalemate":
      return `둘 수가 없습니다 - ${SIDE_LABEL[s.winner]} 승`;
    case "check":
      return `${SIDE_LABEL[s.side]} 장군`;
    case "points":
      return s.winner === null
        ? `${MOVE_LIMIT}수 - 점수가 같아 비겼습니다 (${s.cho} : ${s.han})`
        : `${MOVE_LIMIT}수 - 점수로 ${SIDE_LABEL[s.winner]} 승 (${s.cho} : ${s.han})`;
    case "facing":
      return `${SIDE_LABEL[s.side]} 빅장`;
    case "bikjang":
    case "passes": {
      const how = s.kind === "bikjang" ? "빅장" : "양쪽 한수쉼";
      return s.winner === null
        ? `${how} - 비겼습니다`
        : `${how} - 점수로 ${SIDE_LABEL[s.winner]} 승 (${s.cho} : ${s.han})`;
    }
    case "invalid":
      return "대국으로 성립하지 않는 국면입니다";
    default:
      return null;
  }
}

/** 대국자 카드의 '둘 차례' 자리에 대신 서는 말. */
export interface SideTag {
  text: string;
  tone: "check" | "win" | "lose" | "draw";
}

/** 진 쪽 카드에 적을 말. 어떻게 졌는지까지 적는다. */
const LOSE_TAG: Record<Outcome["kind"], string> = {
  checkmate: "외통패",
  stalemate: "패",
  points: "점수패",
  bikjang: "빅장패",
  passes: "점수패",
  resign: "기권패",
  flag: "시간패",
  record: "패",
};

/**
 * 대국자 카드에 붙일 표시.
 *
 * 장군·빅장·승패는 판 위 배너가 아니라 높이가 박힌 카드의 '둘 차례' 자리에서
 * 말한다. 배너는 뜰 때마다 판을 그 높이만큼 줄였다 늘린다. 장군을 맞은 쪽은 늘
 * 둘 차례라 그 자리가 곧 알릴 자리다.
 *
 * 끝난 판이면 결과가 먼저다. 외통도 장군이지만 그때 할 말은 '외통패' 다.
 */
export function sideTag(
  status: GameStatus,
  outcome: Outcome | null,
  side: Side
): SideTag | null {
  if (outcome) {
    if (outcome.winner === null) return { text: "무승부", tone: "draw" };
    return outcome.winner === side
      ? { text: "승", tone: "win" }
      : { text: LOSE_TAG[outcome.kind], tone: "lose" };
  }
  if (status.kind === "check" && status.side === side) {
    return { text: "장군", tone: "check" };
  }
  // 빅장도 받은 쪽이 지금 무언가 해야 하는 일이라 장군과 같은 칸에 띄운다.
  if (status.kind === "facing" && status.side === side) {
    return { text: "빅장", tone: "check" };
  }
  return null;
}

export interface ScoreBoard {
  cho: number;
  han: number;
  /** 앞선 쪽. 같으면 null */
  leader: Side | null;
  diff: number;
}

/**
 * 장기 점수제. 한(漢)은 후수라서 1.5점 덤을 미리 받는다.
 * 대국이 길어져 점수로 가릴 때 이 숫자가 승부를 정한다.
 */
export function scoreBoard(position: Position): ScoreBoard {
  const pieces = Object.values(position.board);
  const cho = materialScore(pieces, "cho");
  const han = materialScore(pieces, "han");
  const diff = Math.abs(cho - han);
  return {
    cho,
    han,
    leader: cho === han ? null : cho > han ? "cho" : "han",
    diff,
  };
}

/** 판에서 사라진 기물 목록. 잡힌 기물을 보여줄 때 쓴다. */
export function capturedPieces(position: Position, side: Side): string[] {
  // 처음 판에 있던 구성
  const full = ["r", "r", "n", "n", "b", "b", "a", "a", "c", "c", "p", "p", "p", "p", "p"];
  const alive = Object.values(position.board)
    .filter((p) => sideOf(p) === side)
    .map((p) => p.toLowerCase())
    .filter((t) => t !== "k");

  const rest = [...alive];
  const lost: string[] = [];
  for (const type of full) {
    const at = rest.indexOf(type);
    if (at === -1) lost.push(type);
    else rest.splice(at, 1);
  }
  return lost;
}
