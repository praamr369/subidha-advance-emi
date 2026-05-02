import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("cashier") });

test.describe.serial("cashier smoke", () => {
  test("cashier dashboard loads", async ({ page }) => {
    await page.goto("/cashier");
    await expect(
      page.getByRole("heading", { name: "Cashier Dashboard" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("complementary")
        .getByRole("link", { name: "Payment History", exact: true })
    ).toBeVisible();
  });

  test("cashier collectible search works by phone and subscription", async ({
    page,
  }) => {
    const manifest = readSmokeManifest();

    await page.goto("/cashier/collect");
    await page.locator("#cashier-search-input").fill(
      manifest.entities.cashier.customer_phone
    );
    await page
      .locator("form")
      .filter({ has: page.locator("#cashier-search-input") })
      .getByRole("button", { name: "Search" })
      .click();

    await expect(page.getByText("Customer summary")).toBeVisible();
    await expect(
      page.getByText(manifest.entities.cashier.customer_name).first()
    ).toBeVisible();

    await page.selectOption("#cashier-search-mode", "subscription");
    await page.locator("#cashier-search-input").fill(
      manifest.entities.cashier.subscription_number
    );
    await page
      .locator("form")
      .filter({ has: page.locator("#cashier-search-input") })
      .getByRole("button", { name: "Search" })
      .click();

    await expect(page.getByText("Search matches")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(manifest.entities.cashier.subscription_number),
      }).first()
    ).toBeVisible();
  });

  test("cashier collection flow posts and opens receipt plus searchable history", async ({
    page,
  }) => {
    const manifest = readSmokeManifest();

    await page.goto("/cashier/collect");
    await page.locator("#cashier-search-input").fill(
      manifest.entities.cashier.customer_phone
    );
    await page
      .locator("form")
      .filter({ has: page.locator("#cashier-search-input") })
      .getByRole("button", { name: "Search" })
      .click();

    await page.getByRole("button", { name: /EMI Month 2/i }).click();
    await expect(page.locator("#collect-amount")).toHaveValue("200.00");
    await page.selectOption("#collect-method", "CASH");
    await page.locator("#collect-finance-account").selectOption({ index: 1 });
    await page.getByRole("button", { name: /^Collect Payment$/ }).click();

    await expect(page.getByRole("link", { name: "Open Receipt" })).toBeVisible();
    await page.getByRole("link", { name: "Open Receipt" }).click();

    await expect(page).toHaveURL(/\/cashier\/payments\/\d+$/);
    const heading = await page
      .getByRole("heading", { name: /Receipt #\d+/ })
      .textContent();
    const paymentIdMatch = heading?.match(/(\d+)/);
    expect(paymentIdMatch).toBeTruthy();
    const paymentId = paymentIdMatch?.[1] ?? "";

    await page.getByRole("link", { name: "Back to History" }).click();
    await expect(page).toHaveURL(/\/cashier\/payments$/);
    await page.locator("#cashier-payment-search").fill(paymentId);
    await page
      .locator("form")
      .filter({ has: page.locator("#cashier-payment-search") })
      .getByRole("button", { name: "Search" })
      .click();
    await expect(page.getByText(`#${paymentId}`, { exact: true }).first()).toBeVisible();
  });

  test("cashier can collect unapplied advance with a finance account", async ({
    page,
  }) => {
    const manifest = readSmokeManifest();

    await page.goto("/cashier/collect");
    await page.locator("#cashier-search-input").fill(
      manifest.entities.cashier.customer_phone
    );
    await page
      .locator("form")
      .filter({ has: page.locator("#cashier-search-input") })
      .getByRole("button", { name: "Search" })
      .click();

    await expect(page.getByText("Step 4 · Collect unapplied customer advance")).toBeVisible();
    await page.locator("#collect-advance-amount").fill("50.00");
    await page.locator("#collect-advance-finance-account").selectOption({ index: 1 });
    await page.getByRole("button", { name: /^Collect Advance$/ }).click();

    await expect(page.getByText(/Customer advance collected successfully/i)).toBeVisible();
    await expect(page.getByText(/Advance #/i)).toBeVisible();
  });

  test("cashier cannot access admin pages", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/unauthorized$/);
  });

  test("cashier universal search shows EMI and Direct Sale badges", async ({ page }) => {
    await page.route("**/api/v1/cashier/receivables/search/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: 2,
          results: [
            {
              contract_reference_id: 101,
              result_type: "EMI",
              action_type: "COLLECT_EMI",
              source_type: "ADVANCE_EMI",
              source_id: 501,
              reference_no: "REF-EMI-501",
              display_reference: "REF-EMI-501",
              customer_id: 9,
              customer_name: "Badge Customer",
              phone_masked: "98******01",
              product_summary: "Sofa EMI",
              due_amount: "100.00",
              paid_amount: "0.00",
              total_amount: "1200.00",
              overdue_amount: "0.00",
              next_due_date: null,
              status: "ACTIVE",
              payment_state: "",
              primary_action: "COLLECT_EMI",
              allowed_actions: ["COLLECT_EMI"],
              disabled_reason: null,
              collection_route: "",
            },
            {
              contract_reference_id: 102,
              result_type: "DIRECT_SALE",
              action_type: "COLLECT_DIRECT_SALE",
              source_type: "DIRECT_SALE",
              source_id: 802,
              reference_no: "DS-802",
              display_reference: "DS-802",
              customer_id: 9,
              customer_name: "Badge Customer",
              phone_masked: "98******01",
              product_summary: "Retail SKU",
              due_amount: "250.00",
              paid_amount: "0.00",
              total_amount: "250.00",
              overdue_amount: "0.00",
              next_due_date: null,
              status: "INVOICED",
              payment_state: "UNPAID",
              primary_action: "COLLECT_DIRECT_SALE",
              allowed_actions: ["COLLECT_DIRECT_SALE"],
              disabled_reason: null,
              collection_route: "/cashier/collect?workflow=direct-sale",
            },
          ],
        }),
      });
    });

    await page.goto("/cashier/collect");
    await page.locator("#unified-receivable-search").fill("badge-query");
    await page
      .locator("form")
      .filter({ has: page.locator("#unified-receivable-search") })
      .getByRole("button", { name: "Search" })
      .click();

    await expect(page.getByTestId("unified-receivable-badge-EMI")).toBeVisible();
    await expect(page.getByTestId("unified-receivable-badge-DIRECT_SALE")).toBeVisible();

    await page.getByTestId("unified-receivable-open-direct-sale-link").click();
    await expect(page).toHaveURL(/workflow=direct-sale/);
  });

  test("cashier universal search empty copy stays helpful", async ({ page }) => {
    await page.route("**/api/v1/cashier/receivables/search/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 0, results: [] }),
      });
    });

    await page.goto("/cashier/collect");
    await page.locator("#unified-receivable-search").fill("zz-no-rows");
    await page
      .locator("form")
      .filter({ has: page.locator("#unified-receivable-search") })
      .getByRole("button", { name: "Search" })
      .click();

    await expect(page.getByText(/Try another phone number/i)).toBeVisible();
  });

  test("cashier notifications page loads", async ({ page }) => {
    await page.route("**/api/v1/cashier/notifications/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: 1,
          unread_count: 1,
          results: [
            {
              id: 9001,
              module: "billing",
              category: "RECEIPT_CREATED",
              severity: "INFO",
              title: "Receipt created",
              body: "Receipt generated for cashier collection.",
              payload: {},
              is_read: false,
              read_at: null,
              created_at: "2026-04-25T09:15:00Z",
              source_job_id: null,
            },
          ],
        }),
      });
    });

    await page.goto("/cashier/notifications");
    await expect(
      page.getByRole("heading", { name: "Notifications" }).last()
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Receipt created");
  });
});
