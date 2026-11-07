// 국면 만들기 - 분석판에서 기물을 놓고 빼고 옮기는 규칙과, 엔진에 넘기기 전 국면 검사
//
// 놓을 때 막을 수 있는 것은 놓을 때 막는다. 나중에 목록으로 알리면 무엇을 고쳐야 하는지 판에서
// 찾아야 한다.
//
//   놓을 때 막는 것   기물 수(한쪽에 궁 1, 사·상·마·포·차 2, 졸 5), 궁·사는 제 궁성 안,
//                    졸·병은 처음 줄보다 뒤에 못 놓음(뒤로 가지 못해 대국에서 생길 수 없다)
//   목록으로 알리는 것 궁이 없음, 둘 차례가 아닌 쪽의 궁이 장군을 받음 - 판 전체를 봐야 안다
//
// **잘못된 국면은 엔진에 넘기지 않는다.** 엔진은 죽지는 않지만 엉뚱하게 답한다. 궁이 없는 판에도
// 합법수를 내고, 둘 차례가 아닌 쪽 궁이 장군을 받는 판에서는 그 궁을 잡는 수를 내놓는다
// (2026-11-07 분석판 설계 때 엔진에 넣어 확인). 그래서 setupProblems 가 빈 목록일 때만 넘긴다.
//
// 빅장(두 궁이 마주 봄)과 외통·수몰 국면은 막지 않는다. 대국에서 생기는 국면이고, 판정은 엔진이 한다.
//
// board.ts 의 validate(궁 수·궁성)는 불러온 기보의 판정(status.ts 의 gameStatus)도 쓰므로 고치지
// 않고, 여기서 그 위에 더 본다.

import type { Board, Position, Square } from "./board";
import { palaceOf, rankOf, validate } from "./board";
import { 은는, 이가 } from "./korean";
import { pieceMoves } from "./moves";
import type { PieceChar, PieceType, Side } from "./pieces";
import { SIDE_LABEL, pieceInfo, sideOf, typeOf } from "./pieces";

/** 한쪽이 놓을 수 있는 기물 수. 처음 차림과 같다. */
export const MAX_COUNT: Record<PieceType, number> = { k: 1, a: 2, b: 2, n: 2, c: 2, r: 2, p: 5 };

/** 졸·병이 처음 놓이는 줄. 초는 4단, 한은 7단이고 그보다 뒤로는 가지 못한다. */
const PAWN_START: Record<Side, number> = { cho: 4, han: 7 };

const countOf = (board: Board, piece: PieceChar): number =>
  Object.values(board).filter((c) => c === piece).length;

/**
 * 이 기물을 더 놓을 수 없는지(한쪽에 놓을 수 있는 만큼 다 놓았는지). 궁은 늘 거짓이다 - 하나뿐이라
 * 다시 놓으면 옮겨 간다(placePiece).
 */
export function isFull(board: Board, piece: PieceChar): boolean {
  if (typeOf(piece) === "k") return false;
  return countOf(board, piece) >= MAX_COUNT[typeOf(piece)];
}

/** 이 기물이 이 자리에 놓일 수 있는지. 궁성(궁·사)과 졸 줄만 본다. */
export function allowedAt(piece: PieceChar, square: Square): boolean {
  const side = sideOf(piece);
  switch (typeOf(piece)) {
    case "k":
    case "a":
      return palaceOf(square) === side;
    case "p":
      return side === "cho" ? rankOf(square) >= PAWN_START.cho : rankOf(square) <= PAWN_START.han;
    default:
      return true;
  }
}

/** 이 자리에 놓을 수 없는 까닭. 놓을 수 있으면 null. */
function placeReason(piece: PieceChar, square: Square): string | null {
  if (allowedAt(piece, square)) return null;
  const name = pieceInfo(piece).name;
  return typeOf(piece) === "p"
    ? `${은는(name)} 뒤로 가지 못해서 처음 줄보다 뒤에는 놓을 수 없습니다.`
    : `${은는(name)} 궁성 안에만 놓을 수 있습니다.`;
}

/**
 * piece 를 square 에 놓을 수 없는 까닭. 놓을 수 있으면 null.
 * 그 자리에 있던 같은 기물을 다시 놓는 것은 셈이 늘지 않으므로 막지 않는다.
 */
export function placeRefusal(board: Board, piece: PieceChar, square: Square): string | null {
  const where = placeReason(piece, square);
  if (where) return where;
  if (board[square] === piece) return null;
  if (isFull(board, piece)) {
    const max = MAX_COUNT[typeOf(piece)];
    return `${SIDE_LABEL[sideOf(piece)]}의 ${은는(pieceInfo(piece).name)} ${max}개까지 놓을 수 있습니다.`;
  }
  return null;
}

/**
 * piece 를 square 에 놓는다. 있던 기물은 없어진다. 놓을 수 없으면 board 를 그대로 돌려준다.
 * 궁은 하나라, 이미 있으면 그 궁을 옮긴다.
 */
export function placePiece(board: Board, piece: PieceChar, square: Square): Board {
  if (placeRefusal(board, piece, square)) return board;
  if (board[square] === piece) return board;
  const next: Board = {};
  for (const [s, c] of Object.entries(board)) {
    if (typeOf(piece) === "k" && c === piece) continue;
    next[s] = c;
  }
  next[square] = piece;
  return next;
}

/** square 의 기물을 뺀다. 비어 있으면 board 를 그대로 돌려준다. */
export function removePiece(board: Board, square: Square): Board {
  if (!board[square]) return board;
  const next = { ...board };
  delete next[square];
  return next;
}

/** from 의 기물을 to 로 옮긴다. to 에 있던 기물은 없어진다. 궁성·졸 줄에 어긋나면 그대로 돌려준다. */
export function movePiece(board: Board, from: Square, to: Square): Board {
  const piece = board[from];
  if (!piece || from === to || !allowedAt(piece, to)) return board;
  const next = { ...board };
  delete next[from];
  next[to] = piece;
  return next;
}

/** 옮길 때 그 자리로 갈 수 없는 까닭(궁성·졸 줄). 갈 수 있으면 null. */
export function moveRefusal(board: Board, from: Square, to: Square): string | null {
  const piece = board[from];
  return piece ? placeReason(piece, to) : null;
}

/** side 의 궁을 상대 기물이 노리는지. 행마 계산(moves.ts)으로 본다 - 엔진에 넘기기 전이라서. */
function inCheck(board: Board, side: Side): boolean {
  const king = Object.entries(board).find(([, c]) => c === (side === "cho" ? "K" : "k"))?.[0];
  if (!king) return false;
  return Object.entries(board).some(
    ([s, c]) => sideOf(c) !== side && pieceMoves(board, s).includes(king)
  );
}

/**
 * 엔진에 넘기기 전에 고쳐야 할 것들. 빈 목록이면 넘겨도 된다.
 *
 * 놓을 때 막는 것(개수·졸 줄)도 여기서 한 번 더 본다. 대국 판을 가져온 국면이나 앞으로 다른 곳에서
 * 들어올 국면(끝내기 연습의 정해 둔 국면 등)은 놓기를 거치지 않는다.
 */
export function setupProblems(pos: Position): string[] {
  const problems = validate(pos);

  for (const side of ["cho", "han"] as Side[]) {
    for (const type of Object.keys(MAX_COUNT) as PieceType[]) {
      if (type === "k") continue; // 궁 수는 validate 가 본다
      const piece = (side === "cho" ? type.toUpperCase() : type) as PieceChar;
      const n = countOf(pos.board, piece);
      if (n > MAX_COUNT[type]) {
        problems.push(
          `${SIDE_LABEL[side]}의 ${이가(pieceInfo(piece).name)} ${n}개입니다. ${MAX_COUNT[type]}개까지 놓을 수 있습니다.`
        );
      }
    }
  }

  for (const [square, piece] of Object.entries(pos.board)) {
    if (typeOf(piece) === "p" && !allowedAt(piece, square)) {
      problems.push(
        `${square}: ${SIDE_LABEL[sideOf(piece)]}의 ${은는(pieceInfo(piece).name)} 처음 줄보다 뒤에 있을 수 없습니다.`
      );
    }
  }

  // 궁이 모자라거나 남으면 장군을 따질 수 없다. 그 까닭이 이미 목록에 있다.
  if (problems.length === 0) {
    const waiting: Side = pos.turn === "cho" ? "han" : "cho";
    if (inCheck(pos.board, waiting)) {
      problems.push(
        `${SIDE_LABEL[pos.turn]} 차례인데 ${SIDE_LABEL[waiting]}의 궁이 장군을 받고 있습니다. 둘 차례를 바꾸거나 기물을 옮기세요.`
      );
    }
  }

  return problems;
}
