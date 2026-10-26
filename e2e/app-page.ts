// 화면 요소를 찾는 곳. 화면이 바뀌면 여기만 고친다.
//
// 요소는 역할과 이름으로 찾는다. 테스트 전용 속성을 서비스 코드에 넣지 않는다.
// 판(SVG)의 기물은 역할도 이름도 없어서 여기서 찾지 않는다 - 그것은 접근성 결함으로
// 따로 적어 두었다. 그래서 수는 엔진이 두고, 사람은 한수쉼만 한다.

import { expect, type Locator, type Page } from "@playwright/test";

/** 엔진이 수를 두거나 복기를 도는 동안 기다리는 시간 */
export const ENGINE_WAIT = 60_000;

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

  async noHorizontalScroll() {
    const over = await this.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(over, "가로 스크롤이 없다").toBe(false);
  }
}
