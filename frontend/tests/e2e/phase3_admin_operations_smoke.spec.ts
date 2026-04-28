import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("phase-3 admin operations hubs load with visible navigation actions", async ({ page }) => {
  await page.goto("/admin/inventory");
  await expect(
    page.getByRole("heading", { name: "Inventory Operations" })
  ).toBeVisible();
  const inventoryActions = page.locator(".portal-page-actions");
  await expect(inventoryActions.getByRole("link", { name: "Items" })).toBeVisible();
  await expect(inventoryActions.getByRole("link", { name: "Ledger" })).toBeVisible();
  await expect(inventoryActions.getByRole("link", { name: "Adjustments" })).toBeVisible();

  await page.goto("/admin/billing");
  await expect(
    page.getByRole("heading", { name: "Billing Operations" })
  ).toBeVisible();
  const billingActions = page.locator(".portal-page-actions");
  await expect(billingActions.getByRole("link", { name: "Invoices" })).toBeVisible();
  await expect(billingActions.getByRole("link", { name: "Credit Notes" })).toBeVisible();
  await expect(billingActions.getByRole("link", { name: "Debit Notes" })).toBeVisible();
  await expect(billingActions.getByRole("link", { name: "Receipts" })).toBeVisible();

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

test("phase-3 admin operational surfaces share the control-center framework", async ({
  page,
}) => {
  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { name: "Operations Workspace" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Operational launch map");

  await page.goto("/admin/branch-reporting");
  await expect(page.getByRole("heading", { name: "Branch Reporting" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Branch operating lenses");

  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Analytics" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Analysis route map");

  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Reports Overview" }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Report directory");

  await page.goto("/admin/customers");
  await expect(page.getByRole("heading", { name: "Customer Register" }).first()).toBeVisible();
  await expect(page.locator(".portal-page-actions").getByRole("link", { name: "Create Subscription" })).toBeVisible();

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
