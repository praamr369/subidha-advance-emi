import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.describe("UX polish smoke", () => {
  test.describe("admin surfaces", () => {
    test.use({ storageState: authStatePath("admin") });

    test("direct sale workspace settles loading skeletons without persistent busy regions", async ({ page }) => {
      await page.goto("/admin/billing/direct-sale");
      await expect(page.getByRole("heading", { name: /Direct Sale Workspace/i })).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 45_000 });
    });

    test("notification bell opens an accessible dropdown shell", async ({ page }) => {
      await page.goto("/admin");
      await page.getByTestId("header-notification-bell").click();
      await expect(page.getByRole("dialog", { name: "Notifications menu" })).toBeVisible();
    });

    test("mobile sidebar opens and closes from header controls", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/admin");
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("navigation", { name: /sidebar navigation/i })).toBeVisible();
      await page.getByRole("button", { name: "Close sidebar" }).click();
      await expect(page.getByRole("navigation", { name: /sidebar navigation/i })).toHaveCount(0);
    });

    test("collapsed navigation opens focus-accessible quick-action flyout", async ({ page }) => {
      await page.goto("/admin");
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      const commandCenterButton = page.getByRole("button", { name: "Command Center" });
      await commandCenterButton.focus();
      await expect(page.getByRole("dialog", { name: "Command Center quick actions" })).toBeVisible();
    });

    test("opening stock workspace renders without persistent busy overlay", async ({ page }) => {
      await page.goto("/admin/inventory/opening-stock");
      await expect(
        page.locator("#main-content").getByRole("heading", { name: /^Opening Stock$/i })
      ).toBeVisible({ timeout: 45_000 });
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 45_000 });
    });
  });

  test.describe("customer dashboard", () => {
    test.use({ storageState: authStatePath("customer") });

    test("customer home renders workspace heading after navigation", async ({ page }) => {
      await page.goto("/customer");
      await expect(page.getByRole("heading", { name: "Customer Workspace" })).toBeVisible({
        timeout: 45_000,
      });
    });
  });

  test.describe("vendor dashboard", () => {
    test.use({ storageState: authStatePath("vendor") });

    test("vendor workspace keeps role-safe actions only", async ({ page }) => {
      await page.goto("/vendor");
      await expect(page.getByRole("heading", { name: "Vendor Workspace" })).toBeVisible({
        timeout: 45_000,
      });
      await expect(page.locator("body")).not.toContainText("Reversal Center");
      await expect(page.locator("body")).not.toContainText("Accounting Settings");
    });
  });
});
