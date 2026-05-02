import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({
  reducedMotion: "reduce",
});

test.describe("Reduced motion smoke", () => {
  test.describe("admin direct sale", () => {
    test.use({ storageState: authStatePath("admin") });

    test("direct sale workspace renders primary heading", async ({ page }) => {
      await page.goto("/admin/billing/direct-sale");
      await expect(page.getByRole("heading", { name: /Direct Sale Workspace/i })).toBeVisible({
        timeout: 45_000,
      });
    });

    test("notification bell opens dialog without blocking layout", async ({ page }) => {
      await page.goto("/admin");
      await page.getByTestId("header-notification-bell").click();
      await expect(page.getByRole("dialog", { name: "Notifications menu" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Open center" })).toBeVisible();
    });
  });

  test.describe("customer home", () => {
    test.use({ storageState: authStatePath("customer") });

    test("customer workspace heading visible", async ({ page }) => {
      await page.goto("/customer");
      await expect(page.getByRole("heading", { name: "Customer Workspace" })).toBeVisible({
        timeout: 45_000,
      });
    });
  });

  test.describe("cashier collect", () => {
    test.use({ storageState: authStatePath("cashier") });

    test("collect workspace loads operational heading", async ({ page }) => {
      await page.goto("/cashier/collect");
      await expect(page.getByRole("heading", { name: "Collect Payment" })).toBeVisible({
        timeout: 45_000,
      });
    });
  });
});
