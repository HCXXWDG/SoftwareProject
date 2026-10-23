import { expect, test, type Page } from "@playwright/test";
import { emptyTrend, routeComparison } from "../src/test/fixtures";

async function enterHeatmap(page: Page) {
  const bboxes: string[] = [];
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/routes/compare") return route.fulfill({ json: routeComparison });
    if (url.pathname === "/api/v1/commutes/trends") return route.fulfill({ json: emptyTrend });
    if (url.pathname === "/api/v1/heatmap") {
      bboxes.push(url.searchParams.get("bbox")!);
      const [west, south, east, north] = url.searchParams.get("bbox")!.split(",").map(Number);
      return route.fulfill({ json: [
        { cellId: "quiet", center: { longitude: west + (east - west) * 0.25, latitude: south + (north - south) * 0.65 },
          score: 0, confidence: 0.1, count: 1, dominantTag: "QUIET", feedbackSource: "REAL" },
        { cellId: "crowd", center: { longitude: west + (east - west) * 0.75, latitude: south + (north - south) * 0.35 },
          score: 100, confidence: 0.9, count: 20, dominantTag: "CROWD", feedbackSource: "REAL" },
      ] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  const point = page.locator('[data-testid="heatmap-point"][data-cell-id="quiet"]');
  await expect(point).toBeVisible();
  await page.getByTestId("heatmap-overlay").evaluate(element => element.scrollIntoView({ block: "center" }));
  return { point, bboxes };
}

for (const width of [390, 320]) {
  test(`Hotspots have a clear touch target, lasting selection and focus without scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { point } = await enterHeatmap(page);
    const size = await point.boundingBox();
    expect(size!.width).toBeGreaterThanOrEqual(44);
    expect(size!.height).toBeGreaterThanOrEqual(44);
    const styles = await point.evaluate(element => ({
      filter: getComputedStyle(element).filter,
      opacity: getComputedStyle(element).opacity,
      haloFilter: getComputedStyle(element.querySelector(".heatmap-point__halo")!).filter,
    }));
    expect(styles.filter).toBe("none");
    expect(styles.opacity).toBe("1");
    expect(styles.haloFilter).toContain("blur(");
    await point.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    const box = await point.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect(point).toHaveAttribute("data-pressed", "true");
    await page.mouse.up();
    await expect(point).toHaveAttribute("aria-pressed", "true");
    const details = page.getByRole("dialog", { name: "热力点详情", exact: true });
    await expect(details).toHaveAttribute("data-cell-id", "quiet");
    await expect(details.getByText("压力 0", { exact: true })).toBeVisible();
    await expect(details.getByText("来源：真实反馈", { exact: true })).toBeVisible();
    await expect(details.getByText("更新时间：未提供", { exact: true })).toBeVisible();
    expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
    await expect(point).toBeFocused();
    expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Enter");
    await expect(details).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Space");
    await expect(details).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("Dragging from a hotspot pans the map and does not open a heatmap or feedback dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { point, bboxes } = await enterHeatmap(page);
  await expect.poll(() => bboxes.length).toBeGreaterThan(0);
  // Wait for the initial viewport query to settle before observing the drag.
  await expect(page.getByText("正在更新情绪热力图", { exact: true })).toHaveCount(0);
  const initialBbox = bboxes[bboxes.length - 1];
  const routeLine = page.getByTestId("route-overlay").locator("polyline").first();
  const before = await routeLine.getAttribute("points");
  const box = await point.boundingBox();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 55, y + 25, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(point).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => routeLine.getAttribute("points")).not.toBe(before);
  await expect.poll(() => bboxes[bboxes.length - 1]).not.toBe(initialBbox);
  await point.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "热力点详情", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await point.click();
  await expect(page.getByRole("dialog", { name: "热力点详情", exact: true })).toBeVisible();
});

test("A browser touch drag on a hotspot pans the map without scrolling the page or opening details", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { point, bboxes } = await enterHeatmap(page);
  await expect(page.getByText("正在更新情绪热力图", { exact: true })).toHaveCount(0);
  const initialBbox = bboxes[bboxes.length - 1];
  expect(await point.evaluate(element => getComputedStyle(element).touchAction)).toBe("none");
  const scrollBefore = await page.evaluate(() => scrollY);
  const box = await point.boundingBox();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await expect(point).toHaveAttribute("data-pressed", "true");
    for (let step = 1; step <= 6; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + step * 10, y: y + step * 5 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => bboxes[bboxes.length - 1]).not.toBe(initialBbox);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(Math.abs(await page.evaluate(() => scrollY) - scrollBefore)).toBeLessThanOrEqual(1);
  } finally { await cdp.detach(); }
});
