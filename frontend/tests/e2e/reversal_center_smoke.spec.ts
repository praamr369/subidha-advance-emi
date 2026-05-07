import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("reversal center loads", async ({ page }) => {
  await page.goto("/admin/billing/reversals");
  await expect(page.getByRole("heading", { name: "Returns, Voids & Reversal Center" })).toBeVisible();
});

test("cancel and void actions require reason", async ({ page }) => {
  await page.goto("/admin/billing/reversals");
  await page.getByRole("button", { name: "Cancel Sale" }).click();
  await expect(page.locator("body")).toContainText("Cancel reason is required");

  await page.getByRole("button", { name: "Void Receipt" }).click();
  await expect(page.locator("body")).toContainText("Void reason is required");
});

test("return and refund forms render with required controls", async ({ page }) => {
  await page.goto("/admin/billing/reversals");
  await expect(page.getByText("Create Return")).toBeVisible();
  await expect(page.getByPlaceholder("Sale Line ID")).toBeVisible();

  await expect(page.getByText("Create Refund")).toBeVisible();
  await expect(page.getByRole("option", { name: "CASH_REFUND" })).toBeVisible();
  await expect(page.getByPlaceholder("Finance Account ID")).toBeVisible();

  await page.getByRole("button", { name: "Create Refund" }).click();
  await expect(page.locator("body")).toContainText("Refund method and finance account are required");
});
