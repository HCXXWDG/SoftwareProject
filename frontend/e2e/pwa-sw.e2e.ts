import { test, expect, type Page } from "@playwright/test";

/**
 * PWA Service Worker NetworkOnly 验证
 *
 * 确认 /api/**、高德脚本和地图瓦片不被 Service Worker 缓存，
 * 避免缓存旧 API 数据和地图资源。
 */

async function mockAPI(page: Page) {
  await page.route("**/api/v1/heatmap*", (route) =>
    route.fulfill({
      json: [
        {
          cellId: "16:133638:34976",
          center: { longitude: 120.274, latitude: 31.479 },
          score: 68.2,
          confidence: 0.72,
          count: 18,
          dominantTag: "NOISE",
        },
      ],
    }),
  );
  await page.route("**/api/v1/routes/compare", (route) =>
    route.fulfill({
      json: {
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
              { longitude: 120.2743, latitude: 31.4833 },
            ],
          },
        ],
        fastestRouteId: "route-fast",
        leastStressfulRouteId: "route-fast",
        recommendation: "test",
        recommendAlternative: false,
      },
    }),
  );
  await page.route("**/api/v1/commutes/trends*", (route) =>
    route.fulfill({
      json: {
        points: [{ date: "2026-06-10", averageStress: 55, commuteCount: 3 }],
        recommendation: "继续保持",
        totalCommutes: 3,
      },
    }),
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

test.describe("PWA Service Worker NetworkOnly", () => {
  test("Service Worker is registered", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");

    const swRegistration = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return null;
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? reg.active?.scriptURL ?? "installing" : null;
    });

    expect(swRegistration).not.toBeNull();
  });

  test("API responses are not served from cache (NetworkOnly)", async ({
    page,
  }) => {
    await mockAPI(page);
    await page.goto("/");

    const apiCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/v1/heatmap")) {
        apiCalls.push("heatmap");
      }
    });

    await navigateToMap(page);
    await expect.poll(() => apiCalls.length).toBeGreaterThan(0);
  });

  test("manifest is accessible and standalone", async ({ page }) => {
    await page.goto("/");

    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute("href", "manifest.webmanifest");

    const response = await page.goto("/manifest.webmanifest");
    expect(response?.status()).toBe(200);
    const manifest = await response?.json();
    expect(manifest?.display).toBe("standalone");
    expect(manifest?.name).toContain("校园通勤情绪地图");
  });

  test("manifest includes required icons", async ({ page }) => {
    const response = await page.goto("/manifest.webmanifest");
    const manifest = await response?.json();

    const iconSizes = manifest?.icons?.map((i: { sizes: string }) => i.sizes) ?? [];
    expect(iconSizes).toContain("192x192");
    expect(iconSizes).toContain("512x512");

    const hasMaskable = manifest?.icons?.some(
      (i: { purpose?: string }) => i.purpose === "maskable",
    );
    expect(hasMaskable).toBe(true);
  });

  test("app shell is precached for offline use", async ({ page }) => {
    await mockAPI(page);
    await page.goto("/");

    await page.waitForLoadState("networkidle");

    const cachedKeys = await page.evaluate(async () => {
      if (!("caches" in window)) return [];
      const cacheNames = await caches.keys();
      const allKeys: string[] = [];
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        allKeys.push(...keys.map((k) => k.url));
      }
      return allKeys;
    });

    const hasAppShell = cachedKeys.some(
      (url) => url.includes("index.html") || url.endsWith(".css") || url.endsWith(".js"),
    );
    expect(hasAppShell).toBe(true);

    const hasApiCached = cachedKeys.some((url) => url.includes("/api/"));
    expect(hasApiCached).toBe(false);
  });
});