import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

function shellHeading(page: Page, name: string) {
  return page.getByRole("banner").getByRole("heading", { name });
}

test("admin accounting routes load", async ({ page }) => {
  await page.goto("/admin/accounting");
  await expect(
    page.getByRole("heading", { name: "Accounting Control Center" })
  ).toBeVisible();

  await page.goto("/admin/accounting/chart-of-accounts");
  await expect(shellHeading(page, "Chart Of Accounts")).toBeVisible();

  await page.goto("/admin/accounting/expenses");
  await expect(shellHeading(page, "Expenses")).toBeVisible();

  await page.goto("/admin/accounting/salary");
  await expect(shellHeading(page, "Salary")).toBeVisible();

  await page.goto("/admin/accounting/books");
  await expect(shellHeading(page, "Books")).toBeVisible();

  await page.goto("/admin/accounting/journals");
  await expect(shellHeading(page, "Journals")).toBeVisible();
});
