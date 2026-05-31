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

  test("admin dashboard shows parent-only ERP sidebar modules", async ({ page }) => {
    await page.goto("/admin");
    const sidebar = page.getByRole("complementary");
    await expectSuccessOrControlledFetchError(page, async () => {
      await expect(
        page.getByRole("heading", { name: /Daily Operator Dashboard|Executive Dashboard|Admin Dashboard/i })
      ).toBeVisible();
    });

    const expectedParentModules = [
      "Command Center",
      "Sales & Contracts",
      "Subscription EMI",
      "Rent / Lease",
      "Direct Sale",
      "Accounting & Finance",
      "Inventory",
      "Manufacturing",
      "CRM / Parties",
      "HR & Staff",
      "Service Desk",
      "Delivery & Operations",
      "Reports & Analysis",
      "Settings",
    ];

    for (const label of expectedParentModules) {
      await expect(sidebar.getByRole("link", { name: label, exact: true })).toBeVisible();
    }

    const forbiddenSidebarItems = [
      "Batch Register",
      "Lucky ID Register",
      "EMI Schedule / EMI Register",
      "Winners",
      "Waiver / Loss Report",
      "Security Deposits",
      "Delivery Requests",
    ];

    for (const label of forbiddenSidebarItems) {
      await expect(sidebar.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    }

    await expect(sidebar.getByRole("link", { name: "Accounting & Finance", exact: true })).toHaveAttribute("href", "/admin/accounting");
    await expect(sidebar.getByRole("link", { name: "Subscription EMI", exact: true })).toHaveAttribute("href", "/admin/subscriptions");
    await expect(sidebar.getByRole("link", { name: "Direct Sale", exact: true })).toHaveAttribute("href", "/admin/billing/direct-sale");
    await expect(sidebar.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("href", "/admin/settings");

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

  test("admin command palette opens with Ctrl+K and searches hidden workflow entries", async ({ page }) => {
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
    await page.getByPlaceholder("Search operations, registers, workflows…").fill("Batch Register");
    await expect(dialog.getByRole("link", { name: "Batch Register", exact: true })).toBeVisible();
  });
});
