// 장기판 — 나무판, 기물, 판 위 표시, 눌러서·끌어서 두기
//
// 장기는 칸이 아니라 '선의 교차점' 위에 기물을 놓는다. 그래서 칸을 그리는 대신
// 격자선을 긋고 교차점마다 기물을 얹는다. 궁성에는 사선이 추가로 들어간다.
//
// 판은 규칙을 모른다. 어느 기물을 집을 수 있는지(canPick)와 어디로 갈 수 있는지
// (targets)는 App 이 엔진에게 받은 합법수로 정해 넘긴다.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Board as BoardMap, Square } from "../../janggi/board";
import { FILES, RANKS, fileIdxOf, rankOf, sq } from "../../janggi/board";
import { toJanggiCoord } from "../../janggi/notation";
import { SIDE_LABEL, pieceInfo, sideOf } from "../../janggi/pieces";
import type { PieceChar } from "../../janggi/pieces";
import { CheckCallout } from "./CheckCallout";
import { PieceBody, PieceDefs } from "./PieceGlyph";

const CELL = 62;
/*
 * 격자 바깥 여백.
 *
 * 판에 좌표 숫자를 그리지 않으므로 가장자리 기물이 판 밖으로 비어져 나오지 않을
 * 만큼만 있으면 된다. 가장 큰 가장자리 기물인 차의 반지름이 26.2 이고 팔각형의
 * 가로 반폭이 24.2 라, 30 이면 5.8px 이 남는다. 격자가 판 넓이의 89% 를 차지한다.
 */
const MARGIN = 30;
const WIDTH = (FILES - 1) * CELL + MARGIN * 2;
const HEIGHT = (RANKS - 1) * CELL + MARGIN * 2;

export interface BoardProps {
  board: BoardMap;
  flipped: boolean;
  selected: Square | null;
  /** 지금 고른 기물이 갈 수 있는 곳 */
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  /** 복기한 판에서 고른 수 대신 뒀어야 할 수. 파란 화살표. */
  bestMove: { from: Square; to: Square } | null;
  /** 장군을 맞은 궁의 자리 */
  checkedKing?: Square | null;
  onSquareClick: (square: Square) => void;
  onMove: (from: Square, to: Square) => void;
  /**
   * 기물을 집어 들었다(누르는 순간). 부르는 쪽이 그 기물을 고른 것으로 삼아 갈 곳을
   * 띄운다. 끌어서 둘 때도 쥐고 있는 동안 어디로 갈 수 있는지 보여야 한다 - 초보일수록
   * 기물을 쥐고 갈 곳을 보면서 옮긴다.
   */
  onPick?: (square: Square) => void;
  /**
   * 이 기물을 집어 들 수 있는지. 없으면 전부 들린다.
   * 눌러서 고르기와 끌기가 같은 조건을 쓴다 - 끌기만 막지 않으면 초를 잡고 있는데
   * 한의 차가 손에 딸려 오고, 엔진이 생각하는 동안에도 기물이 들린다.
   */
  canPick?: (square: Square) => boolean;
  /**
   * 방금 둔 수. 있으면 도착한 기물이 출발 자리에서 날아온다 - 순간이동하듯 나타나면
   * 엔진이 어느 기물을 움직였는지 판을 훑어야 안다. 끌어서 둔 수는 손으로 이미
   * 옮겼으므로 부르는 쪽이 넘기지 않는다. 잡힌 기물은 날아오는 동안 제자리에서
   * 사라진다. key 가 바뀔 때마다 한 번 난다.
   */
  flyMove?: { from: Square; to: Square; captured?: PieceChar; key: number } | null;
  /** 장군·멍군·빅장. 판 가운데에 잠깐 떴다 사라진다(CheckCallout). key 가 바뀔 때마다 한 번. */
  callout?: { text: string; key: number } | null;
}

export function Board(props: BoardProps) {
  const {
    board,
    flipped,
    selected,
    targets,
    lastMove,
    bestMove,
    checkedKing,
    onSquareClick,
    onMove,
    onPick,
    canPick,
    flyMove,
    callout,
  } = props;

  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{
    from: Square;
    x: number;
    y: number;
    /** 이번에 누르면서 기물을 골랐는지. 뗄 때 도로 놓지 않으려고 기억한다. */
    picked: boolean;
    /**
     * 들 수 없는 기물을 누른 것. 기물은 제자리에 두고 '누름' 으로만 넘긴다.
     * 고른 내 기물로 잡으려고 상대 기물을 누른 것일 수 있어서 누름 자체는 살린다.
     */
    held: boolean;
  } | null>(null);

  /*
   * 들 수 있는 기물에서 시작한 손길은 쪽을 밀지 않는다.
   *
   * 폰에서는 판 위에서도 쪽이 위아래로 밀리게 풀어 뒀다(board.css). 그대로 두면 내
   * 기물을 위로 끌 때 브라우저가 그것을 스크롤로 가져가 끌기가 끊긴다. 스크롤을 막는
   * 것은 touchstart 에서만 되고, React 가 거는 touchstart 는 passive 라 막지 못해서
   * 직접 건다. 들 수 없는 기물(.fixed)과 빈 자리는 건드리지 않는다 - 거기서는 밀려야 한다.
   */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const holdPage = (e: TouchEvent) => {
      const piece = (e.target as Element | null)?.closest?.(".piece");
      if (piece && !piece.classList.contains("fixed") && e.cancelable) e.preventDefault();
    };
    svg.addEventListener("touchstart", holdPage, { passive: false });
    return () => svg.removeEventListener("touchstart", holdPage);
  }, []);

  // 화면 좌표 ↔ 교차점 --------------------------------------------------
  const xOf = useCallback(
    (fileIdx: number) => MARGIN + (flipped ? FILES - 1 - fileIdx : fileIdx) * CELL,
    [flipped]
  );
  const yOf = useCallback(
    (rank: number) => MARGIN + (flipped ? rank - 1 : RANKS - rank) * CELL,
    [flipped]
  );
  const posOf = useCallback(
    (square: Square) => ({ x: xOf(fileIdxOf(square)), y: yOf(rankOf(square)) }),
    [xOf, yOf]
  );

  /** 포인터 위치를 SVG 좌표로 바꾼 뒤 가장 가까운 교차점을 찾는다. */
  const locate = useCallback(
    (e: React.PointerEvent): { square: Square | null; x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { square: null, x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
      const y = ((e.clientY - rect.top) / rect.height) * HEIGHT;

      const rawFile = Math.round((x - MARGIN) / CELL);
      const rawRank = Math.round((y - MARGIN) / CELL);
      const fileIdx = flipped ? FILES - 1 - rawFile : rawFile;
      const rank = flipped ? rawRank + 1 : RANKS - rawRank;

      if (fileIdx < 0 || fileIdx >= FILES || rank < 1 || rank > RANKS) {
        return { square: null, x, y };
      }
      // 교차점에서 너무 멀면 놓을 곳으로 치지 않는다.
      const target = sq(fileIdx, rank);
      const p = { x: xOf(fileIdx), y: yOf(rank) };
      const far = Math.hypot(x - p.x, y - p.y) > CELL * 0.62;
      return { square: far ? null : target, x, y };
    },
    [flipped, xOf, yOf]
  );

  const handlePointerDown = (e: React.PointerEvent, square: Square) => {
    if (!board[square]) return;
    e.preventDefault();
    /*
     * 포인터를 이 기물에 묶어두면 손가락이 기물 밖으로 나가도 끌기가 이어진다.
     * 다만 없어도 되는 편의라, 실패한다고 집어 드는 것까지 막으면 안 된다.
     * 브라우저가 모르는 포인터면 던지는데, 그러면 아래가 통째로 건너뛰어져
     * 갈 곳 표시도 끌기도 죽는다.
     */
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // 캡처 없이 진행한다.
    }
    const { x, y } = locate(e);

    if (canPick && !canPick(square)) {
      setDrag({ from: square, x, y, picked: false, held: true });
      return;
    }

    /*
     * 누르는 순간 기물을 골라 갈 곳을 띄운다.
     *
     * 이미 고른 기물의 '갈 곳' 을 누른 것이면 집어 드는 게 아니라 거기로 두려는
     * 것이므로 건드리지 않는다.
     */
    const picked = selected !== square && !targets.includes(square);
    if (picked) onPick?.(square);

    setDrag({ from: square, x, y, picked, held: false });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag || drag.held) return;
    const { x, y } = locate(e);
    setDrag({ ...drag, x, y });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const { square } = locate(e);
    const from = drag.from;
    setDrag(null);

    // 들 수 없는 기물은 그 자리에서 뗐을 때만 누른 것으로 친다.
    if (drag.held) {
      if (square === from) onSquareClick(from);
      return;
    }

    // 판 밖으로 끌어냈으면 제자리로 돌아간다.
    if (!square) return;
    if (square === from) {
      // 누르면서 방금 고른 것이면 그대로 둔다. 여기서 또 부르면 고르자마자
      // 도로 놓여서, 끌지 않고 한 번 누른 경우에 갈 곳이 번쩍이고 사라진다.
      if (!drag.picked) onSquareClick(from);
      return;
    }
    onMove(from, square);
  };

  const targetSet = new Set(targets);

  // 격자선 -------------------------------------------------------------
  const lines: React.ReactNode[] = [];
  for (let f = 0; f < FILES; f++) {
    lines.push(
      <line
        key={"v" + f}
        x1={MARGIN + f * CELL}
        y1={MARGIN}
        x2={MARGIN + f * CELL}
        y2={HEIGHT - MARGIN}
      />
    );
  }
  for (let r = 0; r < RANKS; r++) {
    lines.push(
      <line
        key={"h" + r}
        x1={MARGIN}
        y1={MARGIN + r * CELL}
        x2={WIDTH - MARGIN}
        y2={MARGIN + r * CELL}
      />
    );
  }

  // 궁성 사선. 위/아래 궁성 각각 X자 두 줄. -----------------------------
  const palaceDiagonals = [
    [sq(3, 10), sq(5, 8)],
    [sq(5, 10), sq(3, 8)],
    [sq(3, 3), sq(5, 1)],
    [sq(5, 3), sq(3, 1)],
  ].map(([a, b], i) => {
    const p = posOf(a);
    const q = posOf(b);
    return <line key={"d" + i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
  });

  // 좌표 숫자는 판에 그리지 않는다. 판이 그만큼 커지고, 실물 장기판에도 없다.

  const renderPiece = (square: Square, dragging: boolean) => {
    const piece = board[square];
    if (!piece) return null;
    const info = pieceInfo(piece);
    const p = dragging && drag ? { x: drag.x, y: drag.y } : posOf(square);
    const r = (CELL / 2) * info.size * 0.94;

    // 들 수 없는 기물은 손 모양 커서도 주지 않는다. 쥐어질 것처럼 보이면 안 된다.
    // 다만 고른 내 기물로 잡을 수 있는 상대 기물은 누를 곳이라 손가락 커서다.
    const fixed = canPick !== undefined && !canPick(square);
    const takeable = fixed && targetSet.has(square);

    // 방금 도착한 기물이면 출발 자리만큼 거꾸로 밀어 두고 제자리로 날려 보낸다.
    // 판을 뒤집었으면 posOf 가 이미 뒤집힌 좌표를 주므로 차이도 맞게 나온다.
    const flying = !dragging && flyMove && flyMove.to === square ? flyMove : null;
    const from = flying ? posOf(flying.from) : null;
    const body = <PieceBody piece={piece} radius={r} />;

    return (
      <g
        key={square}
        data-piece={square}
        className={
          "piece" +
          (dragging ? " dragging" : "") +
          (fixed ? " fixed" : "") +
          (takeable ? " takeable" : "")
        }
        transform={`translate(${p.x} ${p.y})`}
        onPointerDown={(e) => handlePointerDown(e, square)}
        style={{ opacity: drag && drag.from === square && !dragging && !drag.held ? 0.25 : 1 }}
      >
        {flying && from ? (
          <g
            key={flying.key}
            className="fly"
            style={
              {
                "--fly-x": `${from.x - p.x}px`,
                "--fly-y": `${from.y - p.y}px`,
              } as React.CSSProperties
            }
          >
            {body}
          </g>
        ) : (
          body
        )}
      </g>
    );
  };

  const squares: Square[] = [];
  for (let r = 1; r <= RANKS; r++) {
    for (let f = 0; f < FILES; f++) squares.push(sq(f, r));
  }

  /** 화면에 보이는 가로줄. 위에서 아래, 줄 안에서는 왼쪽에서 오른쪽. */
  const displayRows: Square[][] = [];
  for (let y = 0; y < RANKS; y++) {
    const rank = flipped ? y + 1 : RANKS - y;
    const row: Square[] = [];
    for (let x = 0; x < FILES; x++) row.push(sq(flipped ? FILES - 1 - x : x, rank));
    displayRows.push(row);
  }

  /** 교차점 이름. 기물이 있으면 "73 초 졸", 없으면 "63". */
  const cellName = (square: Square) => {
    const piece = board[square];
    const coord = toJanggiCoord(square);
    return piece ? `${coord} ${SIDE_LABEL[sideOf(piece)]} ${pieceInfo(piece).name}` : coord;
  };

  const arrows = [
    bestMove && { key: "best", cls: "best-arrow", m: bestMove, head: "arrowBest" },
  ].filter(Boolean) as {
    key: string;
    cls: string;
    m: { from: Square; to: Square };
    head: string;
  }[];

  return (
    <svg
      ref={svgRef}
      className="board"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#f3dcac" />
          <stop offset="52%" stopColor="#ecd19b" />
          <stop offset="100%" stopColor="#e2c081" />
        </linearGradient>
        {/* 세로 나무결. 아주 옅게 깔아야 격자선을 방해하지 않는다. */}
        <pattern id="grain" width="31" height="4" patternUnits="userSpaceOnUse">
          <path d="M5 0 V4" stroke="#7a5420" strokeWidth="0.8" opacity="0.028" />
          <path d="M14 0 V4" stroke="#fffaf0" strokeWidth="1.4" opacity="0.13" />
          <path d="M23 0 V4" stroke="#7a5420" strokeWidth="0.6" opacity="0.02" />
        </pattern>
        {/*
          직전 수 자리에 깔리는 흰 발광. 색 상자는 밝은 나무색 위에서 회색 얼룩이
          되고 장기판에 없는 물건으로 떠 보인다. 흰빛은 같은 나무판이 그 자리만
          '밝아진' 것으로 읽혀서 기물을 가리지 않는다.
        */}
        <radialGradient id="lastGlow">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/*
          도착 자리도 같은 발광을 쓰고 크기만 키운다(0.8칸). 같은 크기면 기물이
          가운데를 덮어 가장자리의 옅은 테두리만 남는다. 도착 자리에만 진한 발광을
          쓰면 기물 둘레에 흰 고리가 박혀 도착 쪽만 유독 밝다. 같은 그라디언트를 넓게
          펴면 기물 밖으로 드러나는 부분이 출발 자리의 가장자리와 같은 밝기다.
        */}
        {/*
          발광은 교차점을 중심으로 한 원이라, 가장자리 줄에서는 판 밖까지
          번진다. 판 모양 그대로 잘라내지 않으면 나무판 바깥 페이지 바탕에
          흰 반달이 찍힌다.
        */}
        <clipPath id="boardClip">
          <rect width={WIDTH} height={HEIGHT} rx="9" />
        </clipPath>
        <PieceDefs />
        {/* 화살표 머리는 몸통(board.css 의 .best-arrow)과 같은 토큰을 쓴다. 색을 여기
            박아 두면 몸통만 바뀌고 머리는 옛 색으로 남는다. */}
        <marker id="arrowBest" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 z" style={{ fill: "var(--accent-strong)" }} />
        </marker>
      </defs>

      <rect width={WIDTH} height={HEIGHT} rx="9" fill="url(#wood)" />
      <rect width={WIDTH} height={HEIGHT} rx="9" fill="url(#grain)" />
      <rect
        x="0.75"
        y="0.75"
        width={WIDTH - 1.5}
        height={HEIGHT - 1.5}
        rx="8.5"
        className="board-edge"
      />

      <g className="grid">{lines}</g>
      <g className="grid">{palaceDiagonals}</g>

      {/* 직전 수 표시 */}
      {lastMove && (
        <g clipPath="url(#boardClip)">
          {(
            [
              [lastMove.from, "from", 0.6],
              [lastMove.to, "to", 0.8],
            ] as const
          ).map(([s, end, size]) => {
            const p = posOf(s);
            return (
              <circle
                key={"last" + end}
                className={"last-move " + end}
                cx={p.x}
                cy={p.y}
                r={CELL * size}
              />
            );
          })}
        </g>
      )}

      {/* 장군을 맞은 궁 */}
      {checkedKing &&
        (() => {
          const p = posOf(checkedKing);
          return (
            <circle
              className="checked-king"
              cx={p.x}
              cy={p.y}
              r={CELL * 0.48}
            />
          );
        })()}

      {/* 선택 표시 */}
      {selected &&
        (() => {
          const p = posOf(selected);
          return (
            <circle
              className="selected"
              cx={p.x}
              cy={p.y}
              r={CELL * 0.46}
            />
          );
        })()}

      {/* 갈 수 있는 곳 */}
      {targets.map((s) => {
        const p = posOf(s);
        const occupied = Boolean(board[s]);
        return occupied ? (
          <circle
            key={"t" + s}
            className="target-capture"
            cx={p.x}
            cy={p.y}
            r={CELL * 0.44}
          />
        ) : (
          <circle
            key={"t" + s}
            className="target"
            cx={p.x}
            cy={p.y}
            r={CELL * 0.14}
          />
        );
      })}

      {/*
        클릭 판정용 투명 영역. 기물이 없는 교차점도 집을 수 있어야 한다.

        교차점마다 이름을 단다(기보 좌표 + 기물, "73 초 졸"). E2E 가 요소를 역할과 이름으로
        찾아서, 이것이 없으면 사람의 수를 둘 수 없었다. 가로줄은 화면에 보이는 위에서
        아래 순서다(판을 뒤집으면 같이 뒤집힌다).
      */}
      <g role="grid" aria-label="장기판">
        {displayRows.map((row, y) => (
          <g role="row" key={"row" + y}>
            {row.map((s) => {
              const p = posOf(s);
              return (
                <circle
                  key={"hit" + s}
                  role="gridcell"
                  aria-label={cellName(s)}
                  cx={p.x}
                  cy={p.y}
                  r={CELL * 0.46}
                  fill="transparent"
                  data-square={s}
                  className={targetSet.has(s) ? "hit active" : "hit"}
                  onPointerUp={() => {
                    if (!drag) onSquareClick(s);
                  }}
                />
              );
            })}
          </g>
        ))}
      </g>

      {/* 날아오는 동안 잡힌 기물은 도착 자리에 남아 있다가 사라진다. */}
      {flyMove?.captured &&
        (() => {
          const p = posOf(flyMove.to);
          const info = pieceInfo(flyMove.captured);
          return (
            <g
              key={"taken" + flyMove.key}
              className="taken"
              transform={`translate(${p.x} ${p.y})`}
            >
              <PieceBody piece={flyMove.captured} radius={(CELL / 2) * info.size * 0.94} />
            </g>
          );
        })()}

      {/* 날아오는 기물은 다른 기물 위로 지나가야 해서 맨 나중에 그린다. */}
      {squares.filter((s) => s !== flyMove?.to).map((s) => renderPiece(s, false))}
      {flyMove && renderPiece(flyMove.to, false)}

      {/* 뒀어야 할 수(파랑)와 미리 보는 수(호박색) */}
      {arrows.map((a) => {
        const p = posOf(a.m.from);
        const q = posOf(a.m.to);
        return (
          <line
            key={a.key}
            className={a.cls}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            markerEnd={`url(#${a.head})`}
          />
        );
      })}

      {/* 끌고 있는 기물은 맨 위에 다시 그린다. 들 수 없는 기물은 끌리지 않는다. */}
      {drag && !drag.held && (
        <g className="drag-layer">
          {renderPiece(drag.from, true)}
        </g>
      )}

      {callout && (
        <CheckCallout key={callout.key} text={callout.text} x={WIDTH / 2} y={HEIGHT / 2} />
      )}
    </svg>
  );
}
