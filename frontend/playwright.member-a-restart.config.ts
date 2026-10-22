import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

if (!process.env.MEMBER_A_D07_BACKEND_DIR) {
  throw new Error("Set MEMBER_A_D07_BACKEND_DIR to the packaged D07 backend directory before running restart acceptance.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/member-a.restart.integration.e2e.ts",
  outputDir: "./test-results/member-a-restart",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:5405",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
    headless: true,
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5405 --strictPort",
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    env: { VITE_AMAP_JS_KEY: "", VITE_AMAP_SECURITY_CODE: "", VITE_API_BASE_URL: "http://127.0.0.1:18085",
      VITE_COMMUTE_RECORDING_ENABLED: "true" },
    url: "http://127.0.0.1:5405",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
