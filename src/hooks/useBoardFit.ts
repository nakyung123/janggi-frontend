// 판 크기 재기 — 판을 그린 뒤 크기를 재서 CSS 변수로 넘긴다
//
// 판은 남은 높이에 맞춰 크기가 정해지므로 CSS 만으로는 판의 폭을 알 수 없다. 다 그린
// 뒤에 재서 .app 에 둘을 건다.
//
//   --board-w    그려진 판의 폭. 폰에서 판 위아래 대국자 카드가 판과 같은 폭으로 선다.
//   --board-fit  판이 들어갈 수 있는 폭. 헤더와 판·패널 덩어리의 폭을 정한다
//                (layout.css 의 .top / .layout).
//
// --board-fit 을 그려진 폭(--board-w)으로 잡으면 안 된다. 덩어리 폭이 판 칸을 묶고,
// 판은 그 칸 폭으로 다시 그려져서, 창을 키워도 판이 커지지 못하는 고리가 생긴다.
// 그래서 판 자리(.board-stage)의 '높이' 에서 거꾸로 계산한다 - 높이는 세로로 쌓인
// 것만 보고 정해져 가로 폭에 기대지 않는다. 폭 = 높이 × 판의 가로세로 비.
//
// --board-fit 은 같은 창 크기 안에서는 줄이지 않는다. 판 위아래에 무언가 잠깐 끼어
// 판 자리가 낮아질 때마다 덩어리 폭을 따라 줄이면 헤더와 패널이 옆으로 움직인다.
// 가장 컸던 값을 쥐고 있다가 창 크기가 바뀌면 새로 잰다.

import { useLayoutEffect, useRef } from "react";

/**
 * @param shown 판이 화면에 붙어 있는지. 엔진을 받는 동안(로딩 화면)과 기보 목록
 *              화면에는 판이 없다. 판이 새로 붙으면 그때 다시 잰다.
 * @returns 판과 대국자 카드를 감싸는 .table 요소에 달 ref
 */
export function useBoardFit(shown: boolean) {
  const tableRef = useRef<HTMLDivElement>(null);

  // useEffect 가 아니라 useLayoutEffect 이고, **그 안에서 한 번 직접 잰다.** 판이 붙는
  // 프레임이 --board-fit 없이 그려지면 다음 프레임에 좁아져 화면이 밀린다 - 1280 폭에서
  // 엔진이 뜨는 1.1초쯤에 .layout 과 .top 이 1178px -> 1095px 로 움직여 CLS 0.029 가
  // 찍혔다.
  //
  // **ResizeObserver 를 앞당겨 등록하는 것으로는 안 고쳐진다.** useEffect -> 
  // useLayoutEffect 만 바꿔 재 봤더니 같은 자리에서 같은 크기로 그대로 밀렸다. 첫 관측이
  // 그리기 전에 전달될 것으로 봤는데 아니었다. 그래서 콜백을 기다리지 않고 measure() 를
  // 그 자리에서 한 번 부른다 - 그리기 전에 값이 걸려 있어야 한다. 관찰자는 그 뒤로
  // 창이 바뀔 때를 위해 그대로 둔다.
  useLayoutEffect(() => {
    if (!shown) return;
    const table = tableRef.current;
    const svg = table?.querySelector<SVGSVGElement>("svg.board");
    const stage = table?.querySelector<HTMLElement>(".board-stage");
    if (!table || !svg || !stage) return;
    const host = table.closest<HTMLElement>(".app") ?? table;
    let fitFor = "";
    let fit = 0;
    const measure = () => {
      const drawn = svg.getBoundingClientRect();
      host.style.setProperty("--board-w", `${Math.ceil(drawn.width)}px`);
      const viewport = `${window.innerWidth}x${window.innerHeight}`;
      if (viewport !== fitFor) {
        fitFor = viewport;
        fit = 0;
      }
      const { width: vbW, height: vbH } = svg.viewBox.baseVal;
      fit = Math.max(fit, Math.ceil((stage.getBoundingClientRect().height * vbW) / vbH));
      host.style.setProperty("--board-fit", `${fit}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [shown]);

  return tableRef;
}
