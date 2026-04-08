import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("admin accounting routes load", async ({ page }) => {
  await page.goto("/admin/accounting");
  await expect(
    page.getByRole("heading", { name: "Accounting Control Center" })
  ).toBeVisible();

  await page.goto("/admin/accounting/chart-of-accounts");
  await expect(
    page.getByRole("heading", { name: "Chart of Accounts" })
  ).toBeVisible();

  await page.goto("/admin/accounting/expenses");
  await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();

  await page.goto("/admin/accounting/salary");
  await expect(page.getByRole("heading", { name: "Salary" })).toBeVisible();

  await page.goto("/admin/accounting/books");
  await expect(page.getByRole("heading", { name: "Books" })).toBeVisible();

  await page.goto("/admin/accounting/journals");
  await expect(page.getByRole("heading", { name: "Journals" })).toBeVisible();
});
