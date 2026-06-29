import { test, expect, type Page } from "@playwright/test";

/** Mock heatmap cells matching the backend demo data format */
const MOCK_HEATMAP = [
  {
    cellId: "16:129333:44333",
    center: { longitude: 116.4, latitude: 39.91 },
    score: 68.2,
    confidence: 0.72,
    count: 18,
    dominantTag: "NOISE",
  },
  {
    cellId: "16:129334:44334",
    center: { longitude: 116.402, latitude: 39.908 },
    score: 35.0,
    confidence: 0.5,
    count: 5,
    dominantTag: "CROWD",
  },
];

/** Mock route comparison matching the backend demo response */
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
        { longitude: 116.395, latitude: 39.905 },
        { longitude: 116.4, latitude: 39.908 },
        { longitude: 116.405, latitude: 39.91 },
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
        { longitude: 116.395, latitude: 39.905 },
        { longitude: 116.398, latitude: 39.912 },
        { longitude: 116.405, latitude: 39.91 },
      ],
    },
  ],
  fastestRouteId: "route-fast",
  leastStressfulRouteId: "route-calm",
  recommendation: "明天试少心累路线 B。",
  recommendAlternative: true,
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
    route.fulfill({ status: 201, json: { status: "ok", message: "created" } }),
  );
}

/** Navigate through the 3-stage flow: welcome → route-preview → map */
async function navigateToMap(page: Page) {
  // Stage 1: Welcome page — click "查看预设路线"
  await expect(page.getByRole("button", { name: "查看预设路线" })).toBeVisible();
  await page.getByRole("button", { name: "查看预设路线" }).click();

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
  await expect(page.locator("[data-map-mode]").first()).toBeVisible();
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
    const heatPoint = page
      .getByTestId("heatmap-overlay")
      .getByTestId("heatmap-point")
      .first();
    await heatPoint.click();

    // Cell details should appear
    const details = page.getByTestId("heatmap-cell-details");
    await expect(details).toBeVisible();
    await expect(details).toContainText("NOISE");
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
  });

  test("long-press opens feedback panel and submits", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");

    // Navigate through 3-stage flow to map
    await navigateToMap(page);

    // Long-press on the map area
    const mapSection = page.locator("[aria-label='校园通勤情绪地图']");
    const box = await mapSection.boundingBox();
    expect(box).not.toBeNull();

    // Hold until the application confirms the long press, then release.
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId("feedback-panel")).toBeVisible({
      timeout: 3000,
    });
    await page.mouse.up();

    // Select stress level and tag
    await page.getByRole("button", { name: /压力 50/ }).click();
    await page.getByRole("button", { name: /原因 噪音/ }).click();

    // Submit
    await page.getByRole("button", { name: "提交反馈" }).click();

    // Panel should close after successful submit
    await expect(page.getByTestId("feedback-panel")).not.toBeVisible({ timeout: 5000 });
  });
});
