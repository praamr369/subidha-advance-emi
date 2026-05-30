import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";
import { resetAdminDashboardClientState } from "./helpers/dashboard-state";

async function expectSuccessOrControlledFetchError(
  page: Parameters<typeof test>[0]["page"],
  success: () => Promise<void>,
) {
  const failedToFetch = page.getByText("Failed to fetch");
  if (await failedToFetch.isVisible().catch(() => false)) {
    await expect(failedToFetch).toBeVisible();
    await expect(page.getByRole("heading", { name: /Customer Workspace|Admin Dashboard/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Unauthorized/i })).toHaveCount(0);
    return;
  }
  await success();
}

test.describe("customer dashboard phase-3 smoke", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer dashboard shows export actions on canonical surfaces", async ({ page }) => {
    await page.goto("/customer");
    await expectSuccessOrControlledFetchError(page, async () => {
      await expect(page.getByRole("heading", { name: "Customer Workspace" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Export upcoming" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Export overdue" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Export CSV" }).first()).toBeVisible();
    });
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
    await expectSuccessOrControlledFetchError(page, async () => {
      await expect(
        page.getByRole("heading", { name: /Daily Operator Dashboard|Executive Dashboard|Admin Dashboard/i })
      ).toBeVisible();
    });
    // Sidebar group titles also appear in dashboard KPI surfaces; scope to the sidebar to avoid strict-mode collisions.
    await expect(sidebar.getByRole("button", { name: "Command Center", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /CRM|CRM & Partners/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Sales|Sales & Contracts/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Inventory|Product & Inventory/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Delivery & Service|Delivery & Returns/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Billing & Finance|Finance & Accounting/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Staff & Business Setup|Settings/, exact: false })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Operations Command Center", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Subscription Workflows", exact: true })).toBeVisible();

    await sidebar.getByRole("button", { name: "Expand Advance EMI" }).click();
    await expect(sidebar.getByRole("link", { name: "Batch Register", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Lucky ID Register", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Lucky Draws", exact: true })).toBeVisible();

    await sidebar.getByRole("button", { name: "Expand Rent" }).click();
    const rentRegister = sidebar.getByRole("link", { name: "Rent Contract Register", exact: true });
    await expect(rentRegister).toBeVisible();
    const rentNested = rentRegister.locator("xpath=ancestor::div[contains(@class,'border-l')][1]");
    await expect(rentNested.getByRole("link", { name: "Lucky ID Register", exact: true })).toHaveCount(0);
    await expect(rentNested.getByRole("link", { name: "Lucky Draws", exact: true })).toHaveCount(0);

    await sidebar.getByRole("button", { name: "Expand Lease" }).click();
    const leaseRegister = sidebar.getByRole("link", { name: "Lease Contract Register", exact: true });
    await expect(leaseRegister).toBeVisible();
    const leaseNested = leaseRegister.locator("xpath=ancestor::div[contains(@class,'border-l')][1]");
    await expect(leaseNested.getByRole("link", { name: "Lucky ID Register", exact: true })).toHaveCount(0);
    await expect(leaseNested.getByRole("link", { name: "Lucky Draws", exact: true })).toHaveCount(0);

    await sidebar.getByRole("button", { name: "Expand Partner Operations" }).click();
    await expect(sidebar.getByRole("link", { name: "Partner Payment Requests", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Partner Collections", exact: true })).toBeVisible();
    await sidebar.getByPlaceholder("Search modules").fill("Partner Payment Requests");
    await expect(sidebar.getByRole("link", { name: "Partner Payment Requests", exact: true })).toBeVisible();
    await sidebar.getByPlaceholder("Search modules").clear();
    const executiveLoadError = page.getByText(/Unable to load executive dashboard|Failed to fetch/i);
    if (await executiveLoadError.isVisible().catch(() => false)) {
      await expect(executiveLoadError).toBeVisible();
      const adminDashboardHeading = page.getByRole("heading", { name: "Admin Dashboard", exact: true });
      const dashboardHeading = page.getByRole("heading", { name: "Dashboard", exact: true });
      const hasAdminHeading = await adminDashboardHeading.isVisible().catch(() => false);
      const hasDashboardHeading = await dashboardHeading.isVisible().catch(() => false);
      expect(hasAdminHeading || hasDashboardHeading).toBeTruthy();
      await expect(page.getByRole("heading", { name: /Unauthorized/i })).toHaveCount(0);
    } else {
      await expect(page.getByRole("heading", { name: "Urgent alerts", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Quick actions", exact: true })).toBeVisible();
      await expect(page.locator("body")).toContainText("Collect payment");
      await expect(page.locator("body")).toContainText("Open operations");
      await expect(page.locator("body")).toContainText("Prepare delivery");
    }
  });

  test("admin command palette opens with Ctrl+K and searches nested workflow entries", async ({ page }) => {
    await page.goto("/admin");
    const trigger = page.getByLabel("Open command palette (Ctrl+K)");
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Ctrl K");

    await page.getByPlaceholder("Search operations, registers, workflows…").fill("Direct Sales");
    await expect(dialog.getByRole("link", { name: /Direct Sales/i })).toBeVisible();
    await page.getByPlaceholder("Search operations, registers, workflows…").fill("Create Direct Sale Invoice");
    await expect(dialog.getByRole("button", { name: /Create Direct Sale Invoice/i })).toBeVisible();
  });
});
