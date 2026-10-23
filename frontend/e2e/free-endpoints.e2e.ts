import { expect, test, type Page } from "@playwright/test";
import { CAMPUS, DEFAULT_DESTINATION, DEFAULT_ORIGIN, WAYPOINTS } from "../src/config/campus";
import { emptyTrend, routeComparison } from "../src/test/fixtures";
import type { GeoPoint, HeatmapCell } from "../src/types";

/** Provider-free browser checks: all HTTP data is controlled, and the map has no API key. */
async function mockBackend(page: Page, cellsForViewport?: (url: URL) => HeatmapCell[]) {
  const heatmapUrls: string[] = [];
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/routes/compare") return route.fulfill({ json: routeComparison });
    if (url.pathname === "/api/v1/commutes/trends") return route.fulfill({ json: emptyTrend });
    if (url.pathname === "/api/v1/heatmap") {
      heatmapUrls.push(url.toString());
      return route.fulfill({ json: cellsForViewport?.(url) ?? [] });
    }
    return route.fulfill({ json: [] });
  });
  return { heatmapUrls };
}

function expectCampusPoint(point: GeoPoint) {
  expect(point.longitude).toBeGreaterThanOrEqual(CAMPUS.bounds.west);
  expect(point.longitude).toBeLessThanOrEqual(CAMPUS.bounds.east);
  expect(point.latitude).toBeGreaterThanOrEqual(CAMPUS.bounds.south);
  expect(point.latitude).toBeLessThanOrEqual(CAMPUS.bounds.north);
  expect(WAYPOINTS.some(waypoint => waypoint.point.longitude === point.longitude
    && waypoint.point.latitude === point.latitude)).toBe(false);
}

for (const width of [390, 320]) {
  test(`Free campus origin preserves the other endpoint, cancels safely and survives reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockBackend(page);
    await page.goto("/");
    await page.getByRole("group", { name: "选择终点", exact: true }).getByRole("button", { name: "图书馆", exact: true }).click();

    await page.getByRole("button", { name: "地图选择起点", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "地图选择起点", exact: true });
    await expect(picker).toBeVisible();
    const map = picker.getByTestId("offline-map");
    await expect(map).toBeVisible();
    await map.focus();
    await page.keyboard.press("ArrowLeft");
    await picker.getByRole("button", { name: "使用此位置作为起点", exact: true }).click();
    await expect(picker).toHaveCount(0);
    const selectedOrigin = page.getByRole("group", { name: "选择起点", exact: true })
      .getByRole("button", { name: /^地图起点（/ });
    await expect(selectedOrigin).toHaveAttribute("aria-pressed", "true");
    const originLabel = await selectedOrigin.innerText();
    await expect(page.getByRole("group", { name: "选择终点", exact: true })
      .getByRole("button", { name: "图书馆", exact: true })).toHaveAttribute("aria-pressed", "true");

    // Moving a draft destination must not change the selected destination after cancellation.
    await page.getByRole("button", { name: "地图选择终点", exact: true }).click();
    const destinationPicker = page.getByRole("dialog", { name: "地图选择终点", exact: true });
    await destinationPicker.getByTestId("offline-map").focus();
    await page.keyboard.press("ArrowRight");
    await destinationPicker.getByRole("button", { name: "取消选点", exact: true }).click();
    await expect(destinationPicker).toHaveCount(0);
    await expect(selectedOrigin).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: "选择终点", exact: true })
      .getByRole("button", { name: "图书馆", exact: true })).toHaveAttribute("aria-pressed", "true");

    const request = page.waitForRequest("**/api/v1/routes/compare");
    await page.getByRole("button", { name: "查看路线", exact: true }).click();
    const endpoints = (await request).postDataJSON() as { origin: GeoPoint; destination: GeoPoint };
    expectCampusPoint(endpoints.origin);
    // At zoom 16 an 80px left pan changes longitude by this known Web Mercator distance.
    expect(endpoints.origin.longitude).toBeCloseTo(DEFAULT_ORIGIN.point.longitude - 80 * 360 / (256 * 2 ** 16), 6);
    expect(endpoints.origin.latitude).toBeCloseTo(DEFAULT_ORIGIN.point.latitude, 6);
    expect(endpoints.destination).toEqual(WAYPOINTS[2].point);

    const restoredRequest = page.waitForRequest("**/api/v1/routes/compare");
    await page.reload();
    expect((await restoredRequest).postDataJSON()).toMatchObject(endpoints);
    await expect(page.getByRole("heading", { name: "路线预览", exact: true })).toBeVisible();
    await expect(page.getByText(`${originLabel} → 图书馆`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "修改起终点", exact: true }).click();
    await expect(page.getByRole("group", { name: "选择起点", exact: true })
      .getByRole("button", { name: originLabel, exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("Pointer dragging chooses a custom campus destination and sends its coordinates without changing the origin", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "地图选择终点", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "地图选择终点", exact: true });
  const map = picker.getByTestId("offline-map");
  await expect(map).toBeVisible();
  const bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  // Drag in the clear central map area, away from the zoom and confirm controls.
  const start = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 - 60 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 70, start.y + 35, { steps: 5 });
  await page.mouse.up();
  await picker.getByRole("button", { name: "使用此位置作为终点", exact: true }).click();
  await expect(page.getByRole("group", { name: "选择终点", exact: true })
    .getByRole("button", { name: /^地图终点（/ })).toHaveAttribute("aria-pressed", "true");
  const request = page.waitForRequest("**/api/v1/routes/compare");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  const endpoints = (await request).postDataJSON() as { origin: GeoPoint; destination: GeoPoint };
  expect(endpoints.origin).toEqual(DEFAULT_ORIGIN.point);
  expectCampusPoint(endpoints.destination);
  expect(endpoints.destination.longitude).toBeCloseTo(DEFAULT_DESTINATION.point.longitude - 70 * 360 / (256 * 2 ** 16), 6);
  expect(endpoints.destination.latitude).toBeGreaterThan(DEFAULT_DESTINATION.point.latitude);
});

test("An empty real heatmap can display simulated cells explicitly and clears them before returning to real data", async ({ page }) => {
  const { heatmapUrls } = await mockBackend(page, url => {
    if (url.searchParams.get("scope") !== "SIMULATED_ONLY") return [];
    const [west, south, east, north] = url.searchParams.get("bbox")!.split(",").map(Number);
    return [{ cellId: "simulated-visible-cell", center: { longitude: (west + east) / 2, latitude: (south + north) / 2 },
      score: 75, confidence: 0.8, count: 12, dominantTag: "CROWD", feedbackSource: "DEMO" }];
  });
  await page.goto("/");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  const source = page.getByRole("region", { name: "热力图来源", exact: true });
  await expect(source.getByRole("button", { name: "真实反馈", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(source.getByText(/当前地图范围近 7 天暂无真实反馈/)).toBeVisible();
  await expect(page.getByTestId("heatmap-point")).toHaveCount(0);
  expect(heatmapUrls.length).toBeGreaterThan(0);
  expect(heatmapUrls.every(url => new URL(url).searchParams.get("scope") === "REAL_ONLY")).toBe(true);

  const demoRequest = page.waitForRequest(request => new URL(request.url()).pathname === "/api/v1/heatmap"
    && new URL(request.url()).searchParams.get("scope") === "SIMULATED_ONLY");
  await source.getByRole("button", { name: "演示热力图", exact: true }).click();
  const query = new URL((await demoRequest).url()).searchParams;
  expect(query.get("hours")).toBe("168");
  await expect(source.getByText("当前显示：演示热力图（模拟反馈）。不影响路线规划、评分或真实统计。", { exact: true })).toBeVisible();
  // Inspect rendered map data rather than treating a successful HTTP response as proof of an overlay.
  const renderedPoint = page.locator('[data-testid="heatmap-point"][data-cell-id="simulated-visible-cell"]');
  await expect(renderedPoint).toBeVisible();
  await renderedPoint.click();
  await expect(page.getByRole("dialog", { name: "热力点详情", exact: true }).getByText("来源：演示反馈", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭热力点详情", exact: true }).click();

  // Hold the returning real response: simulated cells must already be gone while it loads.
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/heatmap?**", async route => {
    if (new URL(route.request().url()).searchParams.get("scope") !== "REAL_ONLY") return route.fallback();
    await held;
    return route.fulfill({ json: [] });
  });
  try {
    await source.getByRole("button", { name: "真实反馈", exact: true }).click();
    await expect(source.getByRole("button", { name: "真实反馈", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("正在更新情绪热力图", { exact: true })).toBeVisible();
    await expect(page.getByTestId("heatmap-point")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "热力点详情", exact: true })).toHaveCount(0);
  } finally { release(); }
  await expect(source.getByText(/当前地图范围近 7 天暂无真实反馈/)).toBeVisible();
  await expect(page.getByTestId("heatmap-point")).toHaveCount(0);
});
