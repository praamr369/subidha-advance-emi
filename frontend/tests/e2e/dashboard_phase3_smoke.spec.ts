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
    await expect(
      page.getByRole("heading", { name: /(?:Executive|Admin) Dashboard/i })
    ).toBeVisible();
    // Sidebar group titles also appear in dashboard KPI surfaces; scope to the sidebar to avoid strict-mode collisions.
    await expect(sidebar.getByText("Executive Overview", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("CRM & Leads", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Sales & Orders", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Subscriptions", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Finance & Accounts", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Reports & Analytics", { exact: true })).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Business Control Center", exact: true })
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Analytics", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Urgent Attention" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Launch Points" })).toBeVisible();
    await expect(page.locator("body")).toContainText("Overdue Advance EMI follow-up");
    await expect(page.locator("body")).toContainText("Finance Control");
    await expect(page.locator("body")).toContainText("Reports Center");
  });
});
