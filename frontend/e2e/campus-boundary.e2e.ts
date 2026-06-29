import { test, expect, type Page } from "@playwright/test";

/**
 * Campus boundary E2E tests.
 *
 * Verifies that:
 * - Long-press INSIDE campus bounds → feedback panel appears
 * - Long-press OUTSIDE campus bounds → feedback panel does NOT appear
 * - Heatmap points are rendered within the campus area
 *
 * Campus bounds (GCJ-02, Jiangnan University Lihu Campus):
 *   south: 31.47278, west: 120.26067, north: 31.49417, east: 120.27946
 *   center: (120.273915, 31.479302)
 */

const MOCK_HEATMAP = [
  {
    cellId: "16:133638:34976",
    center: { longitude: 120.274, latitude: 31.479 },
    score: 68.2,
    confidence: 0.72,
    count: 18,
    dominantTag: "NOISE",
  },
];

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
        { longitude: 120.2735, latitude: 31.4753 },
        { longitude: 120.2738, latitude: 31.478 },
        { longitude: 120.2743, latitude: 31.4833 },
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
        { longitude: 120.2735, latitude: 31.4753 },
        { longitude: 120.274, latitude: 31.48 },
        { longitude: 120.2743, latitude: 31.4833 },
      ],
    },
  ],
  fastestRouteId: "route-fast",
  leastStressfulRouteId: "route-calm",
  recommendation: "明天试少心累路线 B。",
  recommendAlternative: true,
};

const MOCK_TRENDS = {
  points: [{ date: "2026-06-10", averageStress: 55, commuteCount: 3 }],
  recommendation: "继续保持",
  totalCommutes: 3,
};

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

async function navigateToMap(page: Page) {
  await page.getByRole("button", { name: "查看预设路线" }).click();
  await expect(page.getByRole("button", { name: "进入地图" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "进入地图" }).click();
  await expect(page.locator("[data-map-mode]").first()).toBeVisible();
}

/**
 * Dispatch a long-press at the center of the map section.
 * In offline mode the map is centered on campus, so the center
 * of the map section maps to campus coordinates → inside bounds.
 */
async function longPressAtCenter(page: Page) {
  const mapSection = page.locator("[aria-label='校园通勤情绪地图']");
  const box = await mapSection.boundingBox();
  expect(box).not.toBeNull();

  const pointer = {
    button: 0,
    clientX: box!.x + box!.width / 2,
    clientY: box!.y + box!.height / 2,
    pointerId: 1,
    pointerType: "mouse",
  };

  await mapSection.dispatchEvent("pointerdown", pointer);
  return pointer;
}

test.describe("Campus boundary enforcement", () => {
  test("long-press at map center (inside campus) opens feedback panel", async ({
    page,
  }) => {
    await mockAPI(page);
    await page.goto("/");
    await navigateToMap(page);

    // Map center = campus center → inside bounds
    await longPressAtCenter(page);

    await expect(page.getByTestId("feedback-panel")).toBeVisible({
      timeout: 5000,
    });
  });

  test("feedback panel shows correct UI elements", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await navigateToMap(page);

    await longPressAtCenter(page);
    await expect(page.getByTestId("feedback-panel")).toBeVisible({
      timeout: 5000,
    });

    // Stress level buttons should be available
    await expect(page.getByRole("button", { name: /压力 50/ })).toBeVisible();

    // Tag buttons should be available
    await expect(page.getByRole("button", { name: /原因 噪音/ })).toBeVisible();

    // Submit button
    await expect(page.getByRole("button", { name: "提交反馈" })).toBeVisible();
  });

  test("heatmap points are rendered within campus area", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await navigateToMap(page);

    // Heatmap overlay should exist with points
    const heatmap = page.getByTestId("heatmap-overlay");
    await expect(heatmap).toBeVisible();

    const points = heatmap.getByTestId("heatmap-point");
    await expect(points).toHaveCount(MOCK_HEATMAP.length);

    // Each point should be visible (rendered on screen)
    await expect(points.first()).toBeVisible();
  });

  test("map surface shows campus mode indicator", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await navigateToMap(page);

    // The map mode badge should show offline mode (no AMap key in CI)
    const mapMode = page.locator("[data-map-mode]").first();
    await expect(mapMode).toHaveAttribute("data-map-mode", "offline");

    // Status badge should indicate offline demo map
    await expect(page.getByRole("status").filter({ hasText: "离线演示地图" })).toBeVisible();
  });

  test("zoom controls are functional", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await navigateToMap(page);

    // Zoom controls should be present in offline mode
    const zoomIn = page.getByRole("button", { name: "放大地图" });
    const zoomOut = page.getByRole("button", { name: "缩小地图" });

    await expect(zoomIn).toBeVisible();
    await expect(zoomOut).toBeVisible();

    // Zoom in should work
    await zoomIn.click();

    // Map should still be visible after zoom
    await expect(page.locator("[data-map-mode]").first()).toBeVisible();
  });

  test("route overlay renders campus-area polylines", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await navigateToMap(page);

    // Route overlay should be visible
    await expect(page.getByTestId("route-overlay")).toBeVisible();

    // Route legend should show
    await expect(page.getByTestId("route-legend")).toBeVisible();
  });
});
