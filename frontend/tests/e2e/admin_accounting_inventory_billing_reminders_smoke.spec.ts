import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("phase-3 admin accounting, inventory, billing, and reminders pages load", async ({ page }) => {
  await page.goto("/admin/accounting/periods");
  await expect(page.getByRole("heading", { name: "Accounting Periods" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Period" })).toBeVisible();

  await page.goto("/admin/inventory/movements");
  await expect(page.getByRole("heading", { name: "Inventory Movements" })).toBeVisible();

  await page.goto("/admin/billing/receipts");
  await expect(page.getByRole("heading", { name: "Receipt Register" })).toBeVisible();

  await page.goto("/admin/reminders/payment-reminders");
  await expect(page.getByRole("heading", { name: "Reminder Queue" })).toBeVisible();
});
