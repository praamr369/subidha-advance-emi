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
  new_remaining_balance: "20000.00",
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
  admin_approved_by_display: "smoke.admin",
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
      original_due_date: "2026-06-01",
      original_amount: "2000.00",
      proposed_due_date: "2026-06-05",
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
    journal_preview: {
      preview_only: false,
      posting_performed: true,
      lines: [
        { line_no: 1, entry_side: "DR", label: "Customer Receivable / Contract Receivable", amount: "4000.00" },
        { line_no: 2, entry_side: "CR", label: "Product Recontract Revenue Bridge", amount: "4000.00" },
      ],
    },
    reconciliation_preview: { preview_only: false, variance_amount: "0.00", items_created: true },
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
    before_subscription: { product_id: 2001, total_amount: "20000.00", monthly_amount: "2000.00", tenure_months: 10 },
    after_subscription: { product_id: 2002, total_amount: "24000.00", monthly_amount: "2400.00", tenure_months: 10 },
    updated_pending_emi_lines: [{ emi_id: 301, old_amount: "2000.00", new_amount: "2400.00" }],
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
  reconciliation_evidence_ids: [601, 602, 603],
  schedule_line_ids: [9001],
};

const executedAmendment = {
  id: 1,
  amendment_no: "AMD-ADDENDUM-001",
  contract_type: "EMI_SUBSCRIPTION",
  subscription: 1001,
  subscription_number: "SUB-ADDENDUM-001",
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
  reason: "Executed recontract addendum smoke.",
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
  implementation_block_reason: "Already executed through product recontract workflow.",
  implementable_fields: [],
  latest_product_recontract_preview: executedPreview,
  applied_at: null,
  metadata: {},
  created_at: "2026-05-26T10:00:00Z",
  updated_at: "2026-05-26T15:00:00Z",
};

const pendingAmendment = {
  ...executedAmendment,
  id: 2,
  amendment_no: "AMD-PENDING-002",
  latest_product_recontract_preview: { ...executedPreview, executed: false, execution_status: "NOT_EXECUTED" },
};

async function mockAmendmentApis(page: Page, role: "admin" | "customer", amendment = executedAmendment) {
  await page.route(`**/api/v1/${role}/contract-amendments/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && /\/contract-amendments\/\d+\/product-recontract-events\/?$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ ...executedPreview, amendment_id: amendment.id }]),
      });
      return;
    }
    if (request.method() === "GET" && /\/contract-amendments\/\d+\/product-recontract\/financial-impact-preview\/?$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([executedPreview.latest_financial_impact_preview]),
      });
      return;
    }
    if (request.method() === "GET" && /\/contract-amendments\/\d+\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(amendment) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 1, results: [amendment] }) });
  });

  await page.route("**/api/v1/admin/business-profile/**", async (route) => {
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Use fallback branding." }) });
  });
}

async function expectPrintToolbarHidden(page: Page) {
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to amendment record" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
}

test.describe("admin product recontract addendum print", () => {
  test.use({ storageState: authStatePath("admin") });

  test("admin addendum print route renders executed recontract evidence", async ({ page }) => {
    await mockAmendmentApis(page, "admin");
    await page.goto("/admin/contract-amendments/1/recontract-addendum/print");

    await expect(page.getByText("Subidha Furniture")).toBeVisible();
    await expect(page.getByText("PRODUCT RECONTRACT ADDENDUM")).toBeVisible();
    await expect(page.getByText("AMD-ADDENDUM-001")).toBeVisible();
    await expect(page.getByText("SUB-ADDENDUM-001")).toBeVisible();
    await expect(page.getByText("Smoke Customer")).toBeVisible();
    await expect(page.getByText("Old Sofa / SOFA-OLD")).toBeVisible();
    await expect(page.getByText("New Sofa / SOFA-NEW")).toBeVisible();
    await expect(page.getByText("Old Contract Total")).toBeVisible();
    await expect(page.getByText("New Contract Total")).toBeVisible();
    await expect(page.getByText("Old Monthly EMI")).toBeVisible();
    await expect(page.getByText("New Monthly EMI")).toBeVisible();
    await expect(page.getByText("Historical payments unchanged.")).toBeVisible();
    await expect(page.getByText("Historical receipts unchanged.")).toBeVisible();
    await expect(page.getByText("Accounting evidence was created before execution.")).toBeVisible();
    await expect(page.getByText("Accounting Bridge Posting ID")).toBeVisible();
    await expect(page.getByText("Reconciliation evidence was linked before execution.")).toBeVisible();
    await expect(page.getByText("Reconciliation Run ID")).toBeVisible();
    await expect(page.getByText("This statement does not create payment, receipt, refund, or settlement.")).toBeVisible();
    await expect(page.getByText("Customer Signature", { exact: true })).toBeVisible();
    await expect(page.getByText("Authorized Signature", { exact: true })).toBeVisible();
    await expect(page.getByText("Date", { exact: true }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Execute|Reverse|Rollback/i })).toHaveCount(0);
    await expectPrintToolbarHidden(page);
  });

  test("admin detail shows print link only after execution", async ({ page }) => {
    await mockAmendmentApis(page, "admin", executedAmendment);
    await page.goto("/admin/contract-amendments/1");
    await expect(page.getByRole("link", { name: "Recontract Addendum / Print" })).toHaveAttribute(
      "href",
      "/admin/contract-amendments/1/recontract-addendum/print",
    );

    await mockAmendmentApis(page, "admin", pendingAmendment);
    await page.goto("/admin/contract-amendments/2");
    await expect(page.getByRole("link", { name: "Recontract Addendum / Print" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Reverse|Rollback/i })).toHaveCount(0);
  });
});

test.describe("customer product recontract addendum print", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer detail shows print link only for own executed recontract", async ({ page }) => {
    await mockAmendmentApis(page, "customer", executedAmendment);
    await page.goto("/customer/contract-amendments/1");
    await expect(page.getByRole("link", { name: "Recontract Addendum / Print" })).toHaveAttribute(
      "href",
      "/customer/contract-amendments/1/recontract-addendum/print",
    );
    await expect(page.getByRole("button", { name: /Execute|Reverse|Rollback/i })).toHaveCount(0);

    await mockAmendmentApis(page, "customer", pendingAmendment);
    await page.goto("/customer/contract-amendments/2");
    await expect(page.getByRole("link", { name: "Recontract Addendum / Print" })).toHaveCount(0);
  });
});
