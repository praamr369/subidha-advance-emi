import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const payload = {
  role: "admin",
  read_only: true,
  summary: {
    due_today_count: 2,
    overdue_count: 1,
    pending_emi_count: 3,
    pending_emi_amount: "3000.00",
    direct_sale_outstanding_count: 1,
    direct_sale_outstanding_amount: "4500.00",
    rent_lease_due_count: 1,
    rent_lease_due_amount: "900.00",
    blocked_finance_account_count: 1,
    ready_finance_account_count: 2,
    pending_receipt_count: null,
    unreconciled_collection_count: null,
  },
  finance_account_readiness: {
    counts: {
      active_count: 3,
      ready_count: 2,
      blocked_count: 1,
      cash_ready_count: 1,
      bank_ready_count: 1,
      upi_ready_count: 0,
    },
    accounts: [
      {
        id: 1,
        name: "Main Cash Desk",
        kind: "CASH",
        branch_id: 1,
        branch_name: "Main Branch",
        mapped_chart_account: {
          id: 11,
          code: "CASH-001",
          name: "Cash in Hand",
          account_type: "ASSET",
          is_active: true,
          allow_manual_posting: true,
        },
        collection_ready: true,
        collection_blocker_reason: null,
        recommended_action: null,
      },
      {
        id: 2,
        name: "Blocked Cash Desk",
        kind: "CASH",
        branch_id: 1,
        branch_name: "Main Branch",
        mapped_chart_account: {
          id: 12,
          code: "CASH-GROUP",
          name: "Cash Group",
          account_type: "ASSET",
          is_active: true,
          allow_manual_posting: false,
        },
        collection_ready: false,
        collection_blocker_reason: "Mapped chart account is a group/control account, not a posting account.",
        recommended_action: "Choose a posting-enabled leaf ASSET chart account in Accounting Setup.",
      },
    ],
  },
  collection_lanes: [
    { key: "advance_emi", label: "Advance EMI collection", enabled: true, route: "/admin/finance/collect?workflow=advance-emi", description: "Existing EMI endpoint." },
    { key: "direct_sale", label: "Direct-sale collection", enabled: true, route: "/admin/finance/collect?workflow=direct-sale", description: "Existing direct-sale endpoint." },
    { key: "rent_lease", label: "Rent/lease collection", enabled: false, route: null, description: "Deferred until endpoint is confirmed." },
  ],
  route_hints: {
    collection_center: "/admin/collections/control-center",
    advance_emi_collect: "/admin/finance/collect?workflow=advance-emi",
    direct_sale_collect: "/admin/finance/collect?workflow=direct-sale",
    payment_history: "/admin/payments",
    accounting_setup: "/admin/accounting/setup",
  },
  recent_collections: [
    {
      id: 99,
      payment_date: "2026-05-28",
      amount: "1000.00",
      method: "CASH",
      reference_no: "RCPT-99",
      customer_name: "Test Customer",
      subscription_id: 10,
      subscription_number: "SUB-10",
      emi_id: 501,
      emi_month_no: 1,
      finance_account_name: "Main Cash Desk",
    },
  ],
};

async function mockAdmin(page: Page) {
  await page.route("**/api/v1/admin/collections/control-center/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

async function mockCashier(page: Page) {
  const cashierPayload = {
    ...payload,
    role: "cashier",
    route_hints: {
      collection_center: "/cashier/collections/control-center",
      advance_emi_collect: "/cashier/collect",
      direct_sale_collect: "/cashier/collect?workflow=direct-sale",
      payment_history: "/cashier/payments",
      accounting_setup: null,
    },
    collection_lanes: payload.collection_lanes.map((lane) => ({
      ...lane,
      route: lane.key === "advance_emi" ? "/cashier/collect" : lane.key === "direct_sale" ? "/cashier/collect?workflow=direct-sale" : null,
    })),
  };
  await page.route("**/api/v1/cashier/collections/control-center/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cashierPayload) });
  });
}

test.describe("admin collection control center", () => {
  test.use({ storageState: authStatePath("admin") });

  test("shows readiness banner, blocked account, lanes, and no fake rent lease action", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin/collections/control-center");

    await expect(page.getByRole("heading", { name: "Collection Control Center" })).toBeVisible();
    await expect(page.getByText("Finance account blockers need attention")).toBeVisible();
    await expect(page.getByText("Blocked Cash Desk")).toBeVisible();
    await expect(page.getByText("Mapped chart account is a group/control account")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Accounting Setup" })).toHaveAttribute("href", "/admin/accounting/setup");
    await expect(page.getByText("Direct-sale collection")).toBeVisible();
    await expect(page.getByText("Rent/lease collection")).toBeVisible();
    await expect(page.getByText("Deferred — endpoint not exposed for collection action yet.")).toBeVisible();
    await expect(page.getByText("Not exposed").first()).toBeVisible();
  });
});

test.describe("cashier collection control center", () => {
  test.use({ storageState: authStatePath("cashier") });

  test("shows cashier-safe readiness without accounting setup edit action", async ({ page }) => {
    await mockCashier(page);
    await page.goto("/cashier/collections/control-center");

    await expect(page.getByRole("heading", { name: "Cashier Collection Control Center" })).toBeVisible();
    await expect(page.getByText("Ask admin to fix accounting setup")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Accounting Setup" })).toHaveCount(0);
    await expect(page.getByText("Blocked Cash Desk")).toBeVisible();
  });
});
