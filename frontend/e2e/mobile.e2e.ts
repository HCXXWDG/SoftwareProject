import { test, expect, type Page } from "@playwright/test";

/** Reuse mock data & helpers from the main E2E suite */
const MOCK_HEATMAP = [
  {
    cellId: "16:133638:34976",
    center: { longitude: 120.274, latitude: 31.479 },
    score: 68.2,
    confidence: 0.72,
    count: 18,
    dominantTag: "NOISE",
  },
  {
    cellId: "16:133639:34977",
    center: { longitude: 120.275, latitude: 31.481 },
    score: 35.0,
    confidence: 0.5,
    count: 5,
    dominantTag: "CROWD",
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
  await expect(page.getByRole("button", { name: "查看预设路线" })).toBeVisible();
  await page.getByRole("button", { name: "查看预设路线" }).click();
  await expect(page.getByRole("button", { name: "进入地图" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "进入地图" }).click();
  await expect(page.locator("[data-map-mode]").first()).toBeVisible();
}

/* ─── iPhone 14 Pro — 390×844 ─── */
test.describe("Mobile viewport — iPhone 14 Pro (390×844)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("welcome page renders correctly on mobile", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "查看预设路线" })).toBeVisible();
  });

  test("route preview is usable on narrow screen", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await page.getByRole("button", { name: "查看预设路线" }).click();

    const enterMapBtn = page.getByRole("button", { name: "进入地图" });
    await expect(enterMapBtn).toBeVisible({ timeout: 10_000 });

    // Both route cards should be visible
    await expect(page.getByText("最快路线 A")).toBeVisible();
    await expect(page.getByText("少心累路线 B")).toBeVisible();
  });

  test("map loads and heatmap displays on mobile", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await navigateToMap(page);

    const heatmap = page.getByTestId("heatmap-overlay");
    await expect(heatmap.getByTestId("heatmap-point")).toHaveCount(
      MOCK_HEATMAP.length,
    );
  });

  test("route panel visible and selectable on mobile", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await navigateToMap(page);

    const panel = page.getByTestId("route-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("最快路线 A")).toBeVisible();

    // Select calm route
    await panel.getByRole("button", { name: /选择 少心累路线 B/ }).click();
    const calmCard = panel.getByRole("button", { name: /选择 少心累路线 B/ });
    await expect(calmCard).toHaveAttribute("aria-pressed", "true");
  });

  test("long-press feedback works on mobile", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await navigateToMap(page);

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

    // Interact with feedback panel
    await page.getByRole("button", { name: /压力 50/ }).click();
    await page.getByRole("button", { name: /原因 噪音/ }).click();
    await page.getByRole("button", { name: "提交反馈" }).click();
    await expect(page.getByTestId("feedback-panel")).not.toBeVisible({
      timeout: 5000,
    });
  });
});

/* ─── Android Pixel 7 — 412×915 ─── */
test.describe("Mobile viewport — Pixel 7 (412×915)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
  });

  test("full 3-stage flow on Android viewport", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");

    // Stage 1: Welcome
    await expect(page.getByRole("button", { name: "查看预设路线" })).toBeVisible();
    await page.getByRole("button", { name: "查看预设路线" }).click();

    // Stage 2: Route preview
    await expect(page.getByRole("button", { name: "进入地图" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "进入地图" }).click();

    // Stage 3: Map
    await expect(page.locator("[data-map-mode]").first()).toBeVisible();
    await expect(page.getByTestId("heatmap-overlay")).toBeVisible();
    await expect(page.getByTestId("route-overlay")).toBeVisible();
    await expect(page.getByTestId("route-panel")).toBeVisible();
  });

  test("heatmap click works on Android viewport", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await navigateToMap(page);

    const heatPoint = page
      .getByTestId("heatmap-overlay")
      .getByTestId("heatmap-point")
      .first();
    await heatPoint.click();

    const details = page.getByTestId("heatmap-cell-details");
    await expect(details).toBeVisible();
    await expect(details).toContainText("NOISE");
  });

  test("route legend visible on Android viewport", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await navigateToMap(page);

    await expect(page.getByTestId("route-legend")).toBeVisible();
  });
});
