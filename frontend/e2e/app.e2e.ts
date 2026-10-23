import { test, expect, type Page } from "@playwright/test";

/** District fixtures have separate hit targets at the city overview zoom. */
const MOCK_HEATMAP = [
  {
    cellId: "16:133638:34976",
    center: { longitude: 120.286591, latitude: 31.576878 },
    score: 68.2,
    confidence: 0.72,
    count: 18,
    dominantTag: "NOISE",
  },
  {
    cellId: "16:133639:34977",
    center: { longitude: 120.306591, latitude: 31.566878 },
    score: 35.0,
    confidence: 0.5,
    count: 5,
    dominantTag: "CROWD",
  },
];

/** A controlled REAL/REAL/VALID fixture, not evidence of real provider acceptance. */
const MOCK_ROUTES = {
  routes: [
    {
      id: "route-fast",
      label: "最快路线 A",
      distanceMeters: 2100,
      durationSeconds: 720,
      stressExposure: 67.2,
      stressScore: 50.4,
      confidence: 0.68,
      fastest: true,
      leastStressful: false,
      polyline: [
        { longitude: 120.296186, latitude: 31.567904 },
        { longitude: 120.296476, latitude: 31.570576 },
        { longitude: 120.296995, latitude: 31.575851 },
      ],
    },
    {
      id: "route-calm",
      label: "少心累路线 B",
      distanceMeters: 2800,
      durationSeconds: 960,
      stressExposure: 30.1,
      stressScore: 25.0,
      confidence: 0.72,
      fastest: false,
      leastStressful: true,
      polyline: [
        { longitude: 120.296186, latitude: 31.567904 },
        { longitude: 120.296676, latitude: 31.572576 },
        { longitude: 120.296995, latitude: 31.575851 },
      ],
    },
  ],
  fastestRouteId: "route-fast",
  leastStressfulRouteId: "route-calm",
  recommendation: "本次推荐少心累路线 B。",
  recommendAlternative: true,
  routeSource: "REAL",
  feedbackSource: "REAL",
  scoringStatus: "VALID",
  snapshotId: "00000000-0000-4000-8000-000000000001",
  scoringVersion: "walking-distance-v2",
  travelMode: "WALKING",
  recommendationReason: "RECOMMENDED",
};

const MOCK_TRENDS = {
  points: [
    { date: "2026-06-10", averageStress: 55, commuteCount: 3 },
  ],
  recommendation: "继续保持",
  totalCommutes: 3,
};

/** Intercept all backend API calls and return mock data */
async function mockAPI(page: Page) {
  await page.route("**/api/v1/routes/history*", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/heatmap*", (route) =>
    route.fulfill({ json: MOCK_HEATMAP }),
  );
  await page.route("**/api/v1/routes/compare", (route) =>
    route.fulfill({ json: MOCK_ROUTES }),
  );
  await page.route("**/api/v1/commutes/trends*", (route) =>
    route.fulfill({ json: MOCK_TRENDS }),
  );
  await page.route("**/api/v1/reports", (route) =>
    route.fulfill({ status: 201, json: { status: "created", code: "report_created", counted: true, message: "反馈已保存" } }),
  );
}

/** Navigate through the 3-stage flow: welcome → route-preview → map */
async function navigateToMap(page: Page) {
  // Stage 1: Welcome page — click "查看路线"
  await expect(page.getByRole("button", { name: "查看路线" })).toBeVisible();
  await page.getByRole("button", { name: "查看路线" }).click();
  await expect(page.getByRole("heading", { name: "路线预览", exact: true })).toBeVisible();

  // Stage 2: Route preview — wait for routes, click "进入地图"
  await expect(page.getByRole("button", { name: "进入地图" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "进入地图" }).click();

  // Stage 3: Map page — wait for map to be ready
  await waitForMapReady(page);
}

/** Wait for the map surface to be ready (works for both amap and offline modes) */
async function waitForMapReady(page: Page) {
  await expect(page.locator("[data-map-mode]").first()).toHaveAttribute("data-map-mode", /amap|offline/);
  await expect(page.locator(".map-page__loading")).toHaveCount(0);
  await expect(page.getByText("正在更新情绪热力图", { exact: true })).toHaveCount(0);
}

test.describe("Core user flow", () => {
  test("loads map and displays heatmap", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");

    // Navigate through 3-stage flow to map
    await navigateToMap(page);

    // Heat points should be rendered
    const heatmap = page.getByTestId("heatmap-overlay");
    await expect(heatmap.getByTestId("heatmap-point")).toHaveCount(
      MOCK_HEATMAP.length,
    );
  });

  test("clicks heatmap cell and shows details", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");

    // Navigate through 3-stage flow to map
    await navigateToMap(page);

    // Click first heat point
    const heatPoint = page.getByRole("button", { name: /热力点.*压力68.*NOISE/ });
    await heatPoint.click();

    // Cell details should appear
    const details = page.getByTestId("heatmap-cell-details");
    await expect(details).toBeVisible();
    await expect(details).toContainText("噪音");
    await expect(details).toContainText("压力 68");
    await expect(details).toContainText("18 条反馈");
  });

  test("displays route overlay and comparison panel", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");

    // Navigate through 3-stage flow to map
    await navigateToMap(page);

    // Route overlay and panel should be visible
    await expect(page.getByTestId("route-overlay")).toBeVisible();
    await expect(page.getByTestId("route-panel")).toBeVisible();

    // Route cards should appear (scope to route-panel to avoid strict mode)
    const panel = page.getByTestId("route-panel");
    await expect(panel.getByText("最快路线 A")).toBeVisible();
    await expect(panel.getByText("少心累路线 B")).toBeVisible();

    // Badges should appear
    await expect(panel.getByText("最快", { exact: true })).toBeVisible();
    await expect(panel.getByText("少心累", { exact: true })).toBeVisible();

    // Legend should appear on the map
    await expect(page.getByTestId("route-legend")).toBeVisible();
  });

  test("selects a different route from the panel", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");

    // Navigate through 3-stage flow to map
    await navigateToMap(page);

    const panel = page.getByTestId("route-panel");

    // Initially the fast route should be selected
    const fastCard = panel.getByRole("button", { name: /选择 最快路线 A/ });
    await expect(fastCard).toHaveAttribute("aria-pressed", "true");

    // Click the calm route
    await panel.getByRole("button", { name: /选择 少心累路线 B/ }).click();

    // Calm route should now be selected
    const calmCard = panel.getByRole("button", { name: /选择 少心累路线 B/ });
    await expect(calmCard).toHaveAttribute("aria-pressed", "true");
    await expect(fastCard).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('[data-route-id="route-calm"]')).toHaveClass(/--selected/);
  });

  test("long-press opens feedback panel and submits", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");

    // Navigate through 3-stage flow to map
    await navigateToMap(page);

    // Long-press on the map area (dispatchEvent for reliable React pointer capture)
    const mapSection = page.locator("[aria-label='心途——通勤情绪地图']");
    const box = await mapSection.boundingBox();
    expect(box).not.toBeNull();

    const pointer = {
      button: 0,
      clientX: box!.x + box!.width / 2,
      clientY: box!.y + box!.height / 2,
      pointerId: 1,
      pointerType: "mouse",
    };

    // Hold until the application confirms the long press, then release.
    await mapSection.dispatchEvent("pointerdown", pointer);
    await expect(page.getByTestId("feedback-panel")).toBeVisible({
      timeout: 5000,
    });
    await mapSection.dispatchEvent("pointerup", pointer);

    // Select stress level and tag
    await page.getByRole("button", { name: /压力 50/ }).click();
    await page.getByRole("button", { name: /原因 噪音/ }).click();

    // Submit
    await page.getByRole("button", { name: "提交反馈" }).click();

    // Panel should close after successful submit
    await expect(page.getByTestId("feedback-panel")).not.toBeVisible({ timeout: 5000 });
  });

  test("keeps a failed feedback draft and retries with the same location and selections", async ({ page }) => {
    await mockAPI(page);
    const bodies: Record<string, unknown>[] = [];
    await page.route("**/api/v1/reports", route => {
      bodies.push(route.request().postDataJSON());
      return bodies.length === 1
        ? route.fulfill({ status: 503, json: { code: "internal_error", message: "反馈保存失败，请重试。" } })
        : route.fulfill({ status: 201, json: { status: "created", code: "report_created", counted: true, message: "反馈已保存" } });
    });
    await page.goto("/");
    await navigateToMap(page);
    const map = page.getByLabel("心途——通勤情绪地图", { exact: true });
    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    const pointer = { clientX: box!.x + box!.width / 2, clientY: box!.y + box!.height / 2, pointerId: 1, pointerType: "mouse", button: 0 };
    await map.dispatchEvent("pointerdown", pointer);
    const panel = page.getByTestId("feedback-panel");
    await expect(panel).toBeVisible();
    await map.dispatchEvent("pointerup", pointer);
    await panel.getByRole("button", { name: /压力 75/ }).click();
    await panel.getByRole("button", { name: "原因 拥挤", exact: true }).click();
    const failure = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/reports");
    await panel.getByRole("button", { name: "提交反馈", exact: true }).click();
    expect((await failure).status()).toBe(503);
    // A intentionally replaces internal 5xx messages with its localized service error.
    await expect(page.getByRole("alert").filter({ hasText: "服务暂时不可用，请稍后重试。" }).first()).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: /压力 75/ })).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByRole("button", { name: "原因 拥挤", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("emoji-fountain")).toHaveCount(0);
    expect(bodies).toHaveLength(1);
    await panel.getByRole("button", { name: "提交反馈", exact: true }).click();
    await expect(panel).toHaveCount(0);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].location).toEqual(bodies[0].location);
    expect(bodies[1]).toMatchObject({ stressLevel: 75, tag: "CROWD" });
  });

  test("keeps commute submission disabled until the B/D user flow is jointly accepted", async ({ page }) => {
    await mockAPI(page);
    const writes: unknown[] = [];
    await page.route("**/api/v1/commutes/complete", route => {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ status: 503, json: { code: "unexpected_write", message: "本场景不应发送通勤写入" } });
    });
    await page.goto("/");
    await navigateToMap(page);
    await page.getByRole("button", { name: "选择 少心累路线 B", exact: true }).click();
    const submit = page.getByRole("button", { name: "完成本次通勤", exact: true });
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("aria-describedby", "commute-disabled-reason");
    await expect(page.locator("#commute-disabled-reason")).toHaveText("当前路线暂不支持记录通勤，可继续查看路线和历史趋势。");
    expect(writes).toEqual([]);
  });
});
