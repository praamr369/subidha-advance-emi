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
  executed: true,
  executed_at: "2026-05-26T15:00:00Z",
  executed_by: 1,
  execution_status: "EXECUTED",
  execution_snapshot: {
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

async function mockExecutedAmendment(page: Page) {
  await page.route("**/api/v1/admin/contract-amendments/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") {
      await route.fallback();
      return;
    }
    if (/\/api\/v1\/admin\/contract-amendments\/1\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(amendment) });
      return;
    }
    if (/\/api\/v1\/admin\/contract-amendments\/1\/product-recontract-events\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ ...executedPreview, amendment_id: 1 }]) });
      return;
    }
    if (/\/api\/v1\/admin\/contract-amendments\/1\/product-recontract\/schedule-preview\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(executedPreview.schedule_preview_lines) });
      return;
    }
    if (/\/api\/v1\/admin\/contract-amendments\/1\/product-recontract\/financial-impact-preview\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([executedPreview.latest_financial_impact_preview]) });
      return;
    }
    await route.fallback();
  });
}

test.describe("product recontract execution UI exposure", () => {
  test.use({ storageState: authStatePath("admin") });

  test("admin amendment detail does not expose final execution controls even when backend execution metadata exists", async ({ page }) => {
    const postCalls: string[] = [];
    await mockExecutedAmendment(page);
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname.includes("/product-recontract/execute/")) postCalls.push(url.pathname);
    });

    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByRole("heading", { name: "AMD-EXECUTED-001" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Execute approved recontract" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "EXECUTE RECONTRACT" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Execute recontract|Apply product change|Update contract|Recalculate EMI now/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Execute recontract|Apply product change|Update contract|Recalculate EMI now/i })).toHaveCount(0);
    await expect.poll(() => postCalls).toEqual([]);
  });
});
