import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("admin split surfaces load with expected role-safe posture", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Executive Dashboard" })).toBeVisible();
  await expect(page.locator("body")).toContainText("summary-only");

  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { name: "Operations Workspace" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Action-first workspace");

  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Reports Overview" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Backend-prepared operational analytics");

  await page.goto("/admin/finance");
  await expect(page.getByRole("heading", { name: "Finance Control Center" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Workflow hub for accounts");
});

test("reports and finance launch cards point to real routes", async ({ page }) => {
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Reports Overview" })).toBeVisible();
  const reportLinks: Array<{ label: string; hrefPrefix: string }> = [
    { label: "Revenue Report", hrefPrefix: "/admin/reports/revenue" },
    { label: "Overdue EMI Report", hrefPrefix: "/admin/reports/overdue" },
    { label: "Batch Performance", hrefPrefix: "/admin/reports/batch-performance" },
    { label: "Collections Workspace", hrefPrefix: "/admin/collections" },
    { label: "Reconciliation Workspace", hrefPrefix: "/admin/reconciliation" },
    { label: "Finance Control", hrefPrefix: "/admin/finance" },
  ];

  for (const link of reportLinks) {
    const launch = page.getByRole("link", { name: link.label });
    await expect(launch).toBeVisible();
    await expect(launch).toHaveAttribute("href", new RegExp(`^${link.hrefPrefix}`));
  }

  await page.goto("/admin/finance");
  await expect(page.getByRole("heading", { name: "Finance Control Center" })).toBeVisible();
  const financeLaunchpadLinks: Array<{ label: string; hrefPrefix: string }> = [
    { label: "Chart of Accounts", hrefPrefix: "/admin/accounting/chart-of-accounts" },
    { label: "Finance Accounts", hrefPrefix: "/admin/settings/business-setup/finance-accounts" },
    { label: "Cash Book", hrefPrefix: "/admin/accounting/books/cash" },
    { label: "Bank Book", hrefPrefix: "/admin/accounting/books/bank" },
    { label: "UPI Book", hrefPrefix: "/admin/accounting/books/upi" },
    { label: "Purchase Bills", hrefPrefix: "/admin/accounting/purchase-bills" },
    { label: "Direct Sales", hrefPrefix: "/admin/billing/direct-sales" },
    { label: "Reconciliation Flags", hrefPrefix: "/admin/reconciliation" },
    { label: "Commission Register", hrefPrefix: "/admin/finance/commissions" },
    { label: "Payout Batches", hrefPrefix: "/admin/finance/payout-batches" },
  ];

  for (const link of financeLaunchpadLinks) {
    const launch = page.getByRole("link", { name: link.label }).first();
    await expect(launch).toBeVisible();
    await expect(launch).toHaveAttribute("href", new RegExp(`^${link.hrefPrefix}`));
  }
});
