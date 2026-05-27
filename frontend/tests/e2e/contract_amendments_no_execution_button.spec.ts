import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const baseFinancialImpactPreview = {
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
};

const baseScheduleLines = [
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
];

const completeReadyEvent = {
  id: 77,
  amendment_id: 1,
  status: "PREVIEWED",
  impact_type: "UPGRADE_EXTRA_PAYABLE",
  old_product: 2001,
  old_product_name: "Old Sofa",
  old_product_code: "SOFA-OLD",
  new_product: 2002,
  new_product_name: "New Sofa",
  new_product_code: "SOFA-NEW",
  old_contract_total: "20000.00",
  new_contract_total: "24000.00",
  price_difference: "4000.00",
  amount_already_paid: "4000.00",
  old_remaining_balance: "16000.00",
  new_remaining_balance: "20000.00",
  current_tenure_months: 10,
  preview_tenure_months: 10,
  current_monthly_amount: "2000.00",
  proposed_monthly_amount: "2400.00",
  pending_emi_count: 8,
  effective_date_preview: "2026-05-26",
  warnings: [],
  blocked_reason: "",
  created_at: "2026-05-26T12:00:00Z",
  created_by_display: "smoke.admin",
  customer_consent_status: "ACCEPTED",
  customer_consented_by: 501,
  customer_consented_by_display: "smoke.customer",
  customer_consented_at: "2026-05-26T13:00:00Z",
  customer_consent_note: "Accepted.",
  admin_approval_status: "APPROVED",
  admin_approved_by: 1,
  admin_approved_by_display: "smoke.admin",
  admin_approved_at: "2026-05-26T14:00:00Z",
  admin_approval_note: "Approved.",
  admin_approval_snapshot: {},
  source_record_mutation: false,
  schedule_preview_lines: baseScheduleLines,
  latest_financial_impact_preview: baseFinancialImpactPreview,
  executed: false,
  executed_at: null,
  executed_by: null,
  execution_status: "NOT_EXECUTED",
  execution_snapshot: {},
  accounting_bridge_posting_id: 501,
  journal_entry_id: 502,
  reconciliation_item_id: 503,
  reconciliation_run_id: 504,
  reconciliation_evidence_ids: [601, 602, 603, 604, 605],
  schedule_line_ids: [9001],
};

const incompleteEvent = {
  ...completeReadyEvent,
  accounting_bridge_posting_id: null,
  journal_entry_id: null,
  reconciliation_item_id: null,
  reconciliation_run_id: null,
  reconciliation_evidence_ids: [],
  schedule_line_ids: [],
};

const executedEvent = {
  ...completeReadyEvent,
  executed: true,
  executed_at: "2026-05-26T15:00:00Z",
  executed_by: 1,
  execution_status: "EXECUTED",
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
};

function amendmentFor(event: typeof completeReadyEvent) {
  return {
    id: 1,
    amendment_no: event.executed ? "AMD-EXECUTED-001" : "AMD-READY-001",
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
    reason: "Product recontract smoke.",
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
    latest_product_recontract_preview: {
      id: event.id,
      status: event.status,
      impact_type: event.impact_type,
      old_product_id: event.old_product,
      old_product_name: event.old_product_name,
      old_product_code: event.old_product_code,
      new_product_id: event.new_product,
      new_product_name: event.new_product_name,
      new_product_code: event.new_product_code,
      old_contract_total: event.old_contract_total,
      new_contract_total: event.new_contract_total,
      price_difference: event.price_difference,
      amount_already_paid: event.amount_already_paid,
      old_remaining_balance: event.old_remaining_balance,
      proposed_new_remaining_balance: event.new_remaining_balance,
      current_tenure_months: event.current_tenure_months,
      preview_tenure_months: event.preview_tenure_months,
      current_monthly_amount: event.current_monthly_amount,
      proposed_monthly_amount: event.proposed_monthly_amount,
      pending_emi_count: event.pending_emi_count,
      effective_date_preview: event.effective_date_preview,
      warnings: event.warnings,
      customer_consent_status: event.customer_consent_status,
      customer_consented_at: event.customer_consented_at,
      customer_consent_note: event.customer_consent_note,
      admin_approval_status: event.admin_approval_status,
      admin_approved_by: event.admin_approved_by,
      admin_approved_at: event.admin_approved_at,
      admin_approval_note: event.admin_approval_note,
      admin_approval_snapshot: event.admin_approval_snapshot,
      source_record_mutation: event.source_record_mutation,
      schedule_preview_lines: event.schedule_preview_lines,
      latest_financial_impact_preview: event.latest_financial_impact_preview,
      executed: event.executed,
      executed_at: event.executed_at,
      executed_by: event.executed_by,
      execution_status: event.execution_status,
      execution_snapshot: event.execution_snapshot,
      accounting_bridge_posting_id: event.accounting_bridge_posting_id,
      journal_entry_id: event.journal_entry_id,
      reconciliation_item_id: event.reconciliation_item_id,
      reconciliation_run_id: event.reconciliation_run_id,
      reconciliation_evidence_ids: event.reconciliation_evidence_ids,
      schedule_line_ids: event.schedule_line_ids,
    },
    applied_at: null,
    metadata: {},
    created_at: "2026-05-26T10:00:00Z",
    updated_at: "2026-05-26T15:00:00Z",
  };
}

async function mockAmendment(page: Page, role: "admin" | "customer" | "partner", event = completeReadyEvent, options: { executeRejects?: boolean } = {}) {
  let currentEvent = event;
  await page.route(`**/api/v1/${role}/contract-amendments/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "POST") {
      if (/\/api\/v1\/admin\/contract-amendments\/1\/product-recontract\/execute\/?$/.test(url.pathname)) {
        if (options.executeRejects) {
          await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ detail: "Execution requires durable reconciliation bridge evidence first." }) });
          return;
        }
        currentEvent = executedEvent;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(currentEvent) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(amendmentFor(currentEvent)) });
      return;
    }

    if (/\/api\/v1\/(admin|customer|partner)\/contract-amendments\/1\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(amendmentFor(currentEvent)) });
      return;
    }
    if (/\/api\/v1\/admin\/contract-amendments\/1\/product-recontract-events\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([currentEvent]) });
      return;
    }
    if (/\/api\/v1\/admin\/contract-amendments\/1\/product-recontract\/schedule-preview\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(currentEvent.schedule_preview_lines) });
      return;
    }
    if (/\/api\/v1\/admin\/contract-amendments\/1\/product-recontract\/financial-impact-preview\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([currentEvent.latest_financial_impact_preview]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 1, results: [amendmentFor(currentEvent)] }) });
  });
}

test.describe("admin product recontract execution UI", () => {
  test.use({ storageState: authStatePath("admin") });

  test("hides execution panel when evidence is incomplete", async ({ page }) => {
    await mockAmendment(page, "admin", incompleteEvent);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByRole("heading", { name: "AMD-READY-001" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Execute approved recontract" })).toHaveCount(0);
    await expect(page.getByText("Type EXECUTE RECONTRACT to enable execution")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Apply product change|Update contract|Recalculate EMI now/i })).toHaveCount(0);
  });

  test("shows execution panel only when all evidence is complete and requires typed confirmation", async ({ page }) => {
    await mockAmendment(page, "admin", completeReadyEvent);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByText("Product recontract execution")).toBeVisible();
    await expect(page.getByText("Customer consent accepted")).toBeVisible();
    await expect(page.getByText("Admin approval approved")).toBeVisible();
    await expect(page.getByText("Schedule preview generated")).toBeVisible();
    await expect(page.getByText("Accounting posting exists")).toBeVisible();
    await expect(page.getByText("Reconciliation bridge exists")).toBeVisible();
    await expect(page.getByText("No previous execution")).toBeVisible();

    const executeButton = page.getByRole("button", { name: "Execute approved recontract" });
    await expect(executeButton).toBeDisabled();
    await page.getByPlaceholder("EXECUTE RECONTRACT").fill("execute recontract");
    await expect(executeButton).toBeDisabled();
    await page.getByPlaceholder("EXECUTE RECONTRACT").fill("EXECUTE RECONTRACT");
    await expect(executeButton).toBeEnabled();
  });

  test("posts to execute endpoint and shows read-only executed summary after success", async ({ page }) => {
    const postCalls: string[] = [];
    await mockAmendment(page, "admin", completeReadyEvent);
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname.includes("/product-recontract/execute/")) postCalls.push(url.pathname);
    });
    await page.goto("/admin/contract-amendments/1");

    await page.getByPlaceholder("EXECUTE RECONTRACT").fill("EXECUTE RECONTRACT");
    await page.getByRole("button", { name: "Execute approved recontract" }).click();

    await expect.poll(() => postCalls).toEqual(["/api/v1/admin/contract-amendments/1/product-recontract/execute/"]);
    await expect(page.getByText("Product recontract executed.")).toBeVisible();
    await expect(page.getByText("Execution status: EXECUTED")).toBeVisible();
    await expect(page.getByText("Accounting bridge id")).toBeVisible();
    await expect(page.getByText("Reconciliation run id")).toBeVisible();
    await expect(page.getByRole("button", { name: "Execute approved recontract" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Apply product change|Update contract|Recalculate EMI now/i })).toHaveCount(0);
  });

  test("shows backend rejection message without mutating UI state", async ({ page }) => {
    await mockAmendment(page, "admin", completeReadyEvent, { executeRejects: true });
    await page.goto("/admin/contract-amendments/1");

    await page.getByPlaceholder("EXECUTE RECONTRACT").fill("EXECUTE RECONTRACT");
    await page.getByRole("button", { name: "Execute approved recontract" }).click();

    await expect(page.getByText("Execution requires durable reconciliation bridge evidence first.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Execute approved recontract" })).toBeVisible();
  });
});

test.describe("customer product recontract execution visibility", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer detail never shows execution panel", async ({ page }) => {
    await mockAmendment(page, "customer", completeReadyEvent);
    await page.goto("/customer/contract-amendments/1");

    await expect(page.getByText("Product recontract preview consent")).toBeVisible();
    await expect(page.getByText("Product recontract execution")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Execute approved recontract" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Apply product change|Update contract|Recalculate EMI now/i })).toHaveCount(0);
  });
});

test.describe("partner product recontract execution visibility", () => {
  test.use({ storageState: authStatePath("partner") });

  test("partner detail never shows execution panel", async ({ page }) => {
    await mockAmendment(page, "partner", completeReadyEvent);
    await page.goto("/partner/contract-amendments/1");

    await expect(page.getByText("Product recontract execution")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Execute approved recontract" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Apply product change|Update contract|Recalculate EMI now/i })).toHaveCount(0);
  });
});
