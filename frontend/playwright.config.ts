import { existsSync } from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const frontendBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const backendRootUrl =
  process.env.PLAYWRIGHT_BACKEND_ROOT || "http://127.0.0.1:8100";
const apiBaseUrl =
  process.env.PLAYWRIGHT_API_URL || `${backendRootUrl}/api/v1`;
const smokeMetaPath =
  process.env.PLAYWRIGHT_SMOKE_META_PATH ||
  path.resolve(__dirname, "../backend/playwright-smoke-meta.json");
const smokeDbPath =
  process.env.PLAYWRIGHT_DB_PATH || "/tmp/subidha-playwright-smoke.sqlite3";
const smokeManifestPath = path.resolve(
  __dirname,
  "tests/e2e/.generated/smoke-manifest.json"
);
const resolvePythonExecutable = () => {
  const envConfigured =
    process.env.PLAYWRIGHT_PYTHON || process.env.PYTHON_BIN || "";

  if (envConfigured.trim()) {
    return envConfigured;
  }

  const candidates = [
    path.resolve(__dirname, "../.venv/bin/python"),
    path.resolve(__dirname, "../backend/.venv/bin/python"),
    path.resolve(__dirname, "../../.venv/bin/python"),
    "/home/subidha-furniture/subidha-lucky-plan/.venv/bin/python",
  ];

  const localMatch = candidates.find((candidate) => existsSync(candidate));
  return localMatch || "python3";
};

const pythonExecutable = resolvePythonExecutable();

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
      testIgnore: [/.*\.setup\.ts/, /.*real-login-smoke\.spec\.ts/],
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "chromium-release-smoke",
      dependencies: ["setup"],
      testMatch: /.*release-smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "chromium-auth-smoke",
      testMatch: /.*real-login-smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: [
    {
      command: `bash -lc "rm -f '${smokeDbPath}' '${smokeMetaPath}' '${smokeManifestPath}' && ${pythonExecutable} ../backend/manage.py migrate --noinput --settings core.settings.playwright && ${pythonExecutable} ../backend/manage.py seed_playwright_smoke --settings core.settings.playwright && ${pythonExecutable} ../backend/manage.py runserver 127.0.0.1:8100 --settings core.settings.playwright --noreload"`,
      url: `${backendRootUrl}/healthz/`,
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: ".",
      env: {
        ...process.env,
        CORS_ALLOWED_ORIGINS: frontendBaseUrl,
        CSRF_TRUSTED_ORIGINS: frontendBaseUrl,
        DJANGO_SETTINGS_MODULE: "core.settings.playwright",
        PLAYWRIGHT_DB_PATH: smokeDbPath,
        PLAYWRIGHT_SMOKE_META_PATH: smokeMetaPath,
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      command: "npm run start:smoke",
      url: `${frontendBaseUrl}/login`,
      reuseExistingServer: false,
      timeout: 240_000,
      cwd: ".",
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
        PLAYWRIGHT_SMOKE_META_PATH: smokeMetaPath,
      },
    },
  ],
});
