import { test, expect, type Page } from "@playwright/test";

/** Mock data for API interception */
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

test.describe("Welcome flow & 3-stage navigation", () => {
  test("stage 1: welcome page shows entry button", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");

    // Welcome page should display the entry button
    const entryBtn = page.getByRole("button", { name: "查看预设路线" });
    await expect(entryBtn).toBeVisible();

    // Map should NOT be visible yet
    await expect(page.locator("[data-map-mode]")).not.toBeVisible();
  });

  test("stage 2: route preview shows both routes and enter-map button", async ({
    page,
  }) => {
    await mockAPI(page);
    await page.goto("/");

    // Click to advance to stage 2
    await page.getByRole("button", { name: "查看预设路线" }).click();

    // Route preview should load routes from API
    const enterMapBtn = page.getByRole("button", { name: "进入地图" });
    await expect(enterMapBtn).toBeVisible({ timeout: 10_000 });

    // Both route cards should be visible
    await expect(page.getByText("最快路线 A")).toBeVisible();
    await expect(page.getByText("少心累路线 B")).toBeVisible();

    // Badges should appear
    await expect(page.getByText("最快", { exact: true })).toBeVisible();
    await expect(page.getByText("少心累", { exact: true })).toBeVisible();

    // Map should still NOT be visible
    await expect(page.locator("[data-map-mode]")).not.toBeVisible();
  });

  test("stage 3: map page with heatmap, routes, and legend", async ({
    page,
  }) => {
    await mockAPI(page);
    await page.goto("/");

    // Navigate through all 3 stages
    await page.getByRole("button", { name: "查看预设路线" }).click();
    await expect(page.getByRole("button", { name: "进入地图" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "进入地图" }).click();

    // Map surface should be visible
    const mapMode = page.locator("[data-map-mode]").first();
    await expect(mapMode).toBeVisible();

    // Heatmap overlay
    await expect(page.getByTestId("heatmap-overlay")).toBeVisible();
    await expect(page.getByTestId("heatmap-point")).toHaveCount(
      MOCK_HEATMAP.length,
    );

    // Route overlay + legend
    await expect(page.getByTestId("route-overlay")).toBeVisible();
    await expect(page.getByTestId("route-legend")).toBeVisible();

    // Route panel
    await expect(page.getByTestId("route-panel")).toBeVisible();
  });

  test("full flow: welcome → preview → map → feedback → submit", async ({
    page,
  }) => {
    await mockAPI(page);
    await page.goto("/");

    // Stage 1: Welcome
    await page.getByRole("button", { name: "查看预设路线" }).click();

    // Stage 2: Route preview
    await expect(page.getByRole("button", { name: "进入地图" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "进入地图" }).click();

    // Stage 3: Map
    await expect(page.locator("[data-map-mode]").first()).toBeVisible();

    // Long-press for feedback
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
    await expect(page.getByTestId("feedback-panel")).toBeVisible({
      timeout: 5000,
    });
    await mapSection.dispatchEvent("pointerup", pointer);

    // Fill and submit feedback
    await page.getByRole("button", { name: /压力 50/ }).click();
    await page.getByRole("button", { name: /原因 噪音/ }).click();
    await page.getByRole("button", { name: "提交反馈" }).click();

    // Panel should close
    await expect(page.getByTestId("feedback-panel")).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("route selection persists across the flow", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");

    // Navigate to map
    await page.getByRole("button", { name: "查看预设路线" }).click();
    await expect(page.getByRole("button", { name: "进入地图" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "进入地图" }).click();
    await expect(page.locator("[data-map-mode]").first()).toBeVisible();

    const panel = page.getByTestId("route-panel");

    // Initially fast route is selected
    const fastCard = panel.getByRole("button", { name: /选择 最快路线 A/ });
    await expect(fastCard).toHaveAttribute("aria-pressed", "true");

    // Switch to calm route
    await panel.getByRole("button", { name: /选择 少心累路线 B/ }).click();
    const calmCard = panel.getByRole("button", { name: /选择 少心累路线 B/ });
    await expect(calmCard).toHaveAttribute("aria-pressed", "true");

    // Fast route should no longer be pressed
    await expect(fastCard).toHaveAttribute("aria-pressed", "false");
  });
});
