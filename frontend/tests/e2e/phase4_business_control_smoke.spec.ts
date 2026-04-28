import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("phase-4 finance and accounting control surfaces share the business-control framework", async ({
  page,
}) => {
  await page.goto("/admin/finance/commissions");
  await expect(page.getByRole("heading", { name: "Commission Register" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Finance route map");

  await page.goto("/admin/finance/reconciliation");
  await expect(page.getByRole("heading", { name: "Admin Reconciliation" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("collection-side reconciliation workspace");

  await page.goto("/admin/finance/payout-batches");
  await expect(page.getByRole("heading", { name: "Payout Batch Register" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Finance route map");

  await page.goto("/admin/accounting/chart-of-accounts");
  await expect(page.getByRole("heading", { name: "Chart of Accounts" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting control map");

  await page.goto("/admin/accounting/journals");
  await expect(page.getByRole("heading", { name: "Journals" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting control map");

  await page.goto("/admin/accounting/vendors");
  await expect(page.getByRole("heading", { name: "Vendor Register" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting control map");

  await page.goto("/admin/accounting/vendor-settlements");
  await expect(page.getByRole("heading", { name: "Vendor Settlements" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting control map");

  await page.goto("/admin/accounting/purchase-bills");
  await expect(page.getByRole("heading", { name: "Purchase Bills" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting control map");

  await page.goto("/admin/accounting/books/cash");
  await expect(page.getByRole("heading", { name: "Cash Book" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting book map");

  await page.goto("/admin/accounting/books/bank");
  await expect(page.getByRole("heading", { name: "Bank Book" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting book map");

  await page.goto("/admin/accounting/books/upi");
  await expect(page.getByRole("heading", { name: "UPI Book" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting book map");

  await page.goto("/admin/accounting/books/sales");
  await expect(page.getByRole("heading", { name: "Sales Book" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting book map");

  await page.goto("/admin/accounting/books/purchase");
  await expect(page.getByRole("heading", { name: "Purchase Book" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting book map");

  await page.goto("/admin/accounting/reports/trial-balance");
  await expect(page.getByRole("heading", { name: "Trial Balance" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting statement map");

  await page.goto("/admin/accounting/reports/profit-loss");
  await expect(page.getByRole("heading", { name: "Profit & Loss" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting statement map");

  await page.goto("/admin/accounting/reports/balance-sheet");
  await expect(page.getByRole("heading", { name: "Balance Sheet" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Accounting statement map");
});

test("phase-4 billing, inventory, and reconciliation surfaces share the business-control framework", async ({
  page,
}) => {
  await page.goto("/admin/billing/direct-sales");
  await expect(page.getByRole("heading", { name: "Direct Sales Register" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Billing route map");

  await page.goto("/admin/billing/register");
  await expect(page.getByRole("heading", { name: "Billing Document Register" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Billing route map");

  await page.goto("/admin/billing/invoices");
  await expect(page.getByRole("heading", { name: "Billing Invoices" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Billing route map");

  await page.goto("/admin/billing/receipts");
  await expect(page.getByRole("heading", { name: "Receipt Register" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Billing route map");

  await page.goto("/admin/billing/contracts");
  await expect(page.getByRole("heading", { name: "Billing Contracts" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Billing route map");

  await page.goto("/admin/billing/credit-notes");
  await expect(page.getByRole("heading", { name: "Billing Credit Notes" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Billing route map");

  await page.goto("/admin/billing/debit-notes");
  await expect(page.getByRole("heading", { name: "Billing Debit Notes" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Billing route map");

  await page.goto("/admin/billing/documents/1");
  await expect(page.getByRole("heading", { name: /Billing Document|INV|Document/i }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Billing route map");

  await page.goto("/admin/billing/cashbook");
  await expect(page.getByRole("heading", { name: "Billing Cash Book" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Billing route map");

  await page.goto("/admin/billing/dailybook");
  await expect(page.getByRole("heading", { name: "Billing Daily Book" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Billing route map");

  await page.goto("/admin/inventory/items");
  await expect(page.getByRole("heading", { name: "Inventory Items" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Inventory route map");

  await page.goto("/admin/inventory/locations");
  await expect(page.getByRole("heading", { name: "Stock Locations" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Inventory route map");

  await page.goto("/admin/inventory/stock-on-hand");
  await expect(page.getByRole("heading", { name: "Stock On Hand" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Inventory route map");

  await page.goto("/admin/inventory/movements");
  await expect(page.getByRole("heading", { name: "Inventory Movements" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Inventory route map");

  await page.goto("/admin/inventory/adjustments");
  await expect(page.getByRole("heading", { name: "Stock Adjustments" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Inventory route map");

  await page.goto("/admin/inventory/ledger");
  await expect(page.getByRole("heading", { name: "Stock Ledger" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Inventory route map");

  await page.goto("/admin/inventory/valuation");
  await expect(page.getByRole("heading", { name: "Inventory Valuation" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Inventory route map");

  await page.goto("/admin/inventory/opening-stock");
  await expect(page.getByRole("heading", { name: "Opening Stock Import" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Inventory route map");

  await page.goto("/admin/reconciliation");
  await expect(page.getByRole("heading", { name: "Admin Reconciliation" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Reconciliation route map");
});
