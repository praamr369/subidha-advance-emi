import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const operationalAccounts = [
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
    operational_collection_account: true,
    diagnostic_only: false,
    system_posting_profile: false,
    collection_ready: true,
    selectable_for_collection: true,
    is_selectable_collection_account: true,
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
    operational_collection_account: true,
    diagnostic_only: false,
    system_posting_profile: false,
    collection_ready: false,
    selectable_for_collection: false,
    is_selectable_collection_account: false,
    collection_blocker_reason: "Mapped chart account is a group/control account, not a posting account.",
    recommended_action: "Choose a posting-enabled leaf ASSET chart account in Accounting Setup.",
  },
];

const diagnosticAccounts = [
  {
    id: 99,
    name: "Ledger posting profiles (system)",
    kind: "SYSTEM",
    branch_id: null,
    branch_name: null,
    mapped_chart_account: {
      id: 19,
      code: "SYS-POST",
      name: "System Posting Ledger",
      account_type: "ASSET",
      is_active: true,
      allow_manual_posting: true,
    },
    operational_collection_account: false,
    diagnostic_only: true,
    system_posting_profile: true,
    collection_ready: false,
    selectable_for_collection: false,
    is_selectable_collection_account: false,
    collection_blocker_reason: "System posting profile diagnostic only; not a customer collection destination.",
    recommended_action: "Review this row in System Posting Profiles, not in customer collection selectors.",
  },
];

const payload = {
  role: "admin",
  read_only: true,
  not_exposed_label: "Not exposed",
  summary: {
    due_today_count: 2,
    overdue_count: 1,
    pending_emi_count: 3,
    pending_emi_amount: "3000.00",
    direct_sale_outstanding_count: 1,
    direct_sale_outstanding_amount: "4500.00",
    rent_lease_due_count: null,
    rent_lease_due_amount: null,
    blocked_finance_account_count: 1,
    ready_finance_account_count: 2,
    pending_receipt_count: null,
    unreconciled_collection_count: null,
  },
  finance_account_readiness: {
    counts: {
      active_count: 3,
      ready_count: 1,
      blocked_count: 1,
      cash_ready_count: 1,
      bank_ready_count: 0,
      upi_ready_count: 0,
      diagnostic_count: 1,
      selectable_count: 1,
    },
    accounts: operationalAccounts,
    operational_collection_accounts: operationalAccounts,
    diagnostic_system_accounts: diagnosticAccounts,
  },
  collection_lanes: [
    { key: "advance_emi", label: "Advance EMI collection", enabled: true, route: "/admin/finance/collect?workflow=advance-emi", description: "Existing EMI endpoint." },
    { key: "direct_sale", label: "Direct-sale collection", enabled: true, route: "/admin/finance/collect?workflow=direct-sale", description: "Existing direct-sale endpoint." },
    { key: "rent_lease", label: "rentlease collection", enabled: false, route: null, description: "Deferred until endpoint is confirmed." },
    { key: "customer_advance", label: "Customer advance", enabled: true, route: "/admin/finance/collect?workflow=advance-emi", description: "Existing advance collection path." },
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

async function mockCollectionPageDependencies(page: Page) {
  await page.route("**/api/v1/admin/branches/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) });
  });
  await page.route("**/api/v1/admin/cash-counters/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) });
  });
  await page.route("**/api/v1/admin/accounting/finance-accounts/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) });
  });
  await page.route("**/api/v1/cashier/finance-accounts/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) });
  });
}

test.describe("admin collection control center", () => {
  test.use({ storageState: authStatePath("admin") });

  test("shows operational accounts, diagnostic profiles, deferred rent lease, and blockers", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin/collections/control-center");

    await expect(page.getByRole("heading", { name: "Collection Control Center" })).toBeVisible();
    await expect(page.getByText("Finance account blockers need attention")).toBeVisible();
    await expect(page.getByText("Operational collection accounts")).toBeVisible();
    await expect(page.getByText("Diagnostic system posting profiles")).toBeVisible();
    await expect(page.getByText("Blocked Cash Desk")).toBeVisible();
    await expect(page.getByText("Mapped chart account is a group/control account")).toBeVisible();
    await expect(page.getByText("Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account.").first()).toBeVisible();
    await expect(page.getByText("Ledger posting profiles (system)")).toBeVisible();
    await expect(page.getByText("System posting profile diagnostic only; not a customer collection destination.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Accounting Setup" })).toHaveAttribute("href", "/admin/accounting/setup");
    await expect(page.getByRole("heading", { name: "Advance EMI collection" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Direct-sale collection" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Customer advance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rent / Lease collection" })).toBeVisible();
    await expect(page.getByText("Deferred — backend collection endpoint is not enabled yet.")).toBeVisible();
    await expect(page.getByText("Rent/lease collection")).toHaveCount(0);
    await expect(page.getByText("Rent / lease due")).toBeVisible();
    await expect(page.getByText("Not exposed")).toBeVisible();
    await expect(page.getByRole("link", { name: /Collect rent/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Collect rent/i })).toHaveCount(0);
  });

  test("shows compact inline readiness inside admin collection page without fake rent lease action", async ({ page }) => {
    await mockAdmin(page);
    await mockCollectionPageDependencies(page);

    await page.goto("/admin/finance/collect?workflow=advance-emi");

    await expect(page.getByRole("region", { name: "Collection readiness" })).toBeVisible();
    await expect(page.getByText("Advance EMI collection readiness")).toBeVisible();
    await expect(page.getByText("Blocked Cash Desk")).toBeVisible();
    await expect(page.getByText("Mapped chart account is a group/control account")).toBeVisible();
    await expect(page.getByText("Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Accounting setup", exact: true })).toHaveAttribute("href", "/admin/accounting/setup");
    await expect(page.getByText("Receipt posture: Not exposed · Reconciliation posture: Not exposed")).toBeVisible();
    await expect(page.getByRole("link", { name: /Collect rent/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Collect rent/i })).toHaveCount(0);
  });

  test("shows direct-sale inline readiness without fake rent lease zero", async ({ page }) => {
    await mockAdmin(page);
    await mockCollectionPageDependencies(page);

    await page.goto("/admin/finance/collect?workflow=direct-sale");

    await expect(page.getByRole("region", { name: "Collection readiness" })).toBeVisible();
    await expect(page.getByText("Direct sale due")).toBeVisible();
    await expect(page.getByText("Rent / lease due")).toBeVisible();
    await expect(page.getByText("Not exposed")).toBeVisible();
    await expect(page.getByText("Rent/lease due")).toHaveCount(0);
    await expect(page.getByText("₹0.00")).toHaveCount(0);
    await expect(page.getByText("Finance account blocker guidance")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open control center" })).toHaveAttribute("href", "/admin/collections/control-center");
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
    await expect(page.getByText("Ledger posting profiles (system)")).toBeVisible();
  });

  test("shows compact inline readiness inside cashier collection page without accounting setup edit action", async ({ page }) => {
    await mockCashier(page);
    await mockCollectionPageDependencies(page);

    await page.goto("/cashier/collect");

    await expect(page.getByRole("region", { name: "Collection readiness" })).toBeVisible();
    await expect(page.getByText("Advance EMI collection readiness")).toBeVisible();
    await expect(page.getByText("Blocked Cash Desk")).toBeVisible();
    await expect(page.getByText("Ask admin to fix accounting setup.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Accounting setup" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Collect rent/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Collect rent/i })).toHaveCount(0);
  });
});
