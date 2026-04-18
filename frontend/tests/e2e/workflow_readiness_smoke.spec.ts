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
      "/admin/subscriptions/create",
      "/admin/payments/create",
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
    await page.goto("/admin/settings/business-setup/checklist");
    await expect(page.getByRole("heading", { name: "Business setup checklist" })).toBeVisible();

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
    await page.goto("/admin/subscription-requests");
    await expect(page.locator("main h1", { hasText: "Subscription Requests" })).toBeVisible();

    await page.goto("/admin/subscriptions");
    await expect(page.locator("main h1", { hasText: "Subscription Register" })).toBeVisible();

    await page.goto("/admin/subscriptions/create");
    await expect(page.locator("main h1", { hasText: "Create Subscription" })).toBeVisible();

    await page.goto("/admin/payments");
    await expect(page.locator("main h1", { hasText: "Payments Register" })).toBeVisible();

    await page.goto("/admin/payments/create");
    await expect(page.locator("main h1", { hasText: "Admin Collection Entry" })).toBeVisible();
  });
});

test.describe("cashier workflow smoke", () => {
  test.use({ storageState: authStatePath("cashier") });

  test("cashier collection and payment pages load with counter pre-flight banner", async ({
    page,
  }) => {
    await page.goto("/cashier/collect");
    await expect(page.getByRole("heading", { name: "Collect Payment" })).toBeVisible();
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

  test("partner collections and subscription requests pages load", async ({ page }) => {
    await page.goto("/partner/collections");
    await expect(page.locator("main h1", { hasText: "Partner Collections" })).toBeVisible();

    await page.goto("/partner/subscription-requests");
    await expect(
      page.getByRole("heading", { name: "Partner Subscription Requests", exact: true })
    ).toBeVisible();
  });
});

test.describe("customer workflow smoke", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer subscription requests, subscriptions, payments, and support pages load", async ({
    page,
  }) => {
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
