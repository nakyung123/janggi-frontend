// 읽을거리 - 글 목록에서 글을 골라 읽는다
//
//   목록: 제목 · 한 줄 설명 → 카드 한 장 안에 글 제목 줄
//   글:   목록으로 · 글 제목 → 카드 한 장 안에 문단과 점 목록
//
// 짜임은 배우기 글 화면(learn.css 의 learn-doc, 폭 640 한 단)을 그대로 쓴다. 글은 readings.ts 에
// 있고, 글을 더할 때 이 파일은 고치지 않는다. 고른 글은 이 화면에 있는 동안만 기억한다.

import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import type { Block, Reading } from "./readings";
import { READINGS } from "./readings";

/**
 * 글을 열 때 쪽을 맨 위로 올린다. 폰은 쪽 전체가 구르므로, 아래로 내려간 채 열면 글이 중간부터
 * 보인다(외통 문제 화면과 같다).
 */
const toTop = () => document.scrollingElement?.scrollTo?.(0, 0);

function BlockView({ block }: { block: Block }) {
  if ("p" in block) return <p>{block.p}</p>;
  return (
    <ul className="learn-list">
      {block.list.map((item) => (
        <li key={item.text}>
          {item.lead && <b>{item.lead}</b>}
          {item.lead && ": "}
          {item.text}
        </li>
      ))}
    </ul>
  );
}

export function ReadingsScreen() {
  const [open, setOpen] = useState<Reading | null>(null);

  if (open) {
    return (
      <div className="learn-doc">
        <div className="game-back">
          <button type="button" className="back" onClick={() => setOpen(null)}>
            <ChevronLeft size={20} strokeWidth={2} aria-hidden />
            목록으로
          </button>
        </div>
        <h2 className="learn-title">{open.title}</h2>
        <div className="panel learn-reading">
          {open.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="learn-doc">
      <h2 className="learn-title">읽을거리</h2>
      <p className="muted">장기를 처음 두는 사람을 위한 짧은 글입니다.</p>
      <div className="panel">
        <ul className="learn-reading-list">
          {READINGS.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="ghost learn-reading-item"
                onClick={() => {
                  setOpen(r);
                  toTop();
                }}
              >
                {r.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
