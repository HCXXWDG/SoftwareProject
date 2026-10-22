import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const apiUrl = process.env.MEMBER_A_D07_API_URL;
if (!apiUrl) throw new Error("Set MEMBER_A_D07_API_URL to the isolated D07 backend before running this suite.");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/member-a.commute-pwa.integration.e2e.ts",
  outputDir: "../.tmp/member-a-commute-pwa-browser",
  workers: 1,
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:5404",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
    headless: true,
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 5404 --strictPort",
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    env: { VITE_AMAP_JS_KEY: "", VITE_AMAP_SECURITY_CODE: "", VITE_API_BASE_URL: apiUrl,
      VITE_COMMUTE_RECORDING_ENABLED: "true" },
    url: "http://127.0.0.1:5404",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
