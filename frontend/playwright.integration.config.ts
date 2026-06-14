import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const configDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.integration.e2e.ts",
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
    baseURL: "http://localhost:5173",
    channel: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    cwd: configDir,
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
