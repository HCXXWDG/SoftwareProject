import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const configDir = fileURLToPath(new URL(".", import.meta.url));
const apiUrl = process.env.INTEGRATION_API_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  testDir: "./e2e",
  // Shared D07 flow only. Legacy contract and production PWA suites own their servers/configs.
  testMatch: ["**/app.integration.e2e.ts", "**/member-a.commute.integration.e2e.ts"],
  outputDir: "test-results/integration",
  timeout: 45_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ["list"],
        [
          "html",
          { open: "never", outputFolder: "playwright-report/integration" },
        ],
      ]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    cwd: configDir,
    env: {
      VITE_AMAP_JS_KEY: "",
      VITE_AMAP_SECURITY_CODE: "",
      VITE_API_BASE_URL: apiUrl,
      VITE_COMMUTE_RECORDING_ENABLED: "true",
    },
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
