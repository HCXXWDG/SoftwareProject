import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL(".", import.meta.url));
const backend = process.env.MEMBER_A_BACKEND_DIR ?? fileURLToPath(new URL("../backend", import.meta.url));
// Use isolated local demo services. Package the backend JAR before running this suite.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/member-a.integration.e2e.ts",
  outputDir: "test-results/member-a-integration",
  workers: 1,
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:5181",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [{
    command: 'java -jar target/commute-mood-api-1.0.0.jar --spring.profiles.active=demo --server.port=18081 --app.amap.web-key= --app.cors-origins=http://127.0.0.1:5181',
    cwd: backend,
    url: "http://127.0.0.1:18081/actuator/health",
    reuseExistingServer: false,
    timeout: 60_000,
  }, {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5181 --strictPort",
    cwd: frontend,
    env: { VITE_AMAP_JS_KEY: "", VITE_AMAP_SECURITY_CODE: "", VITE_API_BASE_URL: "http://127.0.0.1:18081" },
    url: "http://127.0.0.1:5181",
    reuseExistingServer: false,
    timeout: 30_000,
  }],
});
