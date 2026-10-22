import { test, expect, type Page } from "@playwright/test";

const evidence = process.env.MEMBER_A_EVIDENCE_DIR ?? "../../artifacts/member-a-acceptance";
const dContracts = Boolean(process.env.MEMBER_A_BACKEND_DIR);

const api = (page: Page, path: string, method = "GET") => page.waitForResponse((response) =>
  new URL(response.url()).pathname === `/api/v1/${path}` && response.request().method() === method);

async function enterMap(page: Page) {
  await page.goto("/");
  const comparison = api(page, "routes/compare", "POST");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  const response = await comparison;
  expect(response.status()).toBe(200);
  const result = await response.json();
  const heatmap = api(page, "heatmap");
  const trends = api(page, "commutes/trends");
  const history = api(page, "routes/history");
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  expect((await heatmap).status()).toBe(200);
  expect((await trends).status()).toBe(200);
  const historyResponse = await history;
  expect(historyResponse.status()).toBe(200);
  await expect(page.getByTestId("offline-map")).toBeVisible();
  await expect(page.getByText(/底图：离线底图/)).toContainText("数据服务：可连接");
  // Offline-map setup can replace the first viewport request during debounce.
  // Wait for the actual page to leave its blocking loading state before gestures.
  await expect(page.locator(".map-page__loading")).toHaveCount(0);
  await expect(page.locator(".map-surface__loading")).toHaveCount(0);
  return { ...result, historyRecords: await historyResponse.json() };
}

async function openFeedback(page: Page, xRatio = 0.45, yRatio = 0.75) {
  const surface = page.getByLabel("校园通勤情绪地图", { exact: true });
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  if (!box) throw new Error("Map surface is not visible");
  await page.mouse.move(box.x + box.width * xRatio, box.y + box.height * yRatio);
  await page.mouse.down();
  await page.waitForTimeout(650); // Exercise the actual 600 ms long-press gesture.
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "情绪反馈面板" })).toBeVisible();
}
async function chooseFeedback(page: Page) {
  const panel = page.getByRole("dialog", { name: "情绪反馈面板" });
  await panel.getByRole("button", { name: "压力 50 一般" }).click();
  await panel.getByRole("button", { name: "原因 噪音" }).click();
  return panel;
}

test("真实接口 初始查询 选路 返回与刷新恢复", async ({ page }, info) => {
  const result = await enterMap(page);
  expect(result.routes.length).toBeGreaterThan(0);
  await expect(page.getByText("路线来源与评分状态待确认")).toBeVisible();
  await expect(page.getByRole("button", { name: "完成本次通勤" })).toBeDisabled();
  const recent = page.getByRole("region", { name: "最近查询" });
  if (dContracts) {
    expect(result.historyRecords.length).toBeGreaterThan(0);
    await expect(recent.getByRole("button", { name: "重新规划", exact: true })).toHaveCount(result.historyRecords.length);
  } else {
    expect(result.historyRecords).toEqual([]);
    await expect(recent).toContainText("暂无查询历史");
  }
  const last = result.routes[result.routes.length - 1];
  const choice = page.getByRole("button", { name: `选择 ${last.label}`, exact: true });
  await choice.click(); await expect(choice).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "修改起终点" }).click();
  await page.getByRole("group", { name: "选择终点" }).getByRole("button", { name: "图书馆" }).click();
  const fresh = api(page, "routes/compare", "POST");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  expect((await fresh).status()).toBe(200);
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "路线预览" })).toBeVisible();
  await expect(page.getByText("学生公寓区 → 图书馆", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "路线预览" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("group", { name: "选择终点" })).toBeVisible();
  await page.screenshot({ path: `${evidence}/navigation.png`, fullPage: true });
  await info.attach("actual-comparison", { body: JSON.stringify({ routeCount: result.routes.length, sourceFieldsAbsent: !result.routeSource }), contentType: "application/json" });
});

test("真实接口 反馈新增后刷新与重复反馈", async ({ page }) => {
  await enterMap(page); await openFeedback(page); const panel = await chooseFeedback(page);
  const created = api(page, "reports", "POST"); const updated = api(page, "heatmap");
  await panel.getByRole("button", { name: "提交反馈", exact: true }).click();
  expect((await created).status()).toBe(201); expect((await updated).status()).toBe(200);
  await expect(page.getByText("反馈已提交，当前视口热力图已更新。")).toBeVisible();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("emoji-fountain")).toHaveCount(0, { timeout: 3000 });
  await openFeedback(page); const again = await chooseFeedback(page); const repeated = api(page, "reports", "POST");
  await again.getByRole("button", { name: "提交反馈", exact: true }).click();
  const duplicateResponse = await repeated;
  expect(duplicateResponse.status()).toBe(dContracts ? 200 : 409);
  if (dContracts) expect(await duplicateResponse.json()).toMatchObject({ status: "duplicate", code: "report_duplicate", counted: false });
  await expect(page.getByText("这条反馈已提交过，无需重复提交。")).toBeVisible();
  await expect(page.getByTestId("emoji-fountain")).toHaveCount(0);
});

test("故障注入 反馈失败保留草稿并在恢复后真实保存", async ({ page }) => {
  await enterMap(page);
  let failOnce = true;
  const locations: unknown[] = [];
  let releaseFailure!: () => void;
  let firstRequestStarted!: () => void;
  const pendingFailure = new Promise<void>((resolve) => { releaseFailure = resolve; });
  const firstRequest = new Promise<void>((resolve) => { firstRequestStarted = resolve; });
  await page.route("**/api/v1/reports", async (route) => {
    locations.push(route.request().postDataJSON().location);
    if (failOnce) {
      failOnce = false;
      firstRequestStarted();
      await pendingFailure;
      return route.abort("failed");
    }
    return route.continue();
  });
  await openFeedback(page); const panel = await chooseFeedback(page);
  await panel.getByRole("button", { name: "提交反馈", exact: true }).click();
  await firstRequest;
  // A second long press must not replace the location of the in-flight draft.
  await openFeedback(page, 0.65, 0.75);
  releaseFailure();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "压力 50 一般" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("button", { name: "原因 噪音" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".map-surface__feedback-error")).toBeVisible();
  const created = api(page, "reports", "POST");
  await panel.getByRole("button", { name: "提交反馈", exact: true }).click();
  expect((await created).status()).toBe(201);
  expect(locations).toHaveLength(2);
  expect(locations[1]).toEqual(locations[0]);
  await expect(page.getByText("反馈已提交，当前视口热力图已更新。")).toBeVisible();
});

test("故障注入 保存成功但刷新失败只能重试查询", async ({ page }) => {
  await enterMap(page);
  let writes = 0; let failRefresh = false;
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.endsWith("/reports") && response.request().method() === "POST") {
      ++writes; if (response.status() === 201) failRefresh = true;
    }
  });
  await page.route("**/api/v1/heatmap?*", (route) => {
    if (failRefresh) { failRefresh = false; return route.abort("failed"); }
    return route.continue();
  });
  await openFeedback(page); const panel = await chooseFeedback(page);
  const saved = api(page, "reports", "POST");
  await panel.getByRole("button", { name: "提交反馈", exact: true }).click();
  expect((await saved).status()).toBe(201);
  await expect(page.getByText("反馈已提交，但地图刷新失败。请仅重试刷新地图。")).toBeVisible();
  const recovered = api(page, "heatmap");
  await page.getByRole("button", { name: "刷新地图", exact: true }).click();
  expect((await recovered).status()).toBe(200); expect(writes).toBe(1);
  await expect(page.getByRole("dialog", { name: "情绪反馈面板" })).toHaveCount(0);
});

test("故障注入 路线失败可重试且演示需明确进入", async ({ page }) => {
  let offline = true;
  await page.route("**/api/v1/routes/compare", (route) => offline ? route.abort("failed") : route.continue());
  await page.goto("/"); await page.getByRole("button", { name: "查看路线", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("offline-map")).toHaveCount(0);
  offline = false; const comparison = api(page, "routes/compare", "POST");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  expect((await comparison).status()).toBe(200);
  offline = true; await page.getByRole("button", { name: "重新查询路线", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "查看匹配的演示路线" }).click();
  await expect(page.getByText("演示路线 · 评分不可用")).toBeVisible();
  await expect(page.getByText(/底图：离线底图/)).toContainText("数据服务：可连接");
  await expect(page.getByRole("button", { name: "完成本次通勤" })).toBeDisabled();
});

for (const width of [390, 320]) {
  test(`真实接口 ${width}像素导航和反馈入口`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await enterMap(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.getByRole("button", { name: "修改起终点" })).toBeVisible();
    await openFeedback(page, 0.2, 0.75); const panel = await chooseFeedback(page);
    await expect(panel.getByRole("button", { name: "提交反馈", exact: true })).toBeInViewport();
    await panel.getByRole("button", { name: "关闭反馈面板" }).click();
    await expect(panel).toHaveCount(0);
    await page.screenshot({ path: `${evidence}/live-mobile-${width}.png`, fullPage: true });
  });
}
