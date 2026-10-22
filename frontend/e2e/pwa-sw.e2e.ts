import { test, expect, type Page } from "@playwright/test";

/** Exercise the built application's active Service Worker rather than the Vite dev server. */
async function mockAPI(page: Page) {
  const network = { heatScore: 68.2, requests: [] as string[] };
  // Context routing also sees network requests issued by the active Service Worker.
  await page.context().route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    network.requests.push(route.request().url());
    if (path === "/api/v1/heatmap") return route.fulfill({ json: [{
      cellId: "16:133638:34976", center: { longitude: 120.274, latitude: 31.479 },
      score: network.heatScore, confidence: 0.72, count: 18, dominantTag: "NOISE",
    }] });
    if (path === "/api/v1/routes/compare") return route.fulfill({ json: {
      routes: [{
        id: "route-fast", label: "路线 A", distanceMeters: 850, durationSeconds: 600,
        stressExposure: 67.2, stressScore: 50.4, confidence: 0.68,
        fastest: true, leastStressful: false,
        polyline: [
          { longitude: 120.273510, latitude: 31.475328 },
          { longitude: 120.274319, latitude: 31.483275 },
        ],
      }],
      fastestRouteId: "route-fast", leastStressfulRouteId: "route-fast",
      recommendation: "当前只有一条路线", recommendAlternative: false,
      routeSource: "REAL", feedbackSource: "REAL", scoringStatus: "VALID",
      snapshotId: "00000000-0000-4000-8000-000000000001", scoringVersion: "walking-distance-v2",
      travelMode: "WALKING", recommendationReason: "NO_ALTERNATIVE",
    } });
    if (path === "/api/v1/routes/history") return route.fulfill({ json: [] });
    if (path === "/api/v1/commutes/trends") return route.fulfill({ json: {
      points: [{ date: "2026-06-10", averageStress: 55, commuteCount: 3 }],
      recommendation: "继续保持", totalCommutes: 3,
    } });
    if (path === "/api/v1/reports") return route.fulfill({ status: 201,
      json: { status: "created", code: "report_created", counted: true, message: "反馈已保存" } });
    return route.fulfill({ status: 404, json: { code: "unexpected_request", message: "本场景未配置此请求" } });
  });
  return network;
}

async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

async function navigateToMap(page: Page) {
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  await expect(page.getByRole("heading", { name: "路线预览", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  await expect(page.locator("[data-map-mode]").first()).toHaveAttribute("data-map-mode", /amap|offline/);
  await expect(page.locator(".map-page__loading")).toHaveCount(0);
}

async function cacheUrls(page: Page) {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map(request => request.url));
    }
    return urls;
  });
}

test.describe("PWA Service Worker NetworkOnly", () => {
  test("registers and activates a Service Worker that controls the application", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await waitForServiceWorker(page);
    const registration = await page.evaluate(async () => {
      const value = await navigator.serviceWorker.getRegistration();
      return { state: value?.active?.state, scriptURL: value?.active?.scriptURL };
    });
    expect(registration.state).toBe("activated");
    expect(new URL(registration.scriptURL!).pathname).toBe("/sw.js");
  });

  test("the active Service Worker fetches fresh API data for the same URL and never caches it", async ({ page }) => {
    const network = await mockAPI(page);
    await page.goto("/");
    await waitForServiceWorker(page);
    await navigateToMap(page);
    const url = "/api/v1/heatmap?bbox=120.26,31.47,120.28,31.50&zoom=16&hours=168&probe=network-only";
    const first = await page.evaluate(async target => (await fetch(target)).json(), url);
    expect(first[0].score).toBe(68.2);
    network.heatScore = 15.25;
    const second = await page.evaluate(async target => (await fetch(target)).json(), url);
    expect(second[0].score).toBe(15.25);
    expect(network.requests.filter(request => request.includes("probe=network-only"))).toHaveLength(2);
    expect((await cacheUrls(page)).some(cached => new URL(cached).pathname.startsWith("/api/"))).toBe(false);
  });

  test("serves a manifest with standalone application identity", async ({ page }) => {
    await page.goto("/");
    const manifestLink = page.locator('link[rel="manifest"]');
    const href = await manifestLink.getAttribute("href");
    expect(href).not.toBeNull();
    expect(new URL(href!, page.url()).pathname).toBe("/manifest.webmanifest");
    const response = await page.request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).toContain("校园通勤情绪地图");
  });

  test("includes 192/512 pixel and maskable icons backed by accessible assets", async ({ page }) => {
    const response = await page.request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    const icons = manifest.icons as { sizes: string; purpose?: string; src: string }[];
    expect(icons.map(icon => icon.sizes)).toContain("192x192");
    expect(icons.map(icon => icon.sizes)).toContain("512x512");
    expect(icons.some(icon => icon.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      expect((await page.request.get(new URL(icon.src, response.url()).href)).status()).toBe(200);
    }
  });

  test("precaches the application shell and can reload it offline without cached API responses", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");
    await waitForServiceWorker(page);
    const keys = await cacheUrls(page);
    expect(keys.some(url => url.includes("index.html") || url.endsWith(".css") || url.endsWith(".js"))).toBe(true);
    expect(keys.some(url => new URL(url).pathname.startsWith("/api/"))).toBe(false);
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "校园通勤情绪地图", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "查看路线", exact: true })).toBeEnabled();
    await page.context().setOffline(false);
  });
});
