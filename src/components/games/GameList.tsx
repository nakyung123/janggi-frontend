// 기보 목록 — 기보 탭의 첫 화면
//
// 지난 판을 최근 순서로 늘어놓는다. 한 판을 누르면 그 판이 열려 한 수씩 되짚고
// 복기할 수 있다. 화면에 들어가는 만큼씩 쪽으로 나누고 아래에 쪽 번호를 둔다.
// 파일로 저장해 둔 기보를 불러오는 버튼도 여기 있다(목록에 한 판을 넣는 일이다).
//
// 카카오장기의 기보 타임라인을 따랐다. 한 칸에 상대·언제·어떻게 끝났는지를 적고
// 오른쪽에 끝난 모양을 작은 판으로 붙인다. 나눌 사람을 전제로 한 것(친구 초대,
// 프로필 사진, 공개 여부, 좋아요·댓글·즐겨찾기, 전적)은 두지 않는다 - 혼자 엔진과
// 두는 앱이다. 판을 남에게 건네는 길은 연 판의 '저장'(기보 파일) 하나다.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { parseFen } from "../../janggi/board";
import { pageItems, resultTag, whenLabel } from "../../janggi/archive";
import { SIDE_LABEL } from "../../janggi/pieces";
import type { GameRow, ServerGames } from "../../hooks/useServerGames";
import { LOGIN_PATH } from "../../server/api";
import { MiniBoard } from "./MiniBoard";

interface Props {
  /** 기기의 판과 서버의 판을 합친 목록. 만드는 곳은 `useServerGames` 다. */
  rows: GameRow[];
  /** 지금 시각. "3시간 전" 을 셀 때 쓴다. 부르는 쪽이 주면 테스트·캡처가 쉽다. */
  now: number;
  onOpen: (id: string) => void;
  /** 파일로 저장해 둔 기보를 목록에 넣는다 */
  onLoad: (file: File) => void;
  /**
   * 보고 있는 쪽(0 부터). App 이 쥔다 - 한 판을 열었다가 '목록' 으로 돌아오면
   * 이 컴포넌트는 새로 그려지는데, 그때 보던 쪽으로 돌아와야 한다.
   */
  page: number;
  onPage: (page: number) => void;
  /** 파일을 못 읽은 까닭. 누른 버튼(파일 불러오기) 옆에 남는다. */
  error: string | null;
  /** 방금 목록에 넣은 판. 그 카드가 잠깐 도드라진다. */
  freshId: string | null;
  /**
   * 로그인 상태와 "서버에도 있나".
   *
   * 칸을 하나씩 받지 않고 묶어 받는다 - 다섯이 늘 같이 움직여서, 흩어 두면 그중 하나를
   * 빠뜨리는 것이 버그가 된다(`useGames` 를 한 훅에 모은 까닭과 같다).
   */
  server: ServerGames;
}

/**
 * 끝났을 때의 판을 그림으로.
 *
 * <b>못 읽어도 터지지 않는다.</b> 서버에서 온 값은 우리가 만든 것이 아니다 - 옛
 * 판에서 온 것일 수도, 사람이 고친 것일 수도 있다. 한 칸을 못 읽었다고 목록 전체가
 * 안 보이면 안 된다. 실제로 그렇게 됐다(2026-10-14, 로컬 확인). 카드의 글은 그대로
 * 남고 그림 자리만 빈다.
 */
function 판으로(fen: string | null) {
  if (!fen) return {};
  try {
    return parseFen(fen).board;
  } catch {
    return {};
  }
}

/** 카드 한 줄의 높이를 재기 전에 쓰는 값(작은 판 112 + 안쪽 여백 16×2). */
const CARD_H = 144;

/**
 * 폰의 한 쪽 판 수. 폰은 화면 전체가 스크롤되어 목록 칸에 정해진 높이가 없다 -
 * 잴 칸이 없다. 화면을 내려 보는 것이 자연스러운 기기라 열 판씩 끊는다.
 * 화면 높이로 재면 네 판씩이라 쪽만 스물다섯이 된다.
 */
const PHONE_PER_PAGE = 10;
const NARROW = "(max-width: 900px)";

export function GameList(props: Props) {
  const { rows, now, onOpen, onLoad, page, onPage, error, freshId, server } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /*
   * 한 쪽에 몇 판을 둘지는 화면이 정한다 - 목록 칸에 스크롤 없이 들어가는 만큼
   * (격자가 정한 열 수 × 들어가는 줄 수). 수를 박아 두면 낮은 창에서는 한 쪽 안에서
   * 또 스크롤하게 된다. 창 크기가 바뀌면 다시 잰다.
   */
  const [perPage, setPerPage] = useState(12);
  // 탈퇴를 누르면 바로 보내지 않고 묻는 줄을 편다. 되돌릴 수 없어 보이는 일이라
  // 한 번 더 묻는다 - 실제로는 30일 안에 되돌릴 수 있고, 그것도 글에 적는다.
  const [탈퇴물음, set탈퇴물음] = useState(false);
  // 목록 칸은 판이 하나라도 있어야 붙는다. 처음 한 판이 들어올 때 다시 건다.
  const hasGames = rows.length > 0;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      if (window.matchMedia(NARROW).matches) {
        setPerPage(PHONE_PER_PAGE);
        return;
      }
      const cs = getComputedStyle(list);
      const cols = cs.gridTemplateColumns.split(" ").filter(Boolean).length || 1;
      const gap = parseFloat(cs.rowGap) || 0;
      const room = list.clientHeight;
      const cardH = list.firstElementChild?.getBoundingClientRect().height || CARD_H;
      const rows = Math.max(1, Math.floor((room + gap) / (cardH + gap)));
      setPerPage(cols * rows);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [hasGames]);

  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  // 창이 커져 쪽 수가 줄면 보던 쪽이 끝을 넘을 수 있다. 마지막 쪽으로 당긴다.
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * perPage, (current + 1) * perPage);

  /*
   * 판마다 마지막 국면. 이 쪽에 보이는 판만, 목록이 바뀔 때만 푼다.
   *
   * **서버에만 있는 판도 그려진다** - 요약에 끝났을 때의 판(lastFen) 한 칸이 같이 오기
   * 때문이다. 그 칸이 없으면 빈 판을 그린다. 그림 하나를 못 그리는 것이 목록이 통째로
   * 안 보이는 것보다 낫다.
   */
  const lastBoards = useMemo(
    () => new Map(shown.map((r) => [r.id, 판으로(r.lastFen)])),
    // shown 은 렌더마다 새 배열이라 그것을 만든 값으로 묶는다.
    [rows, current, perPage]
  );

  return (
    <section className="games" aria-label="지난 판">
      <div className="games-head">
        <h2 className="games-title">
          기보
          <span className="panel-meta">{rows.length}판</span>
        </h2>
        {error && (
          <p className="games-error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
          파일 불러오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLoad(file);
            e.target.value = ""; // 같은 파일을 다시 골라도 동작하게
          }}
        />
      </div>

      {/*
        로그인 줄. **머리말이 아니라 여기 둔다** - 폭 320 에서 앱 이름 줄에 자리가 없고,
        로그인이 하는 일(기보를 기기 밖에도 남기기)이 이 탭의 일이다. 이메일과 이름은
        보이지 않는다. 로그인됨 표시만 둔다.
      */}
      <div className="games-login">
        {server.loggedIn === null ? (
          <span className="games-who">로그인 상태를 확인하는 중…</span>
        ) : server.loggedIn ? (
          <>
            <span className="games-who">로그인됨 · 끝낸 판이 서버에도 남습니다</span>
            <button type="button" className="ghost" onClick={server.signOut} disabled={server.busy}>
              로그아웃
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => set탈퇴물음(true)}
              disabled={server.busy}
            >
              탈퇴
            </button>
          </>
        ) : (
          <>
            <span className="games-who">기보가 이 기기에만 남습니다</span>
            {/*
              단추가 아니라 링크다. 구글 동의 화면을 사람이 봐야 하므로 쪽 전체가 옮겨갔다
              돌아온다 - fetch 로는 안 되는 일이다.
            */}
            <a className="games-signin" href={LOGIN_PATH}>
              구글로 로그인
            </a>
          </>
        )}
      </div>

      {/*
        개인정보처리방침. **로그인을 누를지 정하는 줄 바로 아래 둔다** - 무엇이 서버로
        가는지는 누르기 전에 읽을 수 있어야 한다. 꼬리말로 내리면 결정하는 자리에서
        멀어진다.

        **새 탭으로 연다.** 방침은 public/ 에 그냥 둔 쪽이라 앱 밖이고, 같은 탭으로
        가면 두던 판을 떠나게 된다. about 쪽을 앱에서 안 잇기로 한 것과 같은 까닭이다.
      */}
      <p className="games-privacy">
        <a href="/privacy/" target="_blank" rel="noopener noreferrer">
          개인정보처리방침
        </a>
      </p>

      {/*
        **묻는 줄.** 세 줄 다 사실이어야 한다. 셋째 줄이 특히 그렇다 - 되돌릴 수 있다는
        것을 모르면 누를 사람이 겁만 먹고 만다. window.confirm 을 안 쓴 까닭은 글을 세
        줄로 못 쓰고 모양도 못 맞춰서다.
      */}
      {server.loggedIn === true && 탈퇴물음 && (
        <div className="games-leave" role="group" aria-label="탈퇴 확인">
          <p className="games-leave-what">
            서버에 있는 기보가 사라집니다.
            <br />
            이 기기의 기보는 그대로 남습니다.
            <br />
            30일 안에 다시 로그인하면 되돌릴 수 있습니다.
          </p>
          <div className="games-leave-buttons">
            <button type="button" className="ghost" onClick={() => set탈퇴물음(false)}>
              그만두기
            </button>
            <button
              type="button"
              className="primary danger"
              disabled={server.busy}
              onClick={() => {
                set탈퇴물음(false);
                server.withdraw();
              }}
            >
              탈퇴하기
            </button>
          </div>
        </div>
      )}

      {server.error && (
        <p className="games-sync-error" role="alert">
          {server.error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          <ScrollText size={24} strokeWidth={1.75} aria-hidden />
          <p className="empty-title">아직 끝난 판이 없습니다</p>
          <p>대국 탭에서 한 판 두면 끝난 뒤 여기에 남습니다.</p>
        </div>
      ) : (
        <ul className="game-list" ref={listRef}>
          {shown.map((g) => {
            const tag = resultTag(g);
            return (
              <li key={g.id}>
                <button
                  type="button"
                  className={"game-card" + (g.id === freshId ? " fresh" : "")}
                  onClick={() => onOpen(g.id)}
                >
                  <span className="game-text">
                    <span className="game-title">vs {g.levelName}</span>
                    <span className="game-meta">
                      {whenLabel(g.endedAt, now)} ·{" "}
                      <span className={"game-side " + g.mySide}>
                        {SIDE_LABEL[g.mySide]}
                      </span>{" "}
                      <b className={"game-result " + tag.tone}>{tag.text}</b>
                    </span>
                    <span className="game-moves">
                      {g.moves}수{g.reviewed ? " · 복기함" : ""}
                      {/*
                        **어디에 있는지를 말한다.** 로그인하지 않았으면 모든 판이 기기에만
                        있어서 아무것도 안 붙인다 - 다 붙으면 알려 주는 것이 없다.

                        "이 기기에만 있음" 은 올리기가 실패한 판에도 남는다. 실패를 조용히
                        넘기지 않으면서 화면을 하나 더 만들지 않는 자리다.
                      */}
                      {server.loggedIn === true && !g.onServer && (
                        <span className="game-local"> · 이 기기에만 있음</span>
                      )}
                      {server.loggedIn === true && !g.local && (
                        <span className="game-local"> · 다른 기기에서 둔 판</span>
                      )}
                    </span>
                  </span>
                  <MiniBoard
                    board={lastBoards.get(g.id) ?? {}}
                    flipped={g.mySide === "han"}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        쪽 번호. 한 쪽뿐이어도 자리는 남긴다 - 쪽 번호가 뜨고 사라질 때마다 목록
        칸 높이가 바뀌면 한 쪽에 들어가는 수가 따라 바뀐다.
      */}
      <nav className="pager" aria-label="기보 쪽">
        {pages > 1 && (
          <>
            <button
              type="button"
              className="icon"
              disabled={current === 0}
              onClick={() => onPage(current - 1)}
              aria-label="이전 쪽"
            >
              <ChevronLeft size={20} strokeWidth={2} aria-hidden />
            </button>
            {pageItems(current, pages).map((p, i) =>
              p === "gap" ? (
                <span key={"gap" + i} className="pager-gap" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  aria-current={p === current ? "page" : undefined}
                  aria-label={`${p + 1}쪽`}
                  onClick={() => onPage(p)}
                >
                  {p + 1}
                </button>
              )
            )}
            <button
              type="button"
              className="icon"
              disabled={current === pages - 1}
              onClick={() => onPage(current + 1)}
              aria-label="다음 쪽"
            >
              <ChevronRight size={20} strokeWidth={2} aria-hidden />
            </button>
          </>
        )}
      </nav>
    </section>
  );
}
