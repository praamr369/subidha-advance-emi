import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("phase-3 admin operations hubs load with visible navigation actions", async ({ page }) => {
  await page.goto("/admin/inventory");
  await expect(
    page.getByRole("heading", { name: "Stock Posture" }).first()
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Items" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ledger" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Adjustments" }).first()).toBeVisible();

  await page.goto("/admin/billing");
  await expect(
    page.getByRole("heading", { name: "Billing Operations" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Invoices" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Credit Notes" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Debit Notes" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Receipts" }).first()).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Accounting Bridge Readiness" })).toBeVisible();
});

test("phase-3 admin operational surfaces share the control-center framework", async ({
  page,
}) => {
  await page.goto("/admin/vendors/quotes");
  await expect(page.getByRole("heading", { name: /Vendor quote requests/i }).first()).toBeVisible();

  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { name: "Operations Working Screen" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Action-first queues");
  await expect(page.locator("body")).toContainText("HR actions");
  await expect(page.getByRole("link", { name: "Mark Attendance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Approve Leave" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Approve Expense" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Payroll" })).toBeVisible();

  await page.goto("/admin/branch-reporting");
  await expect(page.getByRole("heading", { name: "Branch Reporting" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Branch operating lenses");

  await page.goto("/admin/analytics");
  await expect(page).toHaveURL(/\/admin\/reports\?live=1/);
  await expect(page.getByRole("heading", { name: /Reports & analysis/i }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Live dashboard posture");

  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: /Reports & analysis/i }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Report directory");

  await page.goto("/admin/customers");
  await expect(page.getByRole("heading", { name: "Customer Register" }).first()).toBeVisible();
  await expect(page.locator(".portal-page-actions").getByRole("link", { name: "Create Customer" })).toBeVisible();

  await page.goto("/admin/crm");
  await expect(page.getByRole("heading", { name: "CRM Workspace" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("CRM Pipeline");

  await page.goto("/admin/crm/leads");
  await expect(page.getByRole("heading", { name: "CRM Lead Register" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Continuity filters");

  await page.goto("/admin/leads");
  await expect(page.getByRole("heading", { name: "Lead Inbox" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Lead queue controls");

  await page.goto("/admin/crm/parties");
  await expect(page.getByRole("heading", { name: "Party Directory" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Directory filters");
  await expect(page.locator("body")).toContainText("customers, partners, vendors, and staff");

  await page.goto("/admin/support-requests");
  await expect(page.getByRole("heading", { name: "Support Requests" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Support queue controls");

  await page.goto("/admin/service-desk");
  await expect(page.getByRole("heading", { name: "Service Desk" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Service route map");

  await page.goto("/admin/billing");
  await expect(page.getByRole("heading", { name: "Billing Operations" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Billing route directory");
});
