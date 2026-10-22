import { expect, test } from "@playwright/test";

test("B demo compare with omitted scores and snapshotId reaches the map without enabling unfinished commute writes", async ({ page }) => {
  const commuteWrites: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/commutes/complete") commuteWrites.push(request.url());
  });
  const comparisonResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/v1/routes/compare");
  await page.goto("/");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  const response = await comparisonResponse;
  expect(response.status()).toBe(200);
  const comparison = await response.json();
  expect(comparison.routeSource).toBe("DEMO");
  expect(comparison.scoringStatus).not.toBe("VALID");
  expect(comparison.snapshotId).toMatch(/^[a-f0-9-]{36}$/i);
  expect(comparison.routes.length).toBeGreaterThan(0);
  expect(comparison.leastStressfulRouteId ?? null).toBeNull();
  for (const route of comparison.routes) {
    expect(route.stressScore ?? null).toBeNull();
    expect(route.stressExposure ?? null).toBeNull();
  }
  await expect(page.getByRole("heading", { name: "路线预览", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("演示路线 · 评分不可用", { exact: true })).toBeVisible();
  await expect(page.getByText(/心累指数/)).toHaveCount(0);
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "通勤导航" })).toBeVisible();
  await expect(page.getByRole("button", { name: "完成本次通勤", exact: true })).toBeDisabled();
  await expect(page.getByText("演示通勤记录尚待接口联调，不会计入真实趋势。", { exact: true })).toBeVisible();
  await expect(page.getByTestId("route-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^选择 / })).toHaveCount(comparison.routes.length);
  expect(commuteWrites).toEqual([]);
});
