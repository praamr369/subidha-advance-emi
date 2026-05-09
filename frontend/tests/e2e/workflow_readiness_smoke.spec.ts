import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const notReadyChecklist = {
  is_ready_for_go_live: false,
  percent_complete: 32,
  counts: {
    required_items_total: 6,
    required_items_complete: 2,
    business_profile_configured: false,
    cash_counters_active: 0,
    products: 0,
  },
  items: [
    {
      key: "business_profile",
      label: "Business profile configured",
      level: "required",
      status: "missing",
      detail: "Add legal profile and contact defaults.",
      route: "/admin/settings/business-setup/profile",
    },
    {
      key: "cash_counter",
      label: "Collection counter available",
      level: "required",
      status: "missing",
      detail: "Create at least one active counter.",
      route: "/admin/counters",
    },
    {
      key: "products",
      label: "Products added",
      level: "required",
      status: "missing",
      detail: "Add at least one product.",
      route: "/admin/products",
    },
    {
      key: "document_sequences",
      label: "Invoice/receipt number series configured",
      level: "recommended",
      status: "warning",
      detail: "Configure at least one active document sequence.",
      route: "/admin/accounting/periods",
    },
  ],
};

test.describe("admin readiness banner", () => {
  test.use({ storageState: authStatePath("admin") });

  test("sensitive admin routes show setup pre-flight warning when checklist is incomplete", async ({
    page,
  }) => {
    await page.route("**/api/v1/admin/business-setup/checklist/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(notReadyChecklist),
      });
    });

    const sensitiveRoutes = [
      "/admin",
      "/admin/subscriptions",
      "/admin/subscriptions/advance-emi/create",
      "/admin/finance/collect",
      "/admin/billing/register",
      "/admin/lucky-draws",
      "/admin/products",
      "/admin/batches",
    ];

    for (const path of sensitiveRoutes) {
      await page.goto(path);
      await expect(page.getByTestId("business-setup-readiness-banner")).toContainText(
        "Setup incomplete for live operations"
      );
      await expect(page.getByTestId("business-setup-readiness-banner")).toContainText(
        "Open setup checklist"
      );
    }
  });

  test("business setup checklist and profile flows load and profile save is wired", async ({
    page,
  }) => {
    await page.route("**/api/v1/admin/business-setup/checklist/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...notReadyChecklist,
          counts: {
            ...notReadyChecklist.counts,
            invoice_numbering_configured: 0,
            receipt_numbering_configured: 0,
            direct_sale_invoice_numbering_configured: 0,
          },
        }),
      });
    });
    await page.goto("/admin/settings/business-setup/checklist");
    await expect(page.getByRole("heading", { name: "Business setup checklist" })).toBeVisible();
    await expect(
      page.locator("#main-content").getByText("Document Numbering").first()
    ).toBeVisible();
    await expect(
      page.locator("#main-content").getByText("Invoice numbering readiness", { exact: true })
    ).toBeVisible();
    await expect(
      page.locator("#main-content").getByText("Receipt numbering readiness", { exact: true })
    ).toBeVisible();
    await expect(
      page.locator("#main-content").getByText("Direct-sale invoice numbering readiness", { exact: true })
    ).toBeVisible();

    await page.route("**/api/v1/admin/business-profile/", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            legal_name: "Subidha Furniture",
            trade_name: "Subidha",
            primary_email: "ops@subidha.local",
            country: "India",
            is_active: true,
          }),
        });
        return;
      }

      const payload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...payload, legal_name: payload.legal_name || "Subidha Furniture" }),
      });
    });

    await page.goto("/admin/settings/business-setup/profile");
    await expect(page.getByRole("heading", { name: "Business profile" })).toBeVisible();
    await page.getByRole("button", { name: "Save business profile" }).click();
    await expect(page.locator("body")).toContainText("Business profile saved.");
  });

  test("admin workflow pages for requests, subscriptions, and payments load", async ({ page }) => {
    await page.goto("/admin/erp");
    await expect(page.locator("main h1", { hasText: "ERP Home" })).toBeVisible();

    await page.goto("/admin/crm");
    await expect(page.locator("main h1", { hasText: "CRM Workspace" })).toBeVisible();

    await page.goto("/admin/sales");
    await expect(page.locator("main h1", { hasText: "Sales Workspace" })).toBeVisible();

    await page.goto("/admin/subscription-requests");
    await expect(page.locator("main h1", { hasText: "Subscription Requests" })).toBeVisible();

    await page.goto("/admin/subscriptions");
    await expect(page.locator("main h1", { hasText: "Subscriptions" })).toBeVisible();
    await expect(page.locator("body")).toContainText("Advance EMI");
    await expect(page.locator("body")).toContainText("Rent does not expose Lucky ID or Lucky Draw workflows.");

    await page.goto("/admin/subscriptions/advance-emi/create");
    await expect(page.locator("main h1", { hasText: "Create Subscription" })).toBeVisible();

    await page.goto("/admin/finance");
    await expect(page.locator("main h1", { hasText: "Finance Control Center" })).toBeVisible();

    await page.goto("/admin/inventory");
    await expect(page.locator("main h1", { hasText: "Inventory Operations" })).toBeVisible();

    await page.goto("/admin/delivery");
    await expect(page.locator("main h1", { hasText: "Delivery Workspace" })).toBeVisible();

    await page.goto("/admin/payments");
    await expect(page.locator("main h1", { hasText: "Payments Register" })).toBeVisible();

    await page.goto("/admin/finance/collect");
    await expect(page.locator("main h1", { hasText: "Admin Collection Entry" })).toBeVisible();
  });

  test("legacy admin duplicate routes redirect to canonical workflow pages", async ({ page }) => {
    await page.goto("/admin/lucky-draw/history");
    await expect(page).toHaveURL(/\/admin\/lucky-draws$/);

    await page.goto("/admin/payments/history");
    await expect(page).toHaveURL(/\/admin\/payments$/);

    await page.goto("/admin/finance/commisions");
    await expect(page).toHaveURL(/\/admin\/finance\/commissions$/);

    await page.goto("/admin/emi/overdue");
    await expect(page).toHaveURL(/\/admin\/emis\/overdue$/);
  });
});

test.describe("cashier workflow smoke", () => {
  test.use({ storageState: authStatePath("cashier") });

  test("cashier collection and payment pages load with counter pre-flight banner", async ({
    page,
  }) => {
    await page.goto("/cashier/collect", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Collect Payment" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("business-setup-readiness-banner")).toContainText(
      "Counter pre-flight reminder"
    );

    await page.goto("/cashier/payments");
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();
    await expect(page.getByTestId("business-setup-readiness-banner")).toContainText(
      "Counter pre-flight reminder"
    );
  });
});

test.describe("partner workflow smoke", () => {
  test.use({ storageState: authStatePath("partner") });

  test("partner collections, subscriptions, requests, and reports pages load", async ({ page }) => {
    await page.goto("/partner/collections");
    await expect(page.locator("main h1", { hasText: "Collection Workspace" })).toBeVisible();

    await page.goto("/partner/subscriptions");
    await expect(page.locator("main h1", { hasText: "Partner Subscriptions" })).toBeVisible();

    await page.goto("/partner/subscription-requests");
    await expect(
      page.getByRole("heading", { name: "Partner Subscription Requests", exact: true })
    ).toBeVisible();

    await page.goto("/partner/reports");
    await expect(page.locator("main h1", { hasText: "Partner Reports" })).toBeVisible();
  });
});

test.describe("customer workflow smoke", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer deliveries, subscription requests, subscriptions, payments, and support pages load", async ({
    page,
  }) => {
    await page.goto("/customer/deliveries");
    await expect(page.locator("main h1", { hasText: "Delivery Tracking" })).toBeVisible();

    await page.goto("/customer/subscription-requests");
    await expect(page.locator("main h1", { hasText: "Subscription Requests" })).toBeVisible();

    await page.goto("/customer/subscriptions");
    await expect(page.locator("main h1", { hasText: "My Subscriptions" })).toBeVisible();

    await page.goto("/customer/payments");
    await expect(page.locator("main h1", { hasText: "My Payments" })).toBeVisible();

    await page.goto("/customer/support");
    await expect(page.locator("main h1", { hasText: "Support" })).toBeVisible();
  });
});
