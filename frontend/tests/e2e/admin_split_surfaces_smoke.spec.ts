import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("admin split surfaces load with expected role-safe posture", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Daily Operator Dashboard" })).toBeVisible();
  await expect(page.locator("body")).toContainText("primary daily dashboard");

  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { name: "Operations Working Screen" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Action-first queues");

  await page.goto("/admin/bi");
  await expect(page.getByRole("heading", { name: "Business Intelligence" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Read-only trends");

  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: /Reports & analysis/i }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("windowed analytics summary");

  await page.goto("/admin/finance");
  await expect(page.getByRole("heading", { name: "Finance Operations" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Finance source workflow");
});

test("reports and finance launch cards point to real routes", async ({ page }) => {
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: /Reports & analysis/i }).first()).toBeVisible();
  const reportLinks: Array<{ label: string; hrefPrefix: string }> = [
    { label: "Revenue Report", hrefPrefix: "/admin/reports/revenue" },
    { label: "Overdue EMI Report", hrefPrefix: "/admin/reports/overdue" },
    { label: "Batch Performance", hrefPrefix: "/admin/reports/batch-performance" },
    { label: "Collections Workspace", hrefPrefix: "/admin/collections" },
    { label: "Reconciliation Workspace", hrefPrefix: "/admin/accounting/bridge-reconciliation" },
    { label: "Finance Control", hrefPrefix: "/admin/finance" },
  ];

  const mainContent = page.locator("#main-content");
  for (const link of reportLinks) {
    const launch = mainContent.getByRole("link", { name: link.label }).first();
    await expect(launch).toBeVisible();
    await expect(launch).toHaveAttribute("href", new RegExp(`^${link.hrefPrefix}`));
  }

  await page.goto("/admin/finance");
  await expect(page.getByRole("heading", { name: "Finance Operations" })).toBeVisible();
  const financeLaunchpadLinks: Array<{ label: string; hrefPrefix: string }> = [
    { label: "Collections Workspace", hrefPrefix: "/admin/collections" },
    { label: "Payment Register", hrefPrefix: "/admin/payments" },
    { label: "Purchase Bills", hrefPrefix: "/admin/purchases/bills" },
    { label: "Vendor Ledger View", hrefPrefix: "/admin/accounting/vendors" },
    { label: "Flagged Queue", hrefPrefix: "/admin/accounting/bridge-reconciliation" },
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
