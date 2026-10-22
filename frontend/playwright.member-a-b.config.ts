import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Start the reviewed B demo backend separately; this suite never substitutes API responses.
const apiUrl = process.env.MEMBER_A_B_API_URL;
if (!apiUrl) throw new Error("Set MEMBER_A_B_API_URL to the isolated B demo backend before running this suite.");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/member-a.b-contract.integration.e2e.ts",
  outputDir: "test-results/member-a-b-contracts",
  workers: 1,
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:5182",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5182 --strictPort",
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    env: { VITE_AMAP_JS_KEY: "", VITE_AMAP_SECURITY_CODE: "", VITE_API_BASE_URL: apiUrl },
    url: "http://127.0.0.1:5182",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
