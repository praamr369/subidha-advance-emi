import { expect, test } from "@playwright/test";
import { authStatePath } from "./helpers/smoke-data";

// Visual Parity & UI/UX Regression Suite
// Captures pixel-level snapshots and verifies that responsive layouts,
// typography, colors, and workbench alignments match the approved baseline.

const CORE_ADMIN_PAGES = [
  { name: "admin-dashboard", path: "/admin" },
  { name: "admin-subscriptions", path: "/admin/subscriptions" },
  { name: "admin-collections", path: "/admin/collections" },
  { name: "admin-finance", path: "/admin/finance" },
  { name: "admin-products", path: "/admin/products" },
  { name: "admin-customers", path: "/admin/customers" },
];

test.describe("Visual Regression: Public Entry Surfaces", () => {
  test("public login page visual layout", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(600); // Allow hydration & animation settle

    await expect(page).toHaveScreenshot("public-login-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });
  });
});

test.describe("Visual Regression: Admin Workbenches", () => {
  test.use({ storageState: authStatePath("admin") });

  for (const pageEntry of CORE_ADMIN_PAGES) {
    test(`admin workbench parity: ${pageEntry.name}`, async ({ page }) => {
      const response = await page.goto(pageEntry.path, {
        waitUntil: "domcontentloaded",
      });

      if (response) {
        expect(response.status()).toBeLessThan(500);
      }

      await expect(page.locator("body")).toBeVisible();
      // Allow initial data fetching & layout hydration to settle
      await page.waitForTimeout(1000);

      await expect(page).toHaveScreenshot(`${pageEntry.name}-desktop.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
        animations: "disabled",
      });
    });
  }
});

