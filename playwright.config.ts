import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./src/modules/auth/tests",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "node src/modules/auth/tests/start-server.mjs",
    url: "http://127.0.0.1:3100/api/v1/auth/csrf",
    reuseExistingServer: false,
    timeout: 180000,
  },
  reporter: "list",
});
