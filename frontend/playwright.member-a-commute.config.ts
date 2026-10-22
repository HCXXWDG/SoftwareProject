import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const apiUrl = process.env.MEMBER_A_D07_API_URL;
if (!apiUrl) throw new Error("Set MEMBER_A_D07_API_URL to the isolated D07 backend before running this suite.");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/member-a.commute.integration.e2e.ts",
  outputDir: "../.tmp/member-a-commute-browser",
  workers: 1,
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:5403",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5403 --strictPort",
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    env: { VITE_AMAP_JS_KEY: "", VITE_AMAP_SECURITY_CODE: "", VITE_API_BASE_URL: apiUrl,
      VITE_COMMUTE_RECORDING_ENABLED: "true" },
    url: "http://127.0.0.1:5403",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
