import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const configDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
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
