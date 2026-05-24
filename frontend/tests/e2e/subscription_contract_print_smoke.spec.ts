import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const subscriptionFixture = {
  id: 801,
  subscription_number: "SUB-PRINT-801",
  customer: 501,
  customer_id: 501,
  customer_name: "Lucky Contract Customer",
  customer_phone: "9000000801",
  product: 301,
  product_id: 301,
  product_name: "Subidha Lucky Sofa",
  product_code: "LUCKY-SOFA-01",
  product_base_price: "15000.00",
  batch: 91,
  batch_id: 91,
  batch_code: "BATCH-MAY-2026",
  batch_status: "OPEN",
  lucky_id: 36,
  lucky_number: 7,
  plan_type: "EMI",
  tenure_months: 15,
  start_date: "2026-05-24",
  total_amount: "15000.00",
  monthly_amount: "1000.00",
  status: "ACTIVE",
  winner_month: null,
  winner_status: "NOT_WON",
  waived_amount: "0.00",
  fulfillment_status: "PENDING",
  delivery_status: null,
  created_at: "2026-05-24T09:00:00+05:30",
  emi_count: 15,
  paid_emi_count: 2,
  pending_emi_count: 13,
  waived_emi_count: 0,
  financial_summary: {
    subscription_id: 801,
    total_amount: "15000.00",
    total_emi_amount: "15000.00",
    emi_total: "15000.00",
    paid_amount: "2000.00",
    waived_amount: "0.00",
    stored_waived_amount: "0.00",
    waiver_ledger_amount: "0.00",
    reversed_amount: "0.00",
    pending_amount: "13000.00",
    remaining_amount: "13000.00",
    outstanding_amount: "13000.00",
    emi_count_total: 15,
    emi_count_paid: 2,
    emi_count_waived: 0,
    emi_count_pending: 13,
    winner_status: "NOT_WON",
    winner_month: null,
    lucky_id: 36,
    lucky_number: 7,
    batch: {
      id: 91,
      batch_code: "BATCH-MAY-2026",
      status: "OPEN",
    },
    partner: {
      id: null,
      username: null,
      phone: null,
      commission_rate: "0.00",
    },
  },
  reconciliation_flags: {
    is_financially_consistent: true,
    pending_matches_remaining: true,
    has_reversal_history: false,
    has_waiver_history: false,
    warnings: [],
  },
  winner_summary: {
    winner_status: "NOT_WON",
    winner_month: null,
    lucky_id: 36,
    lucky_number: 7,
    draw_id: null,
    draw_month: null,
    draw_revealed_at: null,
    waiver_scope: null,
    waived_emi_count: 0,
    waived_amount: "0.00",
  },
  delivery_summary: null,
  deliveries: [],
  documents: [],
  emis: [
    {
      id: 1,
      month_no: 1,
      due_date: "2026-05-24",
      amount: "1000.00",
      status: "PAID",
      derived_status: "PAID",
      paid_amount: "1000.00",
      total_paid: "1000.00",
      reversed_amount: "0.00",
      waived_amount: "0.00",
      waiver_ledger_amount: "0.00",
      balance_amount: "0.00",
      is_overdue: false,
      is_status_consistent: true,
      warnings: [],
    },
    {
      id: 2,
      month_no: 2,
      due_date: "2026-06-24",
      amount: "1000.00",
      status: "PAID",
      derived_status: "PAID",
      paid_amount: "1000.00",
      total_paid: "1000.00",
      reversed_amount: "0.00",
      waived_amount: "0.00",
      waiver_ledger_amount: "0.00",
      balance_amount: "0.00",
      is_overdue: false,
      is_status_consistent: true,
      warnings: [],
    },
    {
      id: 3,
      month_no: 3,
      due_date: "2026-07-24",
      amount: "1000.00",
      status: "PENDING",
      derived_status: "PENDING",
      paid_amount: "0.00",
      total_paid: "0.00",
      reversed_amount: "0.00",
      waived_amount: "0.00",
      waiver_ledger_amount: "0.00",
      balance_amount: "1000.00",
      is_overdue: false,
      is_status_consistent: true,
      warnings: [],
    },
  ],
};

const customerFixture = {
  id: 501,
  name: "Lucky Contract Customer",
  phone: "9000000801",
  email: "lucky.contract@example.com",
  address: "Court More, GT Road",
  city: "Asansol",
};

const emptyPage = { count: 0, next: null, previous: null, results: [] };

async function mockSubscriptionContractApis(page: Parameters<typeof test>[0]["page"]) {
  await page.route("**/admin/subscriptions/801/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(subscriptionFixture),
    });
  });
  await page.route("**/admin/customers/501/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(customerFixture),
    });
  });
  await page.route("**/admin/subscriptions/801/timeline/", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPage) });
  });
  await page.route("**/admin/payments/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPage) });
  });
}

test("subscription contract print route renders branded Lucky Plan agreement", async ({ page }) => {
  await mockSubscriptionContractApis(page);

  await page.goto("/admin/subscriptions/801/contract/print");

  await expect(page.getByText("Subidha Furniture").first()).toBeVisible();
  await expect(page.getByText("LUCKY PLAN AGREEMENT / SUBSCRIPTION CONTRACT")).toBeVisible();
  await expect(page.getByText("SUB-PRINT-801").first()).toBeVisible();
  await expect(page.getByText("Lucky Contract Customer").first()).toBeVisible();
  await expect(page.getByText("Subidha Lucky Sofa").first()).toBeVisible();
  await expect(page.getByText("LUCKY-SOFA-01").first()).toBeVisible();
  await expect(page.getByText("15 months").first()).toBeVisible();
  await expect(page.getByText("Monthly EMI").first()).toBeVisible();
  await expect(page.getByText("Customer Signature")).toBeVisible();
  await expect(page.getByText("Authorized Signature")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
});

test("subscription detail exposes contract print link", async ({ page }) => {
  await mockSubscriptionContractApis(page);

  await page.goto("/admin/subscriptions/801");

  const contractLink = page.getByRole("link", { name: "Contract PDF / Print" }).first();
  await expect(contractLink).toBeVisible();
  await expect(contractLink).toHaveAttribute("href", "/admin/subscriptions/801/contract/print");
});
