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
    await expect(page.getByText("Control Center", { exact: true })).toBeVisible();
    await expect(page.getByText("Sales & Onboarding", { exact: true })).toBeVisible();
    await expect(page.getByText("Collections & EMI", { exact: true })).toBeVisible();
    await expect(page.getByText("Fulfillment", { exact: true })).toBeVisible();
    await expect(page.getByText("Catalog & Inventory", { exact: true })).toBeVisible();
    await expect(page.getByText("Partner Finance", { exact: true })).toBeVisible();
    await expect(page.getByText("Billing & Accounting", { exact: true })).toBeVisible();
    await expect(page.getByText("Governance", { exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Collect EMI" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "New Contract" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Daily action buckets" })).toBeVisible();
    await expect(page.getByText("Overdue EMI follow-up", { exact: true })).toBeVisible();
    await expect(page.getByText("Flagged payment reconciliation", { exact: true })).toBeVisible();
    await expect(page.getByText("Pending delivery actions", { exact: true })).toBeVisible();
    await expect(page.getByText("Onboarding handoff", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export upcoming" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export overdue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" }).first()).toBeVisible();
  });
});
