import { defineConfig, devices } from "@playwright/test";

const frontendBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const apiBaseUrl =
  process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:8100/api/v1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 1 : 0,
  outputDir: "test-results",
  reporter: process.env.CI ? [["html"], ["list"]] : [["list"]],
  use: {
    baseURL: frontendBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "chromium-smoke",
      dependencies: ["setup"],
      testIgnore: /.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: [
    {
      command:
        "../venv/bin/python ../backend/manage.py runserver 127.0.0.1:8100 --noreload",
      url: `${apiBaseUrl}/public/health/`,
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: ".",
      env: {
        ...process.env,
        CORS_ALLOWED_ORIGINS: frontendBaseUrl,
        DJANGO_SETTINGS_MODULE: "core.settings.playwright",
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      command:
        "npm run build && npm run start -- --hostname 127.0.0.1 --port 3100",
      url: `${frontendBaseUrl}/login`,
      reuseExistingServer: false,
      timeout: 240_000,
      cwd: ".",
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
      },
    },
  ],
});
