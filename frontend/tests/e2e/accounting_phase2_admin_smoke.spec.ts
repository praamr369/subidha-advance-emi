import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

function shellHeading(page: Page, name: string) {
  return page.getByRole("heading", { name }).first();
}

test("admin accounting phase-2 routes load", async ({ page }) => {
  await page.goto("/admin/accounting/reports/trial-balance");
  await expect(shellHeading(page, "Trial Balance")).toBeVisible();

  await page.goto("/admin/accounting/reports/profit-loss");
  await expect(shellHeading(page, "Profit & Loss")).toBeVisible();

  await page.goto("/admin/accounting/reports/balance-sheet");
  await expect(shellHeading(page, "Balance Sheet")).toBeVisible();

  await page.goto("/admin/accounting/gst/tax-invoices");
  await expect(shellHeading(page, "Tax Invoices")).toBeVisible();

  await page.goto("/admin/accounting/gst/credit-notes");
  await expect(shellHeading(page, "Credit Notes")).toBeVisible();

  await page.goto("/admin/accounting/gst/debit-notes");
  await expect(shellHeading(page, "Debit Notes")).toBeVisible();

  await page.goto("/admin/accounting/exports/itr-pack");
  await expect(shellHeading(page, "ITR Export Pack")).toBeVisible();

  await page.goto("/admin/accounting/bridges");
  await expect(shellHeading(page, "Accounting Bridge Readiness")).toBeVisible();
});
