import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const executedPreview = {
  id: 77,
  status: "PREVIEWED",
  impact_type: "UPGRADE_EXTRA_PAYABLE",
  old_product_id: 2001,
  old_product_name: "Old Sofa",
  old_product_code: "SOFA-OLD",
  new_product_id: 2002,
  new_product_name: "New Sofa",
  new_product_code: "SOFA-NEW",
  old_contract_total: "20000.00",
  new_contract_total: "24000.00",
  old_monthly_amount: "2000.00",
  new_monthly_amount: "2400.00",
  price_difference: "4000.00",
  amount_already_paid: "4000.00",
  old_remaining_balance: "16000.00",
  proposed_new_remaining_balance: "20000.00",
  current_tenure_months: 10,
  preview_tenure_months: 10,
  current_monthly_amount: "2000.00",
  proposed_monthly_amount: "2400.00",
  pending_emi_count: 8,
  effective_date_preview: "2026-05-26",
  warnings: [],
  customer_consent_status: "ACCEPTED",
  customer_consented_at: "2026-05-26T13:00:00Z",
  customer_consent_note: "Accepted.",
  admin_approval_status: "APPROVED",
  admin_approved_by: 1,
  admin_approved_at: "2026-05-26T14:00:00Z",
  admin_approval_note: "Approved.",
  admin_approval_snapshot: {},
  source_record_mutation: false,
  schedule_preview_lines: [
    {
      id: 9001,
      event: 77,
      line_no: 1,
      original_emi: 301,
      original_due_date: "2026-03-01",
      original_amount: "2000.00",
      proposed_due_date: "2026-03-01",
      proposed_amount: "2400.00",
      proposed_status: "PREVIEW_ONLY",
      adjustment_type: "EXISTING_PENDING_REPLACEMENT",
      source_record_mutation: false,
      metadata: {},
    },
  ],
  latest_financial_impact_preview: {
    id: 9901,
    event: 77,
    impact_type: "UPGRADE_EXTRA_PAYABLE",
    accounting_preview_status: "PREVIEWED",
    reconciliation_preview_status: "PREVIEWED",
    price_difference: "4000.00",
    additional_receivable_amount: "4000.00",
    credit_or_reduction_amount: "0.00",
    projected_customer_balance: "20000.00",
    projected_future_emi_total: "20000.00",
    journal_preview: { preview_only: false, posting_performed: true },
    reconciliation_preview: { preview_only: false, items_created: true },
    warnings: [],
    blocked_reason: "",
    source_record_mutation: false,
  },
  workflow_flags: {
    previewed: true,
    customer_consented: true,
    admin_approved: true,
    schedule_preview_generated: true,
    financial_impact_previewed: true,
    accounting_posted: true,
    reconciliation_linked: true,
    executed: true,
  },
  executed: true,
  executed_at: "2026-05-26T15:00:00Z",
  executed_by: 1,
  execution_status: "EXECUTED",
  execution_ready: false,
  execution_block_reason: "Product recontract has already been executed.",
  execution_snapshot: {
    before_subscription: { product_id: 2001, total_amount: "20000.00", monthly_amount: "2000.00" },
    after_subscription: { product_id: 2002, total_amount: "24000.00", monthly_amount: "2400.00" },
    product_snapshot_updated: true,
    pricing_snapshot_updated: true,
    preservation_flags: {
      payments_mutated: false,
      receipts_mutated: false,
      accounting_mutated_by_execution: false,
      reconciliation_mutated_by_execution: false,
    },
  },
  accounting_bridge_posting_id: 501,
  journal_entry_id: 502,
  reconciliation_item_id: 503,
  reconciliation_run_id: 504,
  reconciliation_evidence_ids: [601, 602, 603, 604, 605],
  schedule_line_ids: [9001],
};

const amendment = {
  id: 1,
  amendment_no: "AMD-EXECUTED-001",
  contract_type: "EMI_SUBSCRIPTION",
  subscription: 1001,
  subscription_number: "SUB-SMOKE-001",
  rent_lease_contract: null,
  rent_lease_contract_number: null,
  customer: 501,
  customer_name: "Smoke Customer",
  customer_phone: "9000000000",
  partner: null,
  requested_by: 501,
  requested_by_username: "smoke.customer",
  requested_role: "CUSTOMER",
  amendment_type: "PRODUCT_CHANGE",
  status: "APPROVED",
  old_values: { product_id: 2001, product_name: "Old Sofa" },
  requested_values: { approved_product_id: 2002, approved_product_name: "New Sofa" },
  approved_values: { approved_product_id: 2002, approved_product_name: "New Sofa" },
  implemented_values: {},
  previous_values: {},
  new_values: {},
  reason: "Executed recontract read-only smoke.",
  admin_note: "",
  rejection_reason: null,
  financial_impact_amount: null,
  requires_emi_recalculation: true,
  requires_inventory_review: false,
  requires_lucky_id_review: false,
  requires_accounting_review: true,
  requires_rent_lease_review: false,
  effective_date: null,
  approved_by: 1,
  approved_by_username: "smoke.admin",
  approved_at: "2026-05-26T14:00:00Z",
  implemented_by: null,
  implemented_by_username: null,
  implemented_at: null,
  is_implementable: false,
  implementation_block_reason: "Financial product change uses recontract execution evidence and must not use the generic implementation endpoint.",
  implementable_fields: [],
  latest_product_recontract_preview: executedPreview,
  applied_at: null,
  metadata: {},
  created_at: "2026-05-26T10:00:00Z",
  updated_at: "2026-05-26T15:00:00Z",
};

const executedReportRow = {
  id: 77,
  amendment_id: 1,
  amendment_no: "AMD-EXECUTED-001",
  subscription_id: 1001,
  subscription_number: "SUB-SMOKE-001",
  customer_id: 501,
  customer_name: "Smoke Customer",
  customer_phone: "9000000000",
  old_product_id: 2001,
  old_product_name: "Old Sofa",
  old_product_code: "SOFA-OLD",
  new_product_id: 2002,
  new_product_name: "New Sofa",
  new_product_code: "SOFA-NEW",
  old_contract_total: "20000.00",
  new_contract_total: "24000.00",
  price_difference: "4000.00",
  customer_consent_status: "ACCEPTED",
  admin_approval_status: "APPROVED",
  schedule_preview_status: "GENERATED",
  financial_impact_preview_status: "PREVIEWED",
  accounting_posting_status: "POSTED",
  reconciliation_bridge_status: "LINKED",
  executed: true,
  executed_status: "EXECUTED",
  executed_at: "2026-05-26T15:00:00Z",
  accounting_bridge_posting_id: 501,
  journal_entry_id: 502,
  journal_entry_no: "JV-502",
  reconciliation_item_id: 503,
  reconciliation_run_id: 504,
  addendum_print_eligible: true,
  addendum_print_reference: { amendment_id: 1, route: "/admin/contract-amendments/1/recontract-addendum/print" },
  created_at: "2026-05-26T12:00:00Z",
};

const nonExecutedReportRow = {
  ...executedReportRow,
  id: 88,
  amendment_id: 2,
  amendment_no: "AMD-PENDING-002",
  customer_consent_status: "PENDING",
  admin_approval_status: "PENDING",
  schedule_preview_status: "MISSING",
  financial_impact_preview_status: "MISSING",
  accounting_posting_status: "MISSING",
  reconciliation_bridge_status: "MISSING",
  executed: false,
  executed_status: "NOT_EXECUTED",
  executed_at: null,
  accounting_bridge_posting_id: null,
  journal_entry_id: null,
  journal_entry_no: null,
  reconciliation_item_id: null,
  reconciliation_run_id: null,
  addendum_print_eligible: false,
  addendum_print_reference: null,
};

async function mockAmendment(page: Page, role: "admin" | "customer") {
  await page.route(`**/api/v1/${role}/contract-amendments/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && /\/api\/v1\/(admin|customer)\/contract-amendments\/1\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(amendment) });
      return;
    }
    if (request.method() === "GET" && /\/api\/v1\/admin\/contract-amendments\/1\/product-recontract-events\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ ...executedPreview, amendment_id: 1 }]) });
      return;
    }
    if (request.method() === "GET" && /\/api\/v1\/admin\/contract-amendments\/1\/product-recontract\/schedule-preview\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(executedPreview.schedule_preview_lines) });
      return;
    }
    if (request.method() === "GET" && /\/api\/v1\/admin\/contract-amendments\/1\/product-recontract\/financial-impact-preview\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([executedPreview.latest_financial_impact_preview]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 1, results: [amendment] }) });
  });
}

async function mockRecontractReport(page: Page, rows = [executedReportRow, nonExecutedReportRow]) {
  await page.route("**/api/v1/admin/contract-amendments/recontract-report/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });
}

test.describe("admin executed product recontract visibility", () => {
  test.use({ storageState: authStatePath("admin") });

  test("admin detail shows executed evidence and no execution controls", async ({ page }) => {
    await mockAmendment(page, "admin");
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByText("Execution status: EXECUTED")).toBeVisible();
    await expect(page.getByText("Accounting bridge id")).toBeVisible();
    await expect(page.getByText("Journal entry id")).toBeVisible();
    await expect(page.getByText("Reconciliation item id")).toBeVisible();
    await expect(page.getByText("Reconciliation run id")).toBeVisible();
    await expect(page.getByRole("button", { name: "Execute approved recontract" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Apply product change|Update contract|Recalculate EMI now/i })).toHaveCount(0);
  });

  test("admin report shows evidence rows, KPIs, gated print link, and navigation", async ({ page }) => {
    await mockRecontractReport(page);
    await page.goto("/admin/contract-amendments/recontract-report");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "Product Recontract Report" })).toBeVisible();
    await expect(main.getByText("Total previews")).toBeVisible();
    await expect(main.getByText("Customer accepted")).toBeVisible();
    await expect(main.getByText("Admin approved")).toBeVisible();
    await expect(main.getByText("Accounting posted")).toBeVisible();
    await expect(main.getByText("Reconciliation linked")).toBeVisible();
    await expect(main.getByText("Blockers")).toBeVisible();
    await expect(main.getByText("AMD-EXECUTED-001")).toBeVisible();
    await expect(main.getByText("AMD-PENDING-002")).toBeVisible();
    await expect(main.getByText("Generated", { exact: true })).toBeVisible();
    await expect(main.getByText("Previewed", { exact: true })).toBeVisible();
    await expect(main.getByText("Posted", { exact: true })).toBeVisible();
    await expect(main.getByText("Linked", { exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "Print addendum" })).toHaveCount(1);
    await expect(main.getByRole("link", { name: "Print addendum" })).toHaveAttribute(
      "href",
      "/admin/contract-amendments/1/recontract-addendum/print",
    );
    await expect(main.getByText("Not available yet")).toBeVisible();
    await expect(main.getByRole("link", { name: "AMD-EXECUTED-001" })).toHaveAttribute("href", "/admin/contract-amendments/1");
    await expect(main.getByRole("button", { name: /Execute|Post|Reconcile|Rollback|Reverse/i })).toHaveCount(0);
    await expect(main.getByRole("link", { name: /Execute approved recontract|Post journal|Reconcile now|Rollback|Reverse/i })).toHaveCount(0);

    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("link", { name: "Product Recontract Report", exact: true }).first()).toBeVisible();
  });

  test("admin report renders empty, filtered empty, and error states", async ({ page }) => {
    await mockRecontractReport(page, []);
    await page.goto("/admin/contract-amendments/recontract-report");
    await expect(page.getByText("No product recontract previews found")).toBeVisible();

    await page.goto("/admin/contract-amendments/recontract-report?executed=false");
    await expect(page.getByText("No recontract rows match these filters")).toBeVisible();

    await page.unroute("**/api/v1/admin/contract-amendments/recontract-report/**");
    await page.route("**/api/v1/admin/contract-amendments/recontract-report/**", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Report unavailable" }) });
    });
    await page.goto("/admin/contract-amendments/recontract-report");
    await expect(page.getByText("Unable to load recontract report")).toBeVisible();
  });
});

test.describe("customer executed product recontract visibility", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer detail shows read-only executed summary only", async ({ page }) => {
    await mockAmendment(page, "customer");
    await page.goto("/customer/contract-amendments/1");

    await expect(page.getByText("Product recontract executed")).toBeVisible();
    await expect(page.getByText("This recontract updated future contract terms after approval. Previous payments and receipts remain unchanged.")).toBeVisible();
    await expect(page.getByText("EXECUTED", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Product recontract preview consent")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Execute approved recontract" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Apply product change|Update contract|Recalculate EMI now/i })).toHaveCount(0);
  });

  test("customer cannot access the admin report route or navigation link", async ({ page }) => {
    await page.goto("/admin/contract-amendments/recontract-report");
    await expect(page).toHaveURL(/\/unauthorized/);
    await expect(page.getByRole("link", { name: "Product Recontract Report", exact: true })).toHaveCount(0);
  });
});

test.describe("partner product recontract report visibility", () => {
  test.use({ storageState: authStatePath("partner") });

  test("partner cannot access the admin report route or navigation link", async ({ page }) => {
    await page.goto("/admin/contract-amendments/recontract-report");
    await expect(page).toHaveURL(/\/unauthorized/);
    await expect(page.getByRole("link", { name: "Product Recontract Report", exact: true })).toHaveCount(0);
  });
});
