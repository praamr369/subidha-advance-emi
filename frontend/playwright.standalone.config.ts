import baseConfig from "./playwright.config";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  ...baseConfig,
  webServer: undefined,
  projects: [
    {
      name: "chromium-standalone",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
