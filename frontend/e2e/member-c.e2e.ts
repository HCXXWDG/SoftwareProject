import { expect, test, type Locator, type Page } from "@playwright/test";
import { SERVICE_AREA } from "../src/config/serviceArea";
import { emptyTrend, routeComparison } from "../src/test/fixtures";
import type { HeatmapCell } from "../src/types";

interface ReportBody {
  location: { longitude: number; latitude: number };
  stressLevel: number;
  tag: string;
}

/** Controlled HTTP fixtures exercise the rendered UI, not a real provider or database. */
async function mockBackend(page: Page, outcome: "retry" | "duplicate" = "retry",
  cellsForViewport?: (requestUrl: string) => HeatmapCell[]) {
  const reports: ReportBody[] = [];
  const heatmapUrls: string[] = [];
  let nextHeatmapGate: Promise<void> | undefined;
  const holdNextHeatmap = () => {
    if (nextHeatmapGate) throw new Error("A heatmap response is already waiting to be held.");
    let release!: () => void;
    nextHeatmapGate = new Promise<void>(resolve => { release = resolve; });
    return release;
  };
  await page.route("**/api/v1/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/v1/routes/compare") return route.fulfill({ json: routeComparison });
    if (pathname === "/api/v1/commutes/trends") return route.fulfill({ json: emptyTrend });
    if (pathname === "/api/v1/heatmap") {
      heatmapUrls.push(route.request().url());
      const gate = nextHeatmapGate;
      nextHeatmapGate = undefined;
      if (gate) await gate;
      return route.fulfill({ json: cellsForViewport?.(route.request().url()) ?? [] });
    }
    if (pathname === "/api/v1/reports") {
      reports.push(route.request().postDataJSON() as ReportBody);
      if (outcome === "duplicate") return route.fulfill({ status: 200,
        json: { status: "duplicate", code: "report_duplicate", counted: false, message: "该反馈已记录" } });
      if (reports.length === 1) return route.fulfill({ status: 503,
        json: { status: 503, code: "internal_error", message: "保存暂时失败" } });
      return route.fulfill({ status: 201,
        json: { status: "created", code: "report_created", counted: true, message: "反馈已保存" } });
    }
    return route.fulfill({ json: [] });
  });
  return { reports, heatmapUrls, holdNextHeatmap };
}

async function enterMap(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  await expect(page.getByTestId("offline-map")).toBeVisible();
  await expect(page.getByRole("button", { name: "记录此处感受", exact: true })).toBeEnabled();
  await expect(page.getByText("正在更新情绪热力图", { exact: true })).toHaveCount(0);
  // Inspect a neighbourhood before testing corner gestures; the city overview also shows areas beyond its service bounds.
  const neighbourhood = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === "/api/v1/heatmap" && url.searchParams.get("zoom") === "14";
  });
  for (let zoom = SERVICE_AREA.defaultZoom; zoom < 14; zoom += 1) {
    await page.getByRole("button", { name: "放大地图", exact: true }).click();
  }
  await neighbourhood;
  await expect(page.getByText("正在更新情绪热力图", { exact: true })).toHaveCount(0);
}

/** Derive the geographic center independently from the public viewport query. */
function centerOfViewport(requestUrl: string) {
  const bbox = new URL(requestUrl).searchParams.get("bbox");
  expect(bbox).not.toBeNull();
  const [west, south, east, north] = bbox!.split(",").map(Number);
  const mercatorY = (degrees: number) => Math.asinh(Math.tan(degrees * Math.PI / 180));
  return {
    longitude: (west + east) / 2,
    latitude: Math.atan(Math.sinh((mercatorY(south) + mercatorY(north)) / 2)) * 180 / Math.PI,
  };
}

function metadataCellsForViewport(requestUrl: string): HeatmapCell[] {
  const bbox = new URL(requestUrl).searchParams.get("bbox");
  expect(bbox).not.toBeNull();
  const [west, south, east, north] = bbox!.split(",").map(Number);
  const mercatorY = (degrees: number) => Math.asinh(Math.tan(degrees * Math.PI / 180));
  return ([
    { horizontal: 0.2, vertical: 0.18, tag: "NOISE" },
    { horizontal: 0.8, vertical: 0.18, tag: "QUIET" },
    { horizontal: 0.2, vertical: 0.82, tag: "SHADE" },
    { horizontal: 0.8, vertical: 0.82, tag: "OPEN" },
  ] as const).map(({ horizontal, vertical, tag }, index) => ({
    cellId: `detail-corner-${index}`,
    // Interior corner points leave the existing mode badge, zoom and record controls clickable.
    center: {
      longitude: west + (east - west) * horizontal,
      latitude: Math.atan(Math.sinh(mercatorY(north) + (mercatorY(south) - mercatorY(north)) * vertical)) * 180 / Math.PI,
    },
    score: 25 + index * 20, confidence: 0.8, count: 3, dominantTag: tag,
    feedbackSource: "REAL", updatedAt: "2026-10-22T03:15:00Z", windowHours: 24,
  }));
}

async function expectInsideMap(page: Page, panel: Locator) {
  await expect.poll(async () => {
    const [container, dialog] = await Promise.all([
      page.getByTestId("map-canvas").boundingBox(), panel.boundingBox(),
    ]);
    return !!container && !!dialog
      && dialog.x >= container.x - 1 && dialog.y >= container.y - 1
      && dialog.x + dialog.width <= container.x + container.width + 1
      && dialog.y + dialog.height <= container.y + container.height + 1;
  }, { message: "The complete dialog must fit within the map, including near an edge." }).toBe(true);
}

for (const width of [390, 320]) {
  test(`C explicit feedback uses the moved center and retains a failed QUIET draft at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const { reports, heatmapUrls } = await mockBackend(page);
    await enterMap(page);
    await expect.poll(() => heatmapUrls.length).toBeGreaterThan(0);
    const previousZoom = Number(new URL(heatmapUrls[heatmapUrls.length - 1]).searchParams.get("zoom"));
    const zoomedViewport = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === "/api/v1/heatmap" && Number(url.searchParams.get("zoom")) === previousZoom + 1;
    });
    // A real control click must zoom the map without bubbling into long-press feedback.
    await page.getByRole("button", { name: "放大地图", exact: true }).click();
    const zoomedUrl = (await zoomedViewport).url();
    expect(Number(new URL(zoomedUrl).searchParams.get("zoom"))).toBe(previousZoom + 1);
    await expect(page.getByRole("dialog", { name: "情绪反馈面板", exact: true })).toHaveCount(0);
    await expect(page.getByText("正在更新情绪热力图", { exact: true })).toHaveCount(0);
    const lastBbox = new URL(heatmapUrls[heatmapUrls.length - 1]).searchParams.get("bbox");
    const movedViewport = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === "/api/v1/heatmap" && url.searchParams.get("bbox") !== lastBbox;
    });
    await page.getByTestId("offline-map").focus();
    await page.keyboard.press("ArrowLeft");
    const expected = centerOfViewport((await movedViewport).url());
    // A fixed campus center would pass an unpanned example; this must use the new viewport.
    expect(Math.abs(expected.longitude - SERVICE_AREA.center.longitude)).toBeGreaterThan(0.0001);
    await expect(page.getByText("正在更新情绪热力图", { exact: true })).toHaveCount(0);

    const entry = page.getByRole("button", { name: "记录此处感受", exact: true });
    await entry.click();
    const panel = page.getByRole("dialog", { name: "情绪反馈面板", exact: true });
    await expect(panel).toBeVisible();
    await expect(entry).toBeDisabled();
    await expect(panel.locator("button[data-tag]")).toHaveCount(8);
    for (const tag of ["QUIET", "SHADE", "OPEN"]) {
      await expect(panel.locator(`button[data-tag="${tag}"]`)).toBeVisible();
    }
    await panel.getByRole("button", { name: /压力 25/ }).click();
    const quiet = panel.locator('button[data-tag="QUIET"]');
    await expect(quiet).toContainText("安静");
    await quiet.click();
    const failure = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/reports");
    await panel.getByRole("button", { name: "提交反馈", exact: true }).click();
    expect((await failure).status()).toBe(503);
    // The safe API error is rendered inside the still-open draft, not only above the map.
    await expect(panel.getByRole("alert")).toHaveText("服务暂时不可用，请稍后重试。");
    await expect(panel.getByRole("button", { name: /压力 25/ })).toHaveAttribute("aria-pressed", "true");
    await expect(quiet).toHaveAttribute("aria-pressed", "true");
    await expectInsideMap(page, panel);
    const failedDraftScreenshot = testInfo.outputPath(`feedback-error-${width}.png`);
    await page.getByRole("region", { name: "心途——通勤情绪地图", exact: true }).screenshot({ path: failedDraftScreenshot });
    await testInfo.attach(`feedback-error-${width}`, { path: failedDraftScreenshot, contentType: "image/png" });
    await expect(page.getByTestId("emoji-fountain")).toHaveCount(0);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ stressLevel: 25, tag: "QUIET" });
    expect(reports[0].location.longitude).toBeCloseTo(expected.longitude, 5);
    expect(reports[0].location.latitude).toBeCloseTo(expected.latitude, 5);
    expect(reports[0].location.longitude).toBeGreaterThanOrEqual(SERVICE_AREA.bounds.west);
    expect(reports[0].location.latitude).toBeGreaterThanOrEqual(SERVICE_AREA.bounds.south);

    const saved = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/reports");
    await panel.getByRole("button", { name: "提交反馈", exact: true }).click();
    expect((await saved).status()).toBe(201);
    await expect(panel).toHaveCount(0);
    expect(reports).toHaveLength(2);
    expect(reports[1].location).toEqual(reports[0].location);
    expect(reports[1]).toMatchObject({ stressLevel: 25, tag: "QUIET" });
    await expect(entry).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test(`C keyboard reaches the newly enabled submit and duplicate feedback resets on reopening at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { reports } = await mockBackend(page, "duplicate");
    await enterMap(page);
    const entry = page.getByRole("button", { name: "记录此处感受", exact: true });
    await entry.click();
    const panel = page.getByRole("dialog", { name: "情绪反馈面板", exact: true });
    const submit = panel.getByRole("button", { name: "提交反馈", exact: true });
    const close = panel.getByRole("button", { name: "关闭反馈面板", exact: true });
    await expect(submit).toBeDisabled();
    await panel.getByRole("button", { name: /压力 0 / }).click();
    await panel.locator('button[data-tag="OPEN"]').click();
    await expect(submit).toBeEnabled();
    // The focus cycle must be recalculated after submit changes from disabled to enabled.
    await panel.locator("button[data-tag]").last().focus();
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(submit).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("status")).toContainText("已记录");
    await expect(panel).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(entry).toBeDisabled();
    await expect(page.getByTestId("emoji-fountain")).toHaveCount(0);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ stressLevel: 0, tag: "OPEN" });
    await expectInsideMap(page, panel);
    await close.click();
    await expect(panel).toHaveCount(0);
    await expect(entry).toBeFocused();
    await entry.click();
    await expect(panel).toBeVisible();
    await expect(page.getByText("这条反馈已提交过，无需重复提交。", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await expect(panel.getByRole("status")).toHaveCount(0);
    await expect(panel.getByText(/已记录/)).toHaveCount(0);
    await expect(submit).toBeDisabled();
    await expect(panel.locator('button[aria-pressed="true"]')).toHaveCount(0);
    // Escape closes an idle draft and returns focus to the explicit entry as well.
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(entry).toBeFocused();
    expect(reports).toHaveLength(1);
  });

  test(`C feedback remains inside all four map corners at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { reports } = await mockBackend(page);
    await enterMap(page);
    const map = page.getByRole("region", { name: "心途——通勤情绪地图", exact: true });
    const canvas = page.getByTestId("map-canvas");
    await canvas.scrollIntoViewIfNeeded();
    const panel = page.getByRole("dialog", { name: "情绪反馈面板", exact: true });
    for (const [horizontal, vertical] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      const pointer = {
        button: 0, pointerType: "mouse", isPrimary: true, pointerId: 42,
        clientX: box!.x + (horizontal ? box!.width - 8 : 8),
        clientY: box!.y + (vertical ? box!.height - 8 : 8),
      };
      await map.dispatchEvent("pointerdown", pointer);
      await expect(panel).toBeVisible();
      await map.dispatchEvent("pointerup", pointer);
      await expectInsideMap(page, panel);
      await expect(panel.locator("button[data-tag]")).toHaveCount(8);
      await panel.getByRole("button", { name: "关闭反馈面板", exact: true }).click();
      await expect(panel).toHaveCount(0);
    }
    expect(reports).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test(`C heatmap metadata details stay reachable at all four map corners at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const { reports, heatmapUrls, holdNextHeatmap } = await mockBackend(page, "retry", metadataCellsForViewport);
    await enterMap(page);
    await expect.poll(() => heatmapUrls.length).toBeGreaterThan(0);
    for (const cell of metadataCellsForViewport(heatmapUrls[heatmapUrls.length - 1])) {
      expect(cell.center.longitude).toBeGreaterThanOrEqual(SERVICE_AREA.bounds.west);
      expect(cell.center.longitude).toBeLessThanOrEqual(SERVICE_AREA.bounds.east);
      expect(cell.center.latitude).toBeGreaterThanOrEqual(SERVICE_AREA.bounds.south);
      expect(cell.center.latitude).toBeLessThanOrEqual(SERVICE_AREA.bounds.north);
    }
    const map = page.getByRole("region", { name: "心途——通勤情绪地图", exact: true });
    await expect(page.getByTestId("heatmap-point")).toHaveCount(4);
    const details = page.getByRole("dialog", { name: "热力点详情", exact: true });
    const labels = ["噪音", "安静", "树荫", "开阔"];
    for (let index = 0; index < labels.length; index++) {
      const point = page.locator(`[data-cell-id="detail-corner-${index}"]`);
      // A normal user click, without force or dispatch, also checks that routes do not cover the point.
      await point.click();
      await expect(details).toBeVisible();
      await expect(details.getByText(labels[index], { exact: true })).toBeVisible();
      await expect(details.getByText("3 条反馈", { exact: true })).toBeVisible();
      await expect(details.getByText("来源：真实反馈", { exact: true })).toBeVisible();
      await expect(details.getByText(/更新时间：.*2026.*10.*22.*11:15:00.*北京时间/)).toBeVisible();
      await expect(details.getByText("统计窗口：24 小时", { exact: true })).toBeVisible();
      await expectInsideMap(page, details);
      const close = details.getByRole("button", { name: "关闭热力点详情", exact: true });
      await expect(close).toBeFocused();
      await close.scrollIntoViewIfNeeded();
      expect(await close.evaluate(button => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit === button || !!hit && button.contains(hit);
      })).toBe(true);
      if (index === labels.length - 1) {
        const screenshot = testInfo.outputPath(`heatmap-details-${width}.png`);
        await map.screenshot({ path: screenshot });
        await testInfo.attach(`heatmap-details-${width}`, { path: screenshot, contentType: "image/png" });
      }
      if (index === 0) {
        const releaseHeatmap = holdNextHeatmap();
        try {
          const refresh = page.waitForRequest(request => new URL(request.url()).pathname === "/api/v1/heatmap");
          await page.getByRole("button", { name: "刷新地图", exact: true }).click();
          await refresh;
          // Keep the real refresh request pending: the loading UI must not block the open details.
          await expect(page.getByText("正在更新情绪热力图", { exact: true })).toBeVisible();
          await expect(details).toBeVisible();
          await close.click();
          await expect(details).toHaveCount(0);
        } finally { releaseHeatmap(); }
        await expect(page.getByText("正在更新情绪热力图", { exact: true })).toHaveCount(0);
      } else if (index % 2 === 0) await close.click();
      else await page.keyboard.press("Escape");
      await expect(details).toHaveCount(0);
      await expect(point).toBeFocused();
    }
    expect(reports).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
