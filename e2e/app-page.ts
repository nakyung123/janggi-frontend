// 화면 요소를 찾는 곳. 화면이 바뀌면 여기만 고친다.
//
// 요소는 역할과 이름으로 찾는다. 테스트 전용 속성을 서비스 코드에 넣지 않는다.
// 판의 교차점은 gridcell 이고 이름은 기보 좌표 + 기물이다(Board.tsx).

import { test as base, expect, type Locator, type Page } from "@playwright/test";

/** 엔진이 수를 두거나 복기를 도는 동안 기다리는 시간 */
export const ENGINE_WAIT = 60_000;

export interface IsolationOption {
  /**
   * false 면 첫 문서 응답에서 COOP·COEP 헤더를 뺀다. 그러면 격리가 안 되고 SharedArrayBuffer 가
   * 없다. 안드로이드 앱 안 브라우저가 이 상태다(헤더를 받아도 격리가 안 된다). 앱은 이때 단일
   * 스레드 엔진을 Worker 에서 띄운다. 프로젝트마다 playwright.config.ts 에서 정한다.
   */
  isolated: boolean;
}

export const test = base.extend<IsolationOption>({
  isolated: [true, { option: true }],
  page: async ({ page, isolated }, use) => {
    if (!isolated) {
      await page.route(
        (url) => url.pathname === "/",
        async (route) => {
          const response = await route.fetch();
          const headers = { ...response.headers() };
          delete headers["cross-origin-opener-policy"];
          delete headers["cross-origin-embedder-policy"];
          await route.fulfill({ response, headers });
        }
      );
    }
    await use(page);
  },
});

export class AppPage {
  readonly errors: string[] = [];

  constructor(readonly page: Page) {
    // 잡히지 않은 스크립트 오류. 하나라도 있으면 테스트가 실패한다.
    page.on("pageerror", (e) => this.errors.push(e.message));
  }

  async open() {
    await this.page.goto("/");
    // 엔진이 준비되기 전에는 BootScreen 만 서고 대국 패널이 없다. 엔진이 못 뜨면 BootScreen 이
    // 실패 글을 띄우는데, 그때 60초를 다 기다리지 않도록 둘 중 먼저 서는 것을 기다린다.
    const failed = this.page.getByText("장기판을 띄우지 못했습니다.");
    await expect(this.newGame.or(failed)).toBeVisible({ timeout: ENGINE_WAIT });
    await expect(failed, "엔진을 띄우지 못했다는 글이 없다").toBeHidden();
    await expect(this.newGame, "엔진이 준비되어 대국 패널이 선다").toBeVisible();
  }

  /** 판의 교차점. 이름은 기보 좌표 + 기물("43 한 병"), 빈 자리는 좌표만("53"). */
  cell(name: string): Locator {
    return this.page.getByRole("grid", { name: "장기판" }).getByRole("gridcell", { name, exact: true });
  }

  /**
   * 교차점을 누른다. 사람이 누르는 그대로 그 자리 가운데를 마우스로 누른다.
   *
   * locator.click() 을 쓰지 않는 까닭 - 기물이 있는 자리는 기물 그림이 교차점 위에 그려져
   * 있어서, 누르면 기물이 받는다(판이 그렇게 만들어졌다). click() 은 그것을 "다른 요소가
   * 가로챈다" 로 보고 기다리기만 한다. 우회해 누르는 것(force)이 아니라 사람과 같은 자리를 누른다.
   */
  async tap(name: string) {
    const box = await this.cell(name).boundingBox();
    expect(box, `교차점 "${name}" 이 화면에 있다`).not.toBeNull();
    await this.page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  }

  /** 대국 패널의 "내가 잡을 쪽" */
  side(name: "초" | "한"): Locator {
    return this.page.getByRole("button", { name, exact: true });
  }

  get newGame() {
    return this.page.getByRole("button", { name: "새 대국", exact: true });
  }
  get undo() {
    return this.page.getByRole("button", { name: "무르기" });
  }
  get pass() {
    return this.page.getByRole("button", { name: "한수쉼" });
  }
  get resign() {
    return this.page.getByRole("button", { name: "기권", exact: true });
  }
  get confirm() {
    return this.page.getByRole("alertdialog");
  }
  get result() {
    return this.page.getByRole("dialog");
  }

  /**
   * 엔진이 두고 내 차례가 될 때까지. 내 차례이면 한수쉼이 켜진다(엔진이 한수쉼을
   * 합법수로 알려 줬을 때). 기다리는 방법은 이 함수 하나로 모은다.
   */
  async waitMyTurn() {
    await expect(this.pass, "엔진이 두고 내 차례가 된다").toBeEnabled({ timeout: ENGINE_WAIT });
  }

  /** 기권하고 결과 창에서 기보를 연다. */
  async resignAndOpenRecord() {
    await this.resign.click();
    await expect(this.confirm).toBeVisible();
    await this.confirm.getByRole("button", { name: "기권", exact: true }).click();
    await expect(this.result).toBeVisible();
    await this.result.getByRole("button", { name: "기보 보기" }).click();
  }

  /** 기보 탭의 복기 깊이 */
  reviewDepth(name: "빠름" | "보통" | "정밀"): Locator {
    return this.page.getByRole("button", { name, exact: true });
  }
  get startReview() {
    return this.page.getByRole("button", { name: "복기 시작" });
  }
  get stopReview() {
    return this.page.getByRole("button", { name: "중단" });
  }
  get reviewAgain() {
    return this.page.getByRole("button", { name: "다시 복기" });
  }

  // --- 로그인과 기보 목록 (e2e/server-flow.spec.ts) --------------------------

  /** 폰 헤더의 로그인. 로그인 전에만 선다. 쪽 전체가 구글로 갔다가 돌아온다. */
  get login() {
    return this.page.getByRole("link", { name: "로그인", exact: true });
  }
  /** 폰 헤더의 로그아웃. 로그인된 뒤에만 선다. */
  get logout() {
    return this.page.getByRole("banner").getByRole("button", { name: "로그아웃" });
  }

  /** ☰ 메뉴에서 기보 탭으로 간다. 폰에서는 화면 목록이 ☰ 메뉴 안에 있다. */
  async openGamesTab() {
    await this.page.getByRole("button", { name: "메뉴 열기" }).click();
    await this.page.getByRole("navigation", { name: "모드" }).getByRole("button", { name: "기보" }).click();
  }

  /** 연 판에서 목록으로 돌아간다. */
  get backToList() {
    return this.page.getByRole("button", { name: "목록으로" });
  }

  /** 기보 목록의 판 카드 */
  get gameCards() {
    return this.page.getByRole("region", { name: "지난 판" }).getByRole("listitem");
  }
  get emptyList() {
    return this.page.getByText("아직 끝난 판이 없습니다");
  }

  /** 기보 탭의 탈퇴. 묻는 줄에서 한 번 더 누른다. */
  async withdraw() {
    await this.page.getByRole("button", { name: "탈퇴", exact: true }).click();
    await this.page.getByRole("group", { name: "탈퇴 확인" }).getByRole("button", { name: "탈퇴하기" }).click();
  }

  async noHorizontalScroll() {
    const over = await this.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(over, "가로 스크롤이 없다").toBe(false);
  }
}
