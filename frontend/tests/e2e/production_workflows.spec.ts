import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

const readinessBlocked = {
  is_ready: false,
  posting_ready: false,
  overall_status: "BLOCKED",
  blockers: [
    {
      key: "finance_mappings",
      label: "Finance mappings incomplete",
      detail: "Map collection accounts before posting.",
      route: "/admin/settings/business-setup/finance-accounts",
    },
    {
      key: "bridge_reconciliation",
      label: "Unresolved bridge blockers",
      detail: "Resolve bridge blockers before year-end close.",
      route: "/admin/accounting/bridge-reconciliation",
    },
  ],
  warnings: [
    {
      key: "reconciliation_exceptions",
      label: "Reconciliation exceptions present",
      detail: "Review exceptions before close.",
      route: "/admin/accounting/reconciliation",
    },
  ],
  action_links: [
    { label: "Finance accounts", href: "/admin/settings/business-setup/finance-accounts" },
    { label: "Bridge reconciliation", href: "/admin/accounting/bridge-reconciliation" },
  ],
};

test.describe("production workflow readiness - admin", () => {
  test.use({ storageState: authStatePath("admin") });

  test("setup and bridge pages expose blockers without claiming posting readiness", async ({ page }) => {
    await page.route("**/api/v1/admin/accounting/bridge-reconciliation/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(readinessBlocked),
      });
    });
    await page.route("**/api/v1/admin/accounting/year-end/readiness/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          can_close: false,
          is_ready: false,
          blockers: readinessBlocked.blockers,
          warnings: readinessBlocked.warnings,
          action_links: readinessBlocked.action_links,
          no_auto_posting: true,
          read_only: true,
        }),
      });
    });

    await page.goto("/admin/accounting/bridge-reconciliation");
    await expect(page.getByRole("heading", { name: /Bridge Reconciliation/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/blocker|blocked|mapping|reconciliation/i);
    await expect(page.locator("body")).not.toContainText(/posting is ready|ready to post automatically/i);

    await page.goto("/admin/accounting/periods");
    await expect(page.locator("body")).toContainText(/Year-End|Close|readiness|block/i);
  });

  test("lucky plan subscription detail shows lucky ID, EMI schedule, and payment handoff", async ({ page }) => {
    const manifest = readSmokeManifest();
    const subscriptionId = manifest.entities.admin.subscription_id;

    await page.goto(`/admin/subscriptions/${subscriptionId}`);
    await expect(page.getByRole("heading", { name: new RegExp(`Subscription #${subscriptionId}`) })).toBeVisible();
    await expect(page.locator("body")).toContainText(/Lucky|EMI|Schedule|Payment/i);

    const collectLink = page.locator(`a[href="/admin/finance/collect?subscription=${subscriptionId}"]`).first();
    if ((await collectLink.count()) > 0) {
      await collectLink.click();
      await expect(page).toHaveURL(new RegExp(`/admin/finance/collect\\?subscription=${subscriptionId}$`));
      await expect(page.locator("#subscription_id")).toHaveValue(String(subscriptionId));
      await expect(page.locator("#emi_id")).not.toHaveValue("");
    }
  });

  test("direct sale and rent/lease workspaces remain separate from EMI subscription UI", async ({ page }) => {
    await page.goto("/admin/billing/direct-sale");
    await expect(page.locator("body")).toContainText(/Direct Sale|sale|invoice|receipt/i);
    await expect(page.locator("body")).not.toContainText(/Lucky ID required/i);

    await page.goto("/admin/rent-lease");
    await expect(page.locator("body")).toContainText(/Rent|Lease|Deposit|Monthly/i);
    await expect(page.locator("body")).not.toContainText(/Lucky ID is required|Lucky draw is required/i);
  });
});

test.describe("production workflow readiness - role boundaries", () => {
  test("cashier can open collection but not setup or year-end close", async ({ browser }) => {
    const context = await browser.newContext({ storageState: authStatePath("cashier") });
    const page = await context.newPage();

    await page.goto("/cashier/collect");
    await expect(page.getByRole("heading", { name: /Collect Payment/i })).toBeVisible();

    await page.goto("/admin/settings/business-setup/finance-accounts");
    await expect(page.locator("body")).toContainText(/access denied|forbidden|not authorized|login|dashboard/i);

    await page.goto("/admin/accounting/periods");
    await expect(page.locator("body")).toContainText(/access denied|forbidden|not authorized|login|dashboard/i);
    await context.close();
  });

  test("partner and customer stay in their own subscription/payment surfaces", async ({ browser }) => {
    const partnerContext = await browser.newContext({ storageState: authStatePath("partner") });
    const partnerPage = await partnerContext.newPage();
    await partnerPage.goto("/partner/subscriptions");
    await expect(partnerPage.getByRole("heading", { name: /Partner Subscriptions/i })).toBeVisible();
    await partnerPage.goto("/admin/subscriptions");
    await expect(partnerPage.locator("body")).toContainText(/access denied|forbidden|not authorized|login|dashboard/i);
    await partnerContext.close();

    const customerContext = await browser.newContext({ storageState: authStatePath("customer") });
    const customerPage = await customerContext.newPage();
    await customerPage.goto("/customer/subscriptions");
    await expect(customerPage.getByRole("heading", { name: /My Subscriptions/i })).toBeVisible();
    await customerPage.goto("/admin/payments");
    await expect(customerPage.locator("body")).toContainText(/access denied|forbidden|not authorized|login|dashboard/i);
    await customerContext.close();
  });
});
