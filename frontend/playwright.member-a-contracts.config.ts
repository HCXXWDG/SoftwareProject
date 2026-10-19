import { defineConfig } from "@playwright/test";
import base from "./playwright.member-a.config";

if (!process.env.MEMBER_A_BACKEND_DIR) {
  throw new Error("Set MEMBER_A_BACKEND_DIR to the built D01–D05 backend directory before running contract integration.");
}
export default defineConfig({
  ...base,
  testMatch: ["**/member-a.integration.e2e.ts", "**/member-a.d-contracts.integration.e2e.ts"],
  outputDir: "../.tmp/playwright-member-a-contracts",
});
