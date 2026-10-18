import { test, expect, type Page } from "@playwright/test";
import { routeComparison, emptyTrend } from "../src/test/fixtures";
import { DEFAULT_ORIGIN, WAYPOINTS } from "../src/config/campus";

async function backend(page: Page, compareFailure = false) {
  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/routes/compare")) return route.fulfill(compareFailure
      ? { status: 503, json: { code: "internal_error", message: "服务不可用" } }
      : { json: routeComparison });
    if (url.includes("/commutes/trends")) return route.fulfill({ json: emptyTrend });
    return route.fulfill({ json: [] });
  });
}
async function enterMap(page: Page) {
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  await expect(page.getByTestId("offline-map")).toBeVisible();
}

test("A navigation selects routes, returns and reloads endpoints without stale route state", async ({ page }) => {
  await backend(page); await page.goto("/"); await enterMap(page);
  await page.getByRole("button", { name: /选择 路线 B/ }).click();
  await expect(page.getByRole("button", { name: /选择 路线 B/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "完成本次通勤" })).toBeDisabled();
  await expect(page.getByText("当前无有效评分，不展示舒适标签。")).toBeVisible();
  await page.getByRole("button", { name: "修改起终点" }).click();
  await page.getByRole("group", { name: "选择终点" }).getByRole("button", { name: "图书馆" }).click();
  const pending = page.waitForRequest("**/api/v1/routes/compare");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  expect((await pending).postDataJSON().destination).toEqual(WAYPOINTS[2].point);
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  await expect(page.getByRole("button", { name: /选择 路线 A/ })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("heading", { name: "路线预览" })).toBeVisible();
  await expect(page.getByText("学生公寓区 → 图书馆", { exact: true })).toBeVisible();
});

test("A errors stay actionable and matching demo is an explicit choice", async ({ page }) => {
  await backend(page, true); await page.goto("/");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "重试", exact: true })).toBeVisible();
  await expect(page.getByTestId("offline-map")).toHaveCount(0);
  await page.getByRole("button", { name: "查看匹配的演示路线" }).click();
  await expect(page.getByText("演示路线 · 评分不可用")).toBeVisible();
  await expect(page.getByRole("button", { name: "完成本次通勤" })).toBeDisabled();
  await expect(page.getByText("少心累", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/底图：离线底图/)).toContainText("数据服务：可连接");
});

test("A non-default endpoints never inherit the default demonstration", async ({ page }) => {
  await backend(page, true); await page.goto("/");
  await page.getByRole("group", { name: "选择终点" }).getByRole("button", { name: "图书馆" }).click();
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  await expect(page.getByText("这组起终点没有配置演示路线。")).toBeVisible();
  await expect(page.getByRole("button", { name: "查看匹配的演示路线" })).toHaveCount(0);
  await page.getByRole("button", { name: "修改起终点" }).click();
  await expect(page.getByRole("group", { name: "选择终点" }).getByRole("button", { name: "图书馆" })).toHaveAttribute("aria-pressed", "true");
});

test("A history only restores endpoints and requeries current routes", async ({ page }) => {
  await backend(page);
  await page.route("**/api/v1/routes/history*", (route) => route.fulfill({ json: [{
    id: "history-a", origin: DEFAULT_ORIGIN.point, destination: WAYPOINTS[2].point,
    createdAt: "2026-10-18T00:00:00Z", result: { recommendation: "过期评分不能使用" },
  }] }));
  await page.goto("/"); await enterMap(page);
  const request = page.waitForRequest("**/api/v1/routes/compare");
  await page.getByRole("region", { name: "最近查询" }).getByRole("button", { name: "重新规划", exact: true }).click();
  expect((await request).postDataJSON().destination).toEqual(WAYPOINTS[2].point);
  await expect(page.getByRole("heading", { name: "路线预览" })).toBeVisible();
  await expect(page.getByText("过期评分不能使用")).toHaveCount(0);
});

for (const width of [390, 320]) {
  test(`A navigation remains reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await backend(page); await page.goto("/");
    await enterMap(page);
    await expect(page.getByRole("button", { name: "修改起终点" })).toBeVisible();
    await expect(page.getByRole("button", { name: "刷新地图" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `../../artifacts/member-a-work/mobile-${width}.png`, fullPage: true });
  });
}
