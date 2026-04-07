import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("partner") });

test("partner dashboard loads and payouts is not shown in navigation", async ({
  page,
}) => {
  await page.goto("/partner");
  await expect(
    page.getByRole("heading", { name: "Partner Dashboard" })
  ).toBeVisible();
  await expect(page.locator('a[href="/partner/payouts"]')).toHaveCount(0);
});

test("partner payouts route redirects to commissions", async ({ page }) => {
  await page.goto("/partner/payouts");
  await expect(page).toHaveURL(/\/partner\/commissions$/);
  await expect(
    page.getByRole("heading", { name: "Commission Ledger" })
  ).toBeVisible();
});

test("partner customers detail flow and payments history work", async ({
  page,
}) => {
  const manifest = readSmokeManifest();

  await page.goto("/partner/customers");
  await page
    .getByPlaceholder("Search name or phone")
    .fill(manifest.entities.admin.search_query);
  await page.getByRole("button", { name: "Apply" }).click();
  const customerRow = page.locator("tr", {
    hasText: manifest.entities.admin.customer_name,
  });
  await expect(customerRow).toBeVisible();
  await customerRow.getByRole("link", { name: "View Detail" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/partner/customers/${manifest.entities.partner.customer_id}$`)
  );
  await expect(
    page.getByRole("heading", { name: manifest.entities.admin.customer_name })
  ).toBeVisible();

  await page.getByRole("link", { name: "Customer Payments" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/partner/payments\\?customer=${manifest.entities.partner.customer_id}$`)
  );
  await expect(
    page.getByRole("heading", { name: "Partner Payments" })
  ).toBeVisible();
  await page.getByRole("link", { name: "View Detail" }).first().click();
  await expect(page).toHaveURL(
    /\/partner\/payments\/\d+/
  );
  await expect(
    page.getByRole("heading", {
      name: /Payment #\d+/,
    })
  ).toBeVisible();
});

test("partner collection request detail loads directly", async ({ page }) => {
  const manifest = readSmokeManifest();

  await page.goto(
    `/partner/collections/${manifest.entities.partner.collection_request_id}`
  );
  await expect(
    page.getByRole("heading", {
      name: new RegExp(
        `Collection Request #${manifest.entities.partner.collection_request_id}`
      ),
    })
  ).toBeVisible();
});

test("partner subscription detail keeps contract lifecycle and winner history separate", async ({
  page,
}) => {
  await page.route("**/api/v1/partner/subscriptions/501/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 501,
        subscription_number: "SUB-501",
        customer: 33,
        customer_name: "Winner Customer",
        customer_phone: "01711111111",
        product: 44,
        product_name: "Lucky Plan Product",
        product_code: "LP-501",
        batch: 55,
        batch_code: "BATCH-501",
        lucky_id: 77,
        lucky_number: 15,
        plan_type: "EMI",
        tenure_months: 2,
        start_date: "2026-03-01",
        total_amount: "2000.00",
        monthly_amount: "1000.00",
        status: "COMPLETED",
        winner_month: 1,
        winner_status: "WON",
        waived_amount: "1000.00",
        created_at: "2026-03-01T08:00:00Z",
        emi_count: 2,
        paid_emi_count: 1,
        pending_emi_count: 0,
        waived_emi_count: 1,
        last_payment_date: "2026-03-10",
        next_due_date: null,
        financial_summary: {
          emi_total: "2000.00",
          paid_amount: "1000.00",
          waived_amount: "1000.00",
          outstanding_amount: "0.00",
        },
        winner_summary: {
          winner_status: "WON",
          winner_month: 1,
          lucky_id: 77,
          lucky_number: 15,
          draw_id: 8,
          draw_month: 1,
          draw_revealed_at: "2026-03-05T09:00:00Z",
          waiver_scope: "FUTURE_EMI_ONLY",
          waived_emi_count: 1,
          waived_amount: "1000.00",
        },
        emis: [
          {
            id: 1,
            month_no: 1,
            due_date: "2026-03-10",
            amount: "1000.00",
            paid_amount: "1000.00",
            waived_amount: "0.00",
            outstanding_amount: "0.00",
            status: "PAID",
          },
          {
            id: 2,
            month_no: 2,
            due_date: "2026-04-10",
            amount: "1000.00",
            paid_amount: "0.00",
            waived_amount: "1000.00",
            outstanding_amount: "0.00",
            status: "WAIVED",
          },
        ],
      }),
    });
  });

  await page.goto("/partner/subscriptions/501");
  await expect(
    page.getByRole("heading", { name: "SUB-501" })
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("Contract, winner, and waiver posture");
  await expect(page.locator("body")).toContainText("Contract fully settled");
  await expect(page.locator("body")).toContainText("Winner recorded");
  await expect(page.locator("body")).toContainText("Month 1");
  await expect(page.locator("body")).toContainText("Fully settled");
  await expect(page.locator("body")).not.toContainText("subscription status is not");
});

test("partner can submit a new-customer subscription request", async ({ page }) => {
  const submittedPayloads: Record<string, unknown>[] = [];

  await page.route("**/api/v1/partner/subscription-request-options/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: [
          {
            id: 61,
            name: "Partner Request Product",
            product_code: "PREQ-061",
            base_price: "15000.00",
            image: null,
          },
        ],
        batches: [
          {
            id: 71,
            batch_code: "PARTNER-BATCH-71",
            duration_months: 15,
            available_slots: 18,
            start_date: "2026-04-01",
            status: "OPEN",
          },
        ],
        lucky_numbers: [21, 22, 23],
        customers: [
          {
            id: 44,
            name: "Visible Customer",
            phone: "01722222222",
            email: "visible@example.com",
            kyc_status: "VERIFIED",
          },
        ],
      }),
    });
  });

  await page.route("**/api/v1/partner/subscription-requests/", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    submittedPayloads.push(route.request().postDataJSON() as Record<string, unknown>);

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Subscription request submitted successfully.",
        request: {
          id: 811,
          requester_role_snapshot: "PARTNER",
          requester_username: "partner_user",
          partner_id: 9,
          partner_username: "partner_user",
          customer_id: null,
          customer_name: null,
          customer_phone: null,
          customer_email: null,
          requested_customer_name: "New Snapshot Customer",
          requested_customer_phone: "01733333333",
          requested_customer_email: "snapshot@example.com",
          requested_customer_address: "Partner Road",
          requested_customer_city: "Khulna",
          product_id: 61,
          product_name: "Partner Request Product",
          product_code: "PREQ-061",
          product_image: null,
          batch_id: 71,
          batch_code: "PARTNER-BATCH-71",
          preferred_lucky_number: 22,
          requested_tenure_months_snapshot: 15,
          notes: "Partner new customer request",
          status: "SUBMITTED",
          approved_subscription_id: null,
          approved_subscription_number: null,
          created_at: "2026-04-07T10:10:00Z",
          updated_at: "2026-04-07T10:10:00Z",
        },
      }),
    });
  });

  await page.goto("/partner/subscription-requests/create");
  await expect(
    page.getByRole("heading", { name: "Create Partner Subscription Request" })
  ).toBeVisible();

  await page.getByRole("button", { name: "New Customer Snapshot" }).click();
  await page.getByLabel("Customer name").fill("New Snapshot Customer");
  await page.getByLabel("Phone").fill("01733333333");
  await page.getByLabel("Email").fill("snapshot@example.com");
  await page.getByLabel("Address").fill("Partner Road");
  await page.getByLabel("City").fill("Khulna");
  await page.getByRole("combobox", { name: /^Product$/ }).selectOption("61");
  await page.getByRole("combobox", { name: /^Batch$/ }).selectOption("71");
  await page
    .getByRole("combobox", { name: /^Lucky number$/ })
    .selectOption("22");
  await page.getByRole("textbox", { name: /^Notes$/ }).fill(
    "Partner new customer request"
  );
  await page.getByRole("button", { name: "Submit Partner Request" }).click();

  await expect(page.getByText("Partner request submitted.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Request" })).toHaveAttribute(
    "href",
    "/partner/subscription-requests/811"
  );

  expect(submittedPayloads).toHaveLength(1);
  expect(submittedPayloads[0]).toMatchObject({
    requested_customer_name: "New Snapshot Customer",
    requested_customer_phone: "01733333333",
    requested_customer_email: "snapshot@example.com",
    product_id: 61,
    batch_id: 71,
    preferred_lucky_number: 22,
  });
});
