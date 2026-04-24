import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("customer") });

test("customer dashboard, subscription requests, subscriptions, and payments routes load with live nav only", async ({
  page,
}) => {
  await page.goto("/customer");
  await expect(
    page.getByRole("heading", { name: "Customer Workspace" })
  ).toBeVisible();
  await expect(page.locator('a[href="/customer/emis"]')).toHaveCount(0);

  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Plan Requests", exact: true })
    .click();
  await expect(page).toHaveURL(/\/customer\/subscription-requests$/);
  await expect(
    page
      .getByRole("heading", { name: "Subscription Requests", exact: true })
      .last()
  ).toBeVisible();

  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Subscriptions", exact: true })
    .click();
  await expect(page).toHaveURL(/\/customer\/subscriptions$/);
  await expect(
    page.getByRole("heading", { name: "My Subscriptions" })
  ).toBeVisible();

  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Payments", exact: true })
    .click();
  await expect(page).toHaveURL(/\/customer\/payments$/);
  await expect(page.getByRole("heading", { name: "My Payments" })).toBeVisible();
});

test("customer payment receipt is self-scoped", async ({ page }) => {
  const manifest = readSmokeManifest();

  await page.goto(`/customer/payments/${manifest.entities.customer.own_payment_id}`);
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`Payment Receipt #${manifest.entities.customer.own_payment_id}`),
    })
  ).toBeVisible();

  await page.goto(
    `/customer/payments/${manifest.entities.customer.other_payment_id}`
  );
  await expect(
    page.getByText("Unable to load payment receipt")
  ).toBeVisible();
});

test("customer dashboard renders canonical financial grouping", async ({ page }) => {
  await page.route("**/api/v1/customer/dashboard/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        customer: {
          id: 31,
          name: "Customer One",
          phone: "01700000000",
          kyc_status: "VERIFIED",
        },
        summary: {
          subscription_count: 2,
          active_subscriptions: 1,
          completed_subscriptions: 0,
          winner_subscriptions: 1,
          pending_emis: 3,
          upcoming_emis: 2,
          overdue_emis: 1,
          paid_emis: 4,
          waived_emis: 2,
          total_paid_amount: "4000.00",
          total_pending_amount: "3000.00",
          total_waived_amount: "2000.00",
          remaining_amount: "3000.00",
          outstanding_amount: "3000.00",
          overdue_amount: "1000.00",
          upcoming_amount: "2000.00",
          next_due_amount: "1000.00",
          next_due_date: "2026-04-15",
          next_due_is_overdue: true,
          next_due_subscription_id: 901,
          next_due_subscription_number: "SUB-901",
          next_due_product_name: "Aurora Sofa",
          next_due_lucky_number: 8,
          has_payment_adjustments: true,
        },
        subscriptions: [
          {
            id: 901,
            subscription_number: "SUB-901",
            status: "ACTIVE",
            plan_type: "EMI",
            total_amount: "3000.00",
            monthly_amount: "1000.00",
            tenure_months: 3,
            product_name: "Aurora Sofa",
            product_code: "AUR-901",
            product_image: null,
            batch_code: "BATCH-901",
            lucky_number: 8,
            emi_count: 3,
            paid_emi_count: 1,
            pending_emi_count: 2,
            waived_emi_count: 0,
            total_paid_amount: "1000.00",
            outstanding_amount: "2000.00",
            next_due_date: "2026-04-15",
            winner_status: "NOT_WON",
            financial_summary: {
              emi_total: "3000.00",
              paid_amount: "1000.00",
              waived_amount: "0.00",
              pending_amount: "2000.00",
              remaining_amount: "2000.00",
              outstanding_amount: "2000.00",
            },
            winner_summary: {
              winner_status: "NOT_WON",
              winner_month: null,
              lucky_id: 301,
              lucky_number: 8,
              draw_id: null,
              draw_month: null,
              draw_revealed_at: null,
              waiver_scope: null,
              waived_emi_count: 0,
              waived_amount: "0.00",
            },
          },
          {
            id: 902,
            subscription_number: "SUB-902",
            status: "WON",
            plan_type: "EMI",
            total_amount: "3000.00",
            monthly_amount: "1000.00",
            tenure_months: 3,
            product_name: "Winner Sofa",
            product_code: "WIN-902",
            product_image: null,
            batch_code: "BATCH-902",
            lucky_number: 9,
            emi_count: 3,
            paid_emi_count: 0,
            pending_emi_count: 1,
            waived_emi_count: 2,
            total_paid_amount: "0.00",
            outstanding_amount: "1000.00",
            next_due_date: "2026-04-18",
            winner_status: "WON",
            financial_summary: {
              emi_total: "3000.00",
              paid_amount: "0.00",
              waived_amount: "2000.00",
              pending_amount: "1000.00",
              remaining_amount: "1000.00",
              outstanding_amount: "1000.00",
            },
            winner_summary: {
              winner_status: "WON",
              winner_month: 1,
              lucky_id: 302,
              lucky_number: 9,
              draw_id: 41,
              draw_month: 1,
              draw_revealed_at: "2026-04-01T09:00:00Z",
              waiver_scope: "FUTURE_EMI_ONLY",
              waived_emi_count: 2,
              waived_amount: "2000.00",
            },
          },
        ],
      }),
    });
  });

  await page.goto("/customer");
  await expect(
    page.getByRole("heading", { name: "Customer Workspace" })
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("Financial alignment");
  await expect(page.locator("body")).toContainText("Overdue EMI");
  await expect(page.locator("body")).toContainText("Upcoming EMI");
  await expect(page.locator("body")).toContainText("Waived by benefit");
  await expect(page.locator("body")).toContainText("Settled totals already reflect any reversal history.");
  await expect(page.locator("body")).toContainText("Aurora Sofa");
  await expect(page.locator("body")).toContainText("Winner Sofa");
});

test("customer legacy emis route redirects to subscriptions", async ({ page }) => {
  await page.goto("/customer/emis");
  await expect(page).toHaveURL(/\/customer\/subscriptions$/);
});

test("customer completed winner detail separates contract and winner history", async ({
  page,
}) => {
  await page.route("**/api/v1/customer/subscriptions/951/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 951,
        subscription_number: "SUB-951",
        status: "COMPLETED",
        start_date: "2026-03-01",
        plan_type: "EMI",
        total_amount: "3000.00",
        monthly_amount: "1000.00",
        tenure_months: 3,
        product: 11,
        batch: 21,
        lucky_id: 31,
        product_name: "Winner Product",
        product_code: "WIN-PROD-951",
        product_image: null,
        batch_code: "WIN-BATCH-951",
        lucky_number: 8,
        emi_count: 3,
        paid_emi_count: 1,
        pending_emi_count: 0,
        waived_emi_count: 2,
        total_paid_amount: "1000.00",
        outstanding_amount: "0.00",
        winner_status: "WON",
        winner_month: 1,
        waived_amount: "2000.00",
        delivery_status: null,
        fulfillment_status: null,
        created_at: "2026-03-01T06:00:00Z",
        financial_summary: {
          emi_total: "3000.00",
          paid_amount: "1000.00",
          waived_amount: "2000.00",
          outstanding_amount: "0.00",
        },
        winner_summary: {
          winner_status: "WON",
          winner_month: 1,
          lucky_id: 31,
          lucky_number: 8,
          draw_id: 19,
          draw_month: 1,
          draw_revealed_at: "2026-03-05T09:00:00Z",
          waiver_scope: "FUTURE_EMI_ONLY",
          waived_emi_count: 2,
          waived_amount: "2000.00",
        },
        delivery_summary: null,
        deliveries: [],
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
          {
            id: 3,
            month_no: 3,
            due_date: "2026-05-10",
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

  await page.goto("/customer/subscriptions/951");
  await expect(
    page.getByRole("heading", { name: "Subscription Details" })
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("Product module");
  await expect(page.locator("body")).toContainText("WIN-PROD-951");
  await expect(page.locator("body")).toContainText("Lucky number");
  await expect(page.locator("body")).toContainText("#8");
  await expect(page.locator("body")).toContainText("Contract, winner, and waiver state");
  await expect(page.locator("body")).toContainText("Contract fully settled");
  await expect(page.locator("body")).toContainText("Winner benefit recorded");
  await expect(page.locator("body")).toContainText("Waiver settled the remaining exposure");
  await expect(page.locator("body")).toContainText("Winner history stays separate from contract status");
});

test("customer unsettled winner detail keeps winner history while contract is still settling", async ({
  page,
}) => {
  await page.route("**/api/v1/customer/subscriptions/952/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 952,
        subscription_number: "SUB-952",
        status: "WON",
        start_date: "2026-03-01",
        plan_type: "EMI",
        total_amount: "3000.00",
        monthly_amount: "1000.00",
        tenure_months: 3,
        product: 11,
        batch: 21,
        lucky_id: 32,
        product_name: "Winner Product",
        product_code: "WIN-PROD-952",
        product_image: null,
        batch_code: "WIN-BATCH-952",
        lucky_number: 9,
        emi_count: 3,
        paid_emi_count: 0,
        pending_emi_count: 1,
        waived_emi_count: 2,
        total_paid_amount: "0.00",
        outstanding_amount: "1000.00",
        winner_status: "WON",
        winner_month: 1,
        waived_amount: "2000.00",
        delivery_status: null,
        fulfillment_status: null,
        created_at: "2026-03-01T06:00:00Z",
        financial_summary: {
          emi_total: "3000.00",
          paid_amount: "0.00",
          waived_amount: "2000.00",
          outstanding_amount: "1000.00",
        },
        winner_summary: {
          winner_status: "WON",
          winner_month: 1,
          lucky_id: 32,
          lucky_number: 9,
          draw_id: 20,
          draw_month: 1,
          draw_revealed_at: "2026-03-05T09:00:00Z",
          waiver_scope: "FUTURE_EMI_ONLY",
          waived_emi_count: 2,
          waived_amount: "2000.00",
        },
        delivery_summary: null,
        deliveries: [],
        emis: [
          {
            id: 1,
            month_no: 1,
            due_date: "2026-03-10",
            amount: "1000.00",
            paid_amount: "0.00",
            waived_amount: "0.00",
            outstanding_amount: "1000.00",
            status: "PENDING",
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
          {
            id: 3,
            month_no: 3,
            due_date: "2026-05-10",
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

  await page.goto("/customer/subscriptions/952");
  await expect(page.locator("body")).toContainText("Contract still settling");
  await expect(page.locator("body")).toContainText("Winner benefit recorded");
  await expect(page.locator("body")).toContainText("Waiver applied to future EMI rows");
  await expect(page.locator("body")).toContainText("Still settling");
});

test("customer can submit a subscription request from the create form", async ({
  page,
}) => {
  await page.route("**/api/v1/customer/subscription-request-options/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: [
          {
            id: 41,
            name: "Request Product",
            product_code: "REQ-041",
            base_price: "12000.00",
            image: null,
          },
        ],
        batches: [
          {
            id: 51,
            batch_code: "REQ-BATCH-51",
            duration_months: 12,
            available_slots: 22,
            start_date: "2026-04-01",
            status: "OPEN",
          },
        ],
        lucky_numbers: [11, 12, 13],
      }),
    });
  });

  await page.route("**/api/v1/customer/subscription-requests/", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Subscription request submitted successfully.",
        request: {
          id: 701,
          requester_role_snapshot: "CUSTOMER",
          customer_id: 31,
          customer_name: "Customer One",
          customer_phone: "01711111111",
          customer_email: "customer@example.com",
          requested_customer_name: "Customer One",
          requested_customer_phone: "01711111111",
          requested_customer_email: "customer@example.com",
          requested_customer_address: "Address",
          requested_customer_city: "Dhaka",
          product_id: 41,
          product_name: "Request Product",
          product_code: "REQ-041",
          product_image: null,
          batch_id: 51,
          batch_code: "REQ-BATCH-51",
          preferred_lucky_number: 12,
          requested_tenure_months_snapshot: 12,
          notes: "Customer request note",
          status: "SUBMITTED",
          approved_subscription_id: null,
          approved_subscription_number: null,
          created_at: "2026-04-07T10:00:00Z",
          updated_at: "2026-04-07T10:00:00Z",
        },
      }),
    });
  });

  await page.goto("/customer/subscription-requests/create");
  await expect(
    page.getByRole("heading", { name: "Create Subscription Request" })
  ).toBeVisible();
  await expect(page.locator("aside").getByText("Select a product")).toBeVisible();

  await page.getByRole("combobox", { name: /^Product$/ }).selectOption("41");
  await expect(
    page.locator("aside").getByText("Product media pending")
  ).toBeVisible();
  await page.getByRole("combobox", { name: /^Batch$/ }).selectOption("51");
  await page
    .getByRole("combobox", { name: /^Lucky number$/ })
    .selectOption("12");
  await page.getByRole("textbox", { name: /^Notes$/ }).fill(
    "Customer request note"
  );
  await page.getByRole("button", { name: "Submit Request" }).click();

  await expect(page.getByText("Subscription request submitted.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Request" })).toHaveAttribute(
    "href",
    "/customer/subscription-requests/701"
  );
});

test("customer delivery detail renders stable shipment timeline fixture", async ({
  page,
}) => {
  await page.route("**/api/v1/customer/deliveries/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        summary: {
          total: 1,
          pending: 0,
          scheduled: 0,
          in_transit: 0,
          dispatched: 0,
          out_for_delivery: 0,
          delivered: 1,
          failed: 0,
          cancelled: 0,
          return_requested: 0,
          returned: 0,
        },
        results: [
          {
            id: 781,
            subscription_id: 901,
            subscription_number: "SUB-901",
            product_name: "Aurora Sofa",
            batch_code: "BATCH-901",
            lucky_number: 8,
            status: "DELIVERED",
            fulfillment_status: "DELIVERED",
            delivery_reference: "DLV-781",
            scheduled_date: "2026-04-18",
            dispatched_at: "2026-04-18T06:20:00Z",
            out_for_delivery_at: "2026-04-18T07:45:00Z",
            delivered_at: "2026-04-18T09:10:00Z",
            created_at: "2026-04-17T08:00:00Z",
            updated_at: "2026-04-18T09:10:00Z",
          },
        ],
      }),
    });
  });

  await page.route("**/api/v1/customer/deliveries/781/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 781,
        subscription_id: 901,
        subscription_number: "SUB-901",
        product_name: "Aurora Sofa",
        batch_code: "BATCH-901",
        lucky_number: 8,
        status: "DELIVERED",
        fulfillment_status: "DELIVERED",
        delivery_reference: "DLV-781",
        scheduled_date: "2026-04-18",
        dispatched_at: "2026-04-18T06:20:00Z",
        out_for_delivery_at: "2026-04-18T07:45:00Z",
        delivered_at: "2026-04-18T09:10:00Z",
        receiver_name: "Customer One",
        receiver_phone: "01700000000",
        delivery_address_snapshot: "House 12, Road 7, Dhaka",
        notes: "Delivered at gate with OTP confirmation.",
        history_count: 4,
        created_by_username: "dispatcher",
        updated_by_username: "dispatcher",
        created_at: "2026-04-17T08:00:00Z",
        updated_at: "2026-04-18T09:10:00Z",
      }),
    });
  });

  await page.goto("/customer/deliveries");
  await expect(page.getByRole("heading", { name: "Delivery Tracking" })).toBeVisible();
  await page.getByRole("link", { name: "View detail" }).click();
  await expect(page).toHaveURL(/\/customer\/deliveries\/781$/);
  await expect(page.getByRole("heading", { name: "DLV-781" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Delivery event timeline");
  await expect(page.locator("body")).toContainText("Customer One");
  await expect(page.locator("body")).toContainText("Delivered");
});
