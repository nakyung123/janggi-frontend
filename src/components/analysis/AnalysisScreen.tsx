// 분석판 - 기물을 놓아 국면을 만들고, 양쪽 수를 둬 보며, AI 가 보는 형세와 추천 수를 본다
//
//   제목 · [국면 만들기 | 두어 보기] → 판 → (만들기) 기물 칸·둘 차례·규칙·시작
//                                         (두기) 판 조작 줄·상태 한 줄
//                                         AI 분석 칸
//
// 짜임은 배우기·외통 문제의 판 화면을 그대로 쓴다(learn.css) - 넓은 화면은 판 | 오른쪽 칸, 폰은
// 위 순서로 쌓는다. 폰은 판 바로 아래에 손 닿는 것(기물 칸 또는 조작 줄)이 온다.
//
// 이 화면은 엔진을 모른다. 상태와 엔진 답은 App 이 쥔 훅(hooks/useAnalysisBoard)이 준다.

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useId } from "react";
import type { AnalysisBoard, EditTool, StartKind } from "../../hooks/useAnalysisBoard";
import type { PieceType, Side } from "../../janggi/pieces";
import { SIDE_LABEL, charOf, pieceInfo } from "../../janggi/pieces";
import { outcomeMessage } from "../../janggi/status";
import type { PageProps } from "../../screens";
import { Board } from "../board/Board";
import { PieceBody } from "../board/PieceGlyph";
import { Dropdown } from "../common/Dropdown";
import { VARIANT_OPTIONS } from "../play/PlayPanel";
import { AnalysisPanel } from "./AnalysisPanel";

const ICON = { size: 20, strokeWidth: 2, "aria-hidden": true } as const;

/** 기물 칸의 차례. 3×3 으로 선다: 궁 사 상 / 마 포 차 / 졸 빼기 옮기기. */
const PIECE_TOOLS: PieceType[] = ["k", "a", "b", "n", "c", "r", "p"];

const STARTS: { kind: StartKind; label: string }[] = [
  { kind: "empty", label: "빈 판" },
  { kind: "start", label: "처음 차림" },
  { kind: "play", label: "대국 판" },
];

export function AnalysisScreen({ analysis: a }: Pick<PageProps, "analysis">) {
  const canPlay = a.engineStatus === "ready" && a.problems.length === 0;

  return (
    <div className="learn-fit analysis">
      <div className="learn-main">
        <div className="learn-head">
          <h2 className="learn-title">분석판</h2>
          <div className="seg" role="group" aria-label="분석판에서 할 일">
            <button
              type="button"
              className={a.mode === "edit" ? "active" : ""}
              aria-pressed={a.mode === "edit"}
              onClick={() => a.setMode("edit")}
            >
              국면 만들기
            </button>
            <button
              type="button"
              className={a.mode === "play" ? "active" : ""}
              aria-pressed={a.mode === "play"}
              disabled={!canPlay && a.mode !== "play"}
              onClick={() => a.setMode("play")}
            >
              두어 보기
            </button>
          </div>
        </div>

        <div className="learn-stage">
          <Board {...a.view} />
        </div>

        <div className="learn-desc analysis-desc">
          {a.mode === "edit" ? <EditTools a={a} /> : <PlayTools a={a} />}
          <AnalysisPanel
            engineStatus={a.engineStatus}
            on={a.analysisOn}
            onToggle={a.setAnalysisOn}
            snapshot={a.snapshot}
            position={a.position}
            invalid={a.problems.length > 0}
            outcome={a.outcome}
            playing={a.mode === "play"}
          />
        </div>
      </div>
    </div>
  );
}

/** 국면 만들기: 기물 칸, 둘 차례, 규칙, 시작, 되돌리기·뒤집기, 고칠 것 목록. */
function EditTools({ a }: { a: AnalysisBoard }) {
  const turnLabel = useId();
  const variantLabel = useId();

  const toolButton = (tool: EditTool, label: string, icon?: PieceType) => {
    const disabled = icon !== undefined && a.full(icon);
    return (
      <button
        key={tool}
        type="button"
        className={"analysis-tool" + (a.tool === tool ? " active" : "")}
        aria-pressed={a.tool === tool}
        disabled={disabled}
        onClick={() => a.setTool(tool)}
      >
        {icon && (
          <svg className="analysis-tool-icon" viewBox="-22 -22 44 44" aria-hidden="true">
            <PieceBody piece={charOf(icon, a.toolSide)} radius={20} flat />
          </svg>
        )}
        {label}
      </button>
    );
  };

  return (
    <div className="analysis-edit">
      <div className="seg" role="group" aria-label="놓을 쪽">
        {(["cho", "han"] as Side[]).map((s) => (
          <button
            key={s}
            type="button"
            className={(a.toolSide === s ? "active " : "") + s}
            aria-pressed={a.toolSide === s}
            onClick={() => a.setToolSide(s)}
          >
            {SIDE_LABEL[s]} 기물
          </button>
        ))}
      </div>

      <div className="analysis-tools" role="group" aria-label="판을 누르면">
        {PIECE_TOOLS.map((t) => toolButton(t, pieceInfo(charOf(t, a.toolSide)).name, t))}
        {toolButton("remove", "빼기")}
        {toolButton("move", "옮기기")}
      </div>
      <p className={a.note ? "analysis-note error" : "analysis-note muted"} role="status">
        {a.note ?? "한쪽에 궁 1, 사·상·마·포·차 2, 졸 5개까지 놓습니다."}
      </p>

      <div className="row">
        <span className="label" id={turnLabel}>
          둘 차례
        </span>
        <div className="seg" role="group" aria-labelledby={turnLabel}>
          {(["cho", "han"] as Side[]).map((s) => (
            <button
              key={s}
              type="button"
              className={(a.position.turn === s ? "active " : "") + s}
              aria-pressed={a.position.turn === s}
              onClick={() => a.setTurn(s)}
            >
              {SIDE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <span className="label" id={variantLabel}>
          규칙
        </span>
        <Dropdown
          value={a.variant}
          labelledBy={variantLabel}
          onChange={a.setVariant}
          options={VARIANT_OPTIONS.map((v) => ({ value: v.id, label: v.label, desc: v.desc }))}
        />
      </div>

      <div className="analysis-buttons">
        {STARTS.map((s) => (
          <button key={s.kind} type="button" onClick={() => a.load(s.kind)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="analysis-buttons">
        <button type="button" disabled={!a.canUndoEdit} onClick={a.undoEdit}>
          되돌리기
        </button>
        <button type="button" onClick={a.flip}>
          판 뒤집기
        </button>
      </div>

      {a.problems.length > 0 && (
        <ul className="analysis-problems" aria-label="고칠 것">
          {a.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 두어 보기: 판 조작 줄(대국과 같은 모양)과 상태 한 줄. */
function PlayTools({ a }: { a: AnalysisBoard }) {
  const atStart = a.cursor <= 0;
  const atEnd = a.cursor >= a.last;
  return (
    <div className="analysis-play">
      <div className="board-controls">
        <div className="board-actions">
          <button type="button" className="icon" disabled={atStart} onClick={() => a.goTo(0)} aria-label="처음으로">
            <ChevronsLeft {...ICON} />
          </button>
          <button type="button" disabled={atStart} onClick={() => a.goTo(a.cursor - 1)}>
            <ChevronLeft {...ICON} />
            이전
          </button>
          <button type="button" disabled={atEnd} onClick={() => a.goTo(a.cursor + 1)}>
            다음
            <ChevronRight {...ICON} />
          </button>
          <button type="button" className="icon" disabled={atEnd} onClick={() => a.goTo(a.last)} aria-label="끝으로">
            <ChevronsRight {...ICON} />
          </button>
        </div>
        <div className="board-actions">
          <button type="button" onClick={a.flip}>
            판 뒤집기
          </button>
          <button type="button" disabled={!a.canPass} onClick={a.pass}>
            한수쉼
          </button>
        </div>
      </div>
      <p className="analysis-state" role="status">
        {stateText(a)}
      </p>
    </div>
  );
}

/** 두어 보기의 상태 한 줄. 끝났으면 대국과 같은 결과 문구, 아니면 둘 차례와 장군·빅장. */
function stateText(a: AnalysisBoard): string {
  if (a.outcome) return outcomeMessage(a.outcome);
  const turn = `${SIDE_LABEL[a.position.turn]} 차례`;
  if (a.status.kind === "check") return `${turn} · 장군`;
  if (a.status.kind === "facing") return `${turn} · 빅장`;
  return turn;
}
