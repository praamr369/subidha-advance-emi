import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.describe("admin dashboard smoke", () => {
  test.use({ storageState: authStatePath("admin") });

  test("admin dashboard renders canonical finance panels", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Admin Dashboard" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Due collection queue");
    await expect(page.locator("body")).toContainText("Reconciliation attention");
  });
});

test.describe("partner dashboard smoke", () => {
  test.use({ storageState: authStatePath("partner") });

  test("partner dashboard renders canonical finance panels", async ({ page }) => {
    await page.goto("/partner");
    await expect(
      page.getByRole("heading", { name: "Partner Dashboard" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Settlement posture");
    await expect(page.locator("body")).toContainText("Due collection queue");
  });
});

test.describe("cashier dashboard smoke", () => {
  test.use({ storageState: authStatePath("cashier") });

  test("cashier dashboard renders canonical finance panels", async ({ page }) => {
    await page.goto("/cashier");
    await expect(
      page.getByRole("heading", { name: "Cashier Dashboard" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Settlement posture");
    await expect(page.locator("body")).toContainText("Due collection queue");
  });
});

test.describe("customer dashboard smoke", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer dashboard remains the canonical baseline", async ({ page }) => {
    await page.goto("/customer");
    await expect(
      page.getByRole("heading", { name: "Customer Workspace" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Financial alignment");
    await expect(page.locator("body")).toContainText("Waived by benefit");
  });
});
