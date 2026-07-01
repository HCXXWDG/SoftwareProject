import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const configDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/pwa-sw.e2e.ts",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: "http://localhost:4173",
    channel: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --host 127.0.0.1",
    cwd: configDir,
    env: {
      VITE_AMAP_JS_KEY: "",
      VITE_AMAP_SECURITY_CODE: "",
    },
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});