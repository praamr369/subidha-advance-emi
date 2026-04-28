import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";
import { resetAdminDashboardClientState } from "./helpers/dashboard-state";

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

  test.beforeEach(async ({ page }) => {
    await resetAdminDashboardClientState(page);
  });

  test("admin dashboard shows canonical sidebar groups and action workspace buckets", async ({ page }) => {
    await page.goto("/admin");
    const sidebar = page.getByRole("complementary");
    await expect(
      page.getByRole("heading", { name: /(?:Executive|Admin) Dashboard/i })
    ).toBeVisible();
    // Sidebar group titles also appear in dashboard KPI surfaces; scope to the sidebar to avoid strict-mode collisions.
    await expect(sidebar.getByText("Command Center", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("CRM", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Sales", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Subscriptions", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Product & Inventory", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Delivery & Returns", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Finance & Accounting", { exact: true })).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: "Staff & Business Setup", exact: true })
    ).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Operations Command Center", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Subscription Workflows", exact: true })).toBeVisible();

    await sidebar.getByRole("button", { name: "Expand Advance EMI" }).click();
    await expect(sidebar.getByRole("link", { name: "Batch Register", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Lucky ID Register", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Lucky Draws", exact: true })).toBeVisible();

    await sidebar.getByRole("button", { name: "Expand Rent" }).click();
    const rentLink = sidebar.getByRole("link", { name: "Rent", exact: true });
    const rentSection = rentLink.locator("xpath=ancestor::div[contains(@class,'space-y-1')][1]");
    await expect(rentSection.getByRole("link", { name: "Rent Contract Register", exact: true })).toBeVisible();
    await expect(rentSection.getByRole("link", { name: "Lucky ID Register", exact: true })).toHaveCount(0);
    await expect(rentSection.getByRole("link", { name: "Lucky Draws", exact: true })).toHaveCount(0);

    await sidebar.getByRole("button", { name: "Expand Lease" }).click();
    const leaseLink = sidebar.getByRole("link", { name: "Lease", exact: true });
    const leaseSection = leaseLink.locator("xpath=ancestor::div[contains(@class,'space-y-1')][1]");
    await expect(leaseSection.getByRole("link", { name: "Lease Contract Register", exact: true })).toBeVisible();
    await expect(leaseSection.getByRole("link", { name: "Lucky ID Register", exact: true })).toHaveCount(0);
    await expect(leaseSection.getByRole("link", { name: "Lucky Draws", exact: true })).toHaveCount(0);

    await sidebar.getByRole("button", { name: "Expand Partner Operations" }).click();
    await expect(sidebar.getByRole("link", { name: "Partner Payment Requests", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Partner Collections", exact: true })).toBeVisible();
    await sidebar.getByPlaceholder("Filter modules").fill("Partner Payment Requests");
    await expect(sidebar.getByRole("link", { name: "Partner Payment Requests", exact: true })).toBeVisible();
    await sidebar.getByPlaceholder("Filter modules").clear();
    await expect(
      page.getByRole("heading", { name: "Urgent Attention", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Launch Points", exact: true })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Overdue Advance EMI follow-up");
    await expect(page.locator("body")).toContainText("Finance Control");
    await expect(page.locator("body")).toContainText("Reports Center");
  });

  test("admin command palette opens with Ctrl+K and searches nested workflow entries", async ({ page }) => {
    await page.goto("/admin");

    await page.keyboard.press("Control+K");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();

    await page.getByPlaceholder("Search operations, registers, workflows…").fill("Create Direct Sale");

    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog.getByRole("link", { name: "Create Direct Sale Enter" })).toBeVisible();
    await expect(dialog).toContainText(
      "/admin/sales/direct-sale/create"
    );
  });
});
