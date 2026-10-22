import { expect, test, type Page } from "@playwright/test";

const completePath = "/api/v1/commutes/complete";
async function waitForWorker(page: Page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}
async function enterMap(page: Page) {
  await page.goto("/");
  await waitForWorker(page);
  const response = page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).pathname === "/api/v1/routes/compare");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  const comparison = await (await response).json();
  expect(comparison.routeSource).toBe("DEMO");
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  await expect(page.getByText(/数据服务：可连接/)).toBeVisible();
  return comparison;
}
async function apiCacheEntries(page: Page) {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        if (new URL(request.url).pathname.startsWith("/api/")) urls.push(request.url);
      }
    }
    return urls;
  });
}
async function pendingRequest(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("commute-pending-v1")!).request);
}
function trackWrites(page: Page) {
  const bodies: unknown[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === completePath) bodies.push(request.postDataJSON());
  });
  return bodies;
}
async function submit(page: Page, level = "25 · 比较轻松") {
  await page.getByRole("button", { name: level, exact: true }).click();
  await page.getByRole("button", { name: "完成本次通勤", exact: true }).click();
}
async function reconnectWithoutAutomaticWrite(page: Page) {
  // Watch before reconnecting so an immediate or delayed online handler cannot hide behind the user's retry.
  const observed = page.waitForRequest(request => request.method() === "POST"
    && new URL(request.url()).pathname === completePath, { timeout: 1000 })
    .then(() => true, failure => {
      expect(failure).toHaveProperty("name", "TimeoutError");
      return false;
    });
  await page.context().setOffline(false);
  expect(await observed).toBe(false);
}

test("the production PWA records an unscored commute without caching API data", async ({ page }) => {
  const comparison = await enterMap(page);
  const response = page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).pathname === completePath);
  await submit(page, "0 · 非常轻松");
  const saved = await response;
  expect(saved.status()).toBe(201);
  expect(saved.request().postDataJSON()).toMatchObject({ snapshotId: comparison.snapshotId, endStressLevel: 0 });
  expect((await saved.json()).selectedScore ?? null).toBeNull();
  await expect(page.getByText("通勤已记录。", { exact: true })).toBeVisible();
  await expect(page.getByText("暂无路线评分", { exact: true })).toBeVisible();
  await expect(page.getByText("已从趋势中排除 1 次演示通勤。", { exact: true })).toBeVisible();
  expect(await apiCacheEntries(page)).toEqual([]);
});

test("an offline failed write survives an offline shell reload and is sent only by an explicit retry", async ({ page }) => {
  const comparison = await enterMap(page);
  const writes = trackWrites(page);
  await page.context().setOffline(true);
  await submit(page, "75 · 有些心累");
  await expect(page.getByRole("button", { name: "重试原通勤", exact: true })).toBeEnabled();
  const original = await pendingRequest(page);
  expect(original).toMatchObject({ snapshotId: comparison.snapshotId, endStressLevel: 75 });
  expect(writes).toHaveLength(1);
  expect((await page.reload())?.fromServiceWorker()).toBe(true);
  await waitForWorker(page);
  await expect(page.getByRole("heading", { name: "路线预览", exact: true })).toBeVisible();
  await expect(page.getByText("已保留到达感受：有些心累，重试不会修改原提交。", { exact: true })).toBeVisible();
  expect(await pendingRequest(page)).toEqual(original);
  expect(writes).toHaveLength(1);
  expect(await apiCacheEntries(page)).toEqual([]);
  await reconnectWithoutAutomaticWrite(page);
  await expect(page.getByRole("button", { name: "重试原通勤", exact: true })).toBeEnabled();
  expect(writes).toHaveLength(1);
  const savedResponse = page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).pathname === completePath);
  await page.getByRole("button", { name: "重试原通勤", exact: true }).click();
  const saved = await savedResponse;
  expect(saved.status()).toBe(201);
  expect(await saved.json()).toMatchObject({ status: "created" });
  await expect(page.getByText("通勤已记录。", { exact: true })).toBeVisible();
  expect(writes).toEqual([original, original]);
  expect(await page.evaluate(() => sessionStorage.getItem("commute-pending-v1"))).toBeNull();
  expect(await apiCacheEntries(page)).toEqual([]);
});

test("a saved write with a dropped receipt survives offline reload and returns the original record", async ({ page, context }) => {
  await enterMap(page);
  const bodies: unknown[] = [];
  let firstCommuteId: string | undefined;
  await context.route(`**${completePath}`, async route => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
      // Fault injection drops a real response after saving; no API fixture replaces the result.
      const saved = await route.fetch();
      expect(saved.status()).toBe(201);
      firstCommuteId = (await saved.json()).commuteId;
      await route.abort("failed");
    } else await route.continue();
  });
  await submit(page);
  await expect(page.getByRole("button", { name: "重试原通勤", exact: true })).toBeEnabled();
  const original = await pendingRequest(page);
  await context.setOffline(true);
  expect((await page.reload())?.fromServiceWorker()).toBe(true);
  await waitForWorker(page);
  await expect(page.getByText("已保留到达感受：比较轻松，重试不会修改原提交。", { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(await pendingRequest(page)).toEqual(original);
  await reconnectWithoutAutomaticWrite(page);
  const duplicateResponse = page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).pathname === completePath);
  await page.getByRole("button", { name: "重试原通勤", exact: true }).click();
  const duplicate = await duplicateResponse;
  expect(duplicate.status()).toBe(200);
  expect(await duplicate.json()).toMatchObject({ status: "duplicate", commuteId: firstCommuteId });
  await expect(page.getByText("这次通勤已记录，无需重复提交。", { exact: true })).toBeVisible();
  expect(bodies).toEqual([original, original]);
  expect(await apiCacheEntries(page)).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("commute-pending-v1"))).toBeNull();
});
