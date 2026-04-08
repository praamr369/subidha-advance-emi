import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("phase-3 admin operations hubs load with visible navigation actions", async ({ page }) => {
  await page.goto("/admin/inventory");
  await expect(
    page.getByRole("heading", { name: "Inventory Operations" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Items" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ledger" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Adjustments" })).toBeVisible();

  await page.goto("/admin/billing");
  await expect(
    page.getByRole("heading", { name: "Billing Operations" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Invoices" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Credit Notes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Debit Notes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Receipts" })).toBeVisible();

  await page.goto("/admin/reminders");
  await expect(page.getByRole("heading", { name: "Reminder Queue" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Audit Enabled");
});

test("phase-3 books and bridge controls load with active buttons", async ({ page }) => {
  await page.goto("/admin/accounting/books/cash");
  await expect(page.getByRole("heading", { name: "Cash Book", level: 1 })).toBeVisible();

  await page.goto("/admin/accounting/books/sales");
  await expect(page.getByRole("heading", { name: "Sales Book", level: 1 })).toBeVisible();

  await page.goto("/admin/accounting/bridges");
  await expect(page.getByRole("heading", { name: "Bridge Runs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Bridge" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Bridge" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Run retail sale" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run inventory posting" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run EMI subscription" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run EMI payment receipts" })).toBeVisible();
});
