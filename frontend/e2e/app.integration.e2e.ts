import { expect, test, type APIResponse, type Page } from "@playwright/test";

interface HeatmapResponse {
  cellId: string;
}

interface RouteResponse {
  id: string;
  label: string;
}

interface RouteComparisonResponse {
  routes: RouteResponse[];
  fastestRouteId: string;
}

interface TrendResponse {
  points: unknown[];
  recommendation: string;
  totalCommutes: number;
}

function isApiResponse(
  response: APIResponse,
  method: string,
  pathname: string,
): boolean {
  const url = new URL(response.url());
  return response.request().method() === method && url.pathname === pathname;
}

async function waitForInitialApiResponses(page: Page) {
  // Set up ALL response listeners BEFORE navigating
  const heatmapPromise = page.waitForResponse((response) =>
    isApiResponse(response, "GET", "/api/v1/heatmap"),
  );
  const routesPromise = page.waitForResponse((response) =>
    isApiResponse(response, "POST", "/api/v1/routes/compare"),
  );
  const trendsPromise = page.waitForResponse((response) =>
    isApiResponse(response, "GET", "/api/v1/commutes/trends"),
  );

  await page.goto("/");

  // Stage 1: Welcome page — click "查看预设路线" (triggers routes/compare on preview page)
  await page.getByRole("button", { name: "查看预设路线" }).click();

  // Stage 2: Route preview — wait for routes, then click "进入地图"
  await expect(page.getByRole("button", { name: "进入地图" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "进入地图" }).click();

  // Stage 3: Map — triggers heatmap and trends API calls
  await expect(page.locator("[data-map-mode]").first()).toBeVisible();

  const [heatmapRes, routesRes, trendsRes] = await Promise.all([
    heatmapPromise,
    routesPromise,
    trendsPromise,
  ]);

  return [heatmapRes, routesRes, trendsRes] as const;
}

test.describe("Full-stack demo flow", () => {
  test("uses the real API for map, routes, trends, feedback, and commute completion", async ({
    page,
  }) => {
    const [heatmapResponse, routesResponse, trendsResponse] =
      await waitForInitialApiResponses(page);

    expect(heatmapResponse.status()).toBe(200);
    expect(routesResponse.status()).toBe(200);
    expect(trendsResponse.status()).toBe(200);

    const heatmap = (await heatmapResponse.json()) as HeatmapResponse[];
    const comparison =
      (await routesResponse.json()) as RouteComparisonResponse;
    const trends = (await trendsResponse.json()) as TrendResponse;

    expect(heatmap.length).toBeGreaterThan(0);
    expect(comparison.routes.length).toBeGreaterThanOrEqual(2);
    expect(
      comparison.routes.some((route) => route.id === comparison.fastestRouteId),
    ).toBe(true);
    expect(Array.isArray(trends.points)).toBe(true);
    expect(typeof trends.recommendation).toBe("string");
    expect(typeof trends.totalCommutes).toBe("number");

    await expect(page.locator("[data-map-mode]").first()).toHaveAttribute(
      "data-map-mode",
      /amap|offline/,
    );
    await expect(page.getByTestId("heatmap-point").first()).toBeVisible();

    const routePanel = page.getByTestId("route-panel");
    await expect(routePanel).toBeVisible();

    const alternative = comparison.routes.find(
      (route) => route.id !== comparison.fastestRouteId,
    );
    expect(alternative).toBeDefined();

    const alternativeButton = routePanel.getByRole("button", {
      name: `选择 ${alternative!.label}`,
    });
    await alternativeButton.click();
    await expect(alternativeButton).toHaveAttribute("aria-pressed", "true");

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
      timeout: 3000,
    });
    await mapSection.dispatchEvent("pointerup", pointer);

    await page.getByRole("button", { name: /压力 50/ }).click();
    await page.getByRole("button", { name: /原因 噪音/ }).click();

    const reportPromise = page.waitForResponse((response) =>
      isApiResponse(response, "POST", "/api/v1/reports"),
    );
    await page.getByRole("button", { name: "提交反馈" }).click();

    const reportResponse = await reportPromise;
    expect(reportResponse.status()).toBe(201);
    expect(await reportResponse.json()).toMatchObject({
      status: "created",
    });
    await expect(page.getByTestId("feedback-panel")).not.toBeVisible({
      timeout: 5000,
    });

    await page.getByRole("button", { name: "50", exact: true }).click();

    const completePromise = page.waitForResponse((response) =>
      isApiResponse(response, "POST", "/api/v1/commutes/complete"),
    );
    const refreshedTrendsPromise = page.waitForResponse((response) =>
      isApiResponse(response, "GET", "/api/v1/commutes/trends"),
    );

    const completeButton = page.getByRole("button", {
      name: "完成本次通勤",
    });
    await expect(completeButton).toBeEnabled();
    await completeButton.click();

    const completeResponse = await completePromise;
    expect(completeResponse.status()).toBe(200);
    expect(completeResponse.request().postDataJSON()).toMatchObject({
      routeId: alternative!.id,
      endStressLevel: 50,
    });

    const refreshedTrendsResponse = await refreshedTrendsPromise;
    expect(refreshedTrendsResponse.status()).toBe(200);
    const refreshedTrends =
      (await refreshedTrendsResponse.json()) as TrendResponse;
    expect(refreshedTrends.totalCommutes).toBeGreaterThan(
      trends.totalCommutes,
    );
    await expect(
      page.getByText(`共 ${refreshedTrends.totalCommutes} 次通勤`),
    ).toBeVisible();
  });
});
