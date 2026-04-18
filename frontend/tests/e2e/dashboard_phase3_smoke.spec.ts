import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.describe("customer dashboard phase-3 smoke", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer dashboard shows export actions on canonical surfaces", async ({ page }) => {
    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: "Customer Workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export upcoming" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export overdue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" }).first()).toBeVisible();
  });
});

test.describe("admin dashboard phase-3 smoke", () => {
  test.use({ storageState: authStatePath("admin") });

  test("admin dashboard shows canonical sidebar groups and action workspace buckets", async ({ page }) => {
    await page.goto("/admin");
    const sidebar = page.getByRole("complementary");
    await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
    // Sidebar group titles also appear in dashboard KPI surfaces; scope to the sidebar to avoid strict-mode collisions.
    await expect(sidebar.getByText("Lucky Plan Operations", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("CRM & Parties", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Direct Sales & Billing", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Inventory & Procurement", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Manufacturing", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Service Desk", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Accounting & Finance", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Payroll & Workforce", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Branches & Counters", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Reports & Governance", { exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Collect EMI" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "New Subscription" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Daily action buckets" })).toBeVisible();
    // Bucket titles may appear both as headings and inside linked cards; assert the heading to avoid strict-mode collisions.
    await expect(page.getByRole("heading", { name: "Overdue EMI follow-up" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Flagged payment reconciliation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pending delivery actions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Onboarding handoff" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export upcoming" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export overdue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" }).first()).toBeVisible();
  });
});
