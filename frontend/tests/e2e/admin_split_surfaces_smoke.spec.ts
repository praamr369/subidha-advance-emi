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
  await expect(page.locator("body")).toContainText("Admin finance operations view");
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
    const launch = page.getByRole("link", { name: link.label }).first();
    await expect(launch).toBeVisible();
    await expect(launch).toHaveAttribute("href", new RegExp(`^${link.hrefPrefix}`));
  }

  await page.goto("/admin/finance");
  await expect(page.getByRole("heading", { name: "Finance Control Center" })).toBeVisible();
  const financeLaunchpadLinks: Array<{ label: string; hrefPrefix: string }> = [
    { label: "Collections Workspace", hrefPrefix: "/admin/collections" },
    { label: "Payment Register", hrefPrefix: "/admin/payments" },
    { label: "Purchase Bills", hrefPrefix: "/admin/accounting/purchase-bills" },
    { label: "Vendor Ledger View", hrefPrefix: "/admin/accounting/vendors" },
    { label: "Flagged Queue", hrefPrefix: "/admin/reconciliation" },
    { label: "Payout Batches", hrefPrefix: "/admin/finance/payout-batches" },
    { label: "Open Direct Sale", hrefPrefix: "/admin/billing/direct-sales" },
    { label: "Open Subscriptions", hrefPrefix: "/admin/subscriptions" },
    { label: "Cash Book", hrefPrefix: "/admin/accounting/books/cash" },
    { label: "Bank Book", hrefPrefix: "/admin/accounting/books/bank" },
    { label: "UPI Book", hrefPrefix: "/admin/accounting/books/upi" },
    { label: "Chart of Accounts", hrefPrefix: "/admin/accounting/chart-of-accounts" },
  ];

  for (const link of financeLaunchpadLinks) {
    const launch = page.getByRole("link", { name: link.label, exact: true }).first();
    await expect(launch).toBeVisible();
    await expect(launch).toHaveAttribute("href", new RegExp(`^${link.hrefPrefix}`));
  }
});
