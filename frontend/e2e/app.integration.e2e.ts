import { expect, test, type Response, type Page } from "@playwright/test";

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
  snapshotId: string;
  routeSource: string;
  scoringStatus: string;
}

interface TrendResponse {
  points: unknown[];
  recommendation: string;
  totalCommutes: number;
  excludedDemoCommutes?: number;
}

function isApiResponse(
  response: Response,
  method: string,
  pathname: string,
): boolean {
  const url = new URL(response.url());
  return response.request().method() === method && url.pathname === pathname;
}

async function waitForInitialApiResponses(page: Page) {
  // Set up ALL response listeners BEFORE navigating
  // A viewport change can cancel the initial heatmap after its headers arrive.
  // Accept the completed response, retaining the status/body assertions below.
  const heatmapPromise = page.waitForResponse(async (response) =>
    isApiResponse(response, "GET", "/api/v1/heatmap") && await response.finished() === null,
  );
  const routesPromise = page.waitForResponse((response) =>
    isApiResponse(response, "POST", "/api/v1/routes/compare"),
  );
  const trendsPromise = page.waitForResponse((response) =>
    isApiResponse(response, "GET", "/api/v1/commutes/trends"),
  );

  await page.goto("/");

  // A's current campus entry triggers routes/compare on the preview page.
  await page.getByRole("button", { name: "查看路线", exact: true }).click();

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
    expect(comparison.routeSource).toBe("DEMO");
    expect(comparison.scoringStatus).toBe("UNAVAILABLE");
    expect(comparison.snapshotId).toMatch(/^[a-f0-9-]{36}$/i);
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

    // D07 demo candidates have no verifiable scores; A exposes choices without score cards.
    await expect(page.getByTestId("route-panel")).toHaveCount(0);
    const routeChoices = page.getByRole("navigation", { name: "路线对比", exact: true });
    await expect(routeChoices).toBeVisible();

    const alternative = comparison.routes.find(
      (route) => route.id !== comparison.fastestRouteId,
    );
    expect(alternative).toBeDefined();

    const alternativeButton = routeChoices.getByRole("button", {
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
    await page.getByRole("button", { name: /原因 安静/ }).click();

    const reportPromise = page.waitForResponse((response) =>
      isApiResponse(response, "POST", "/api/v1/reports"),
    );
    await page.getByRole("button", { name: "提交反馈" }).click();

    const reportResponse = await reportPromise;
    expect(reportResponse.status()).toBe(201);
    expect(reportResponse.request().postDataJSON()).toMatchObject({ stressLevel: 50, tag: "QUIET" });
    expect(await reportResponse.json()).toMatchObject({
      status: "created",
    });
    await expect(page.getByTestId("feedback-panel")).not.toBeVisible({
      timeout: 5000,
    });

    await page.getByRole("button", { name: "50 · 一般", exact: true }).click();

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
    expect(completeResponse.status()).toBe(201);
    const submitted = completeResponse.request().postDataJSON();
    expect(submitted).toMatchObject({
      snapshotId: comparison.snapshotId,
      routeId: alternative!.id,
      endStressLevel: 50,
    });
    expect(Object.keys(submitted).sort()).toEqual(["snapshotId", "operationId", "routeId", "endStressLevel", "completedAt"].sort());
    const receipt = await completeResponse.json();
    expect(receipt).toMatchObject({ status: "created", routeSource: "DEMO", operationId: submitted.operationId });
    expect(receipt.selectedScore ?? null).toBeNull();

    const refreshedTrendsResponse = await refreshedTrendsPromise;
    expect(refreshedTrendsResponse.status()).toBe(200);
    const refreshedTrends =
      (await refreshedTrendsResponse.json()) as TrendResponse;
    // D07 stores DEMO but excludes it from real counts; it must not turn into a real commute.
    expect(refreshedTrends.totalCommutes).toBe(trends.totalCommutes);
    expect(refreshedTrends.excludedDemoCommutes).toBe((trends.excludedDemoCommutes ?? 0) + 1);
    await expect(
      page.getByText(`共 ${refreshedTrends.totalCommutes} 次通勤`),
    ).toBeVisible();
    await expect(page.getByText("暂无路线评分", { exact: true })).toBeVisible();
    await expect(page.getByText("这是演示通勤，不会计入真实趋势或通勤历史。", { exact: true })).toBeVisible();
    const commuteHistory = await page.request.get(new URL("/api/v1/commutes/history", completeResponse.url()).href, {
      headers: { "X-Device-Id": completeResponse.request().headers()["x-device-id"] },
    });
    expect(commuteHistory.status()).toBe(200);
    const history = await commuteHistory.json();
    expect(Array.isArray(history)).toBe(true);
    expect(history.some((item: { commuteId?: string }) => item.commuteId === receipt.commuteId)).toBe(false);
  });
});
