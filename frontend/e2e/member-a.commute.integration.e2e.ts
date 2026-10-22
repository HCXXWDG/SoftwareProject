import { expect, test, type Page } from "@playwright/test";

const comparePath = "/api/v1/routes/compare";
const completePath = "/api/v1/commutes/complete";
async function enterMap(page: Page) {
  const response = page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).pathname === comparePath);
  await page.goto("/");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  const comparison = await (await response).json();
  expect(comparison.routeSource).toBe("DEMO");
  expect(comparison.snapshotId).toMatch(/^[a-f0-9-]{36}$/i);
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "通勤导航" })).toBeVisible();
  await expect(page.getByText(/数据服务：可连接/)).toBeVisible();
  return comparison;
}

for (const width of [390, 320]) {
  test(`D07 records an unscored demo at ${width}px and excludes it from real trends`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const comparison = await enterMap(page);
    const chosen = comparison.routes[comparison.routes.length - 1];
    await page.getByRole("button", { name: `选择 ${chosen.label}`, exact: true }).click();
    const complete = page.getByRole("button", { name: "完成本次通勤", exact: true });
    await expect(complete).toBeDisabled();
    await page.getByRole("button", { name: "0 · 非常轻松", exact: true }).click();
    await expect(complete).toBeEnabled();
    const savedResponse = page.waitForResponse(response => response.request().method() === "POST"
      && new URL(response.url()).pathname === completePath);
    await complete.click();
    const response = await savedResponse;
    expect(response.status()).toBe(201);
    const submitted = response.request().postDataJSON();
    expect(submitted).toMatchObject({ snapshotId: comparison.snapshotId, routeId: chosen.id, endStressLevel: 0 });
    expect(Object.keys(submitted).sort()).toEqual(["snapshotId", "routeId", "endStressLevel", "operationId", "completedAt"].sort());
    const receipt = await response.json();
    expect(receipt).toMatchObject({ status: "created", routeSource: "DEMO" });
    expect(receipt.selectedScore ?? null).toBeNull();
    const panel = page.getByRole("region", { name: "通勤记录", exact: true });
    await expect(panel.getByText("通勤已记录。", { exact: true })).toBeVisible();
    await expect(panel.getByText("暂无路线评分", { exact: true })).toBeVisible();
    await expect(panel.getByText("这是演示通勤，不会计入真实趋势或通勤历史。", { exact: true })).toBeVisible();
    await expect(page.getByText("已从趋势中排除 1 次演示通勤。", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("commute-saved.png"), fullPage: true });
    await panel.getByRole("button", { name: "开始下一次通勤" }).click();
    await expect(page.getByRole("heading", { name: "路线预览", exact: true })).toBeVisible();
  });
}

test("a real saved write with a lost receipt survives reload and replays the same operation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const comparison = await enterMap(page);
  const bodies: unknown[] = [];
  let originalReceipt: Record<string, unknown> | undefined;
  await page.route(`**${completePath}`, async route => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
      // The real backend saves first; only its response is dropped, never substituted.
      const saved = await route.fetch();
      expect(saved.status()).toBe(201);
      originalReceipt = await saved.json();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "25 · 比较轻松", exact: true }).click();
  await page.getByRole("button", { name: "完成本次通勤", exact: true }).click();
  await expect(page.getByRole("button", { name: "重试原通勤", exact: true })).toBeEnabled();
  expect(bodies).toHaveLength(1);
  const nextComparison = page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).pathname === comparePath);
  await page.reload();
  const newer = await (await nextComparison).json();
  expect(newer.snapshotId).not.toBe(comparison.snapshotId);
  await expect(page.getByRole("heading", { name: "路线预览", exact: true })).toBeVisible();
  await expect(page.getByText("已保留到达感受：比较轻松，重试不会修改原提交。", { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(1);
  const duplicateResponse = page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).pathname === completePath);
  await page.getByRole("button", { name: "重试原通勤", exact: true }).click();
  const duplicate = await duplicateResponse;
  expect(duplicate.status()).toBe(200);
  expect(await duplicate.json()).toMatchObject({ status: "duplicate", commuteId: originalReceipt!.commuteId });
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  await expect(page.getByText("这次通勤已记录，无需重复提交。", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("commute-pending-v1"))).toBeNull();
});
