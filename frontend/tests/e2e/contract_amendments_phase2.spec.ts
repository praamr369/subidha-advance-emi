import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const amendmentFixture = {
  id: 1,
  amendment_no: "AMD-SMOKE-001",
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
  amendment_type: "ADDRESS_CHANGE",
  status: "REQUESTED",
  old_values: { address: "Old smoke address" },
  requested_values: { address: "New smoke address" },
  approved_values: {},
  implemented_values: {},
  previous_values: {},
  new_values: {},
  reason: "Smoke test amendment request.",
  admin_note: "",
  rejection_reason: null,
  financial_impact_amount: null,
  requires_emi_recalculation: false,
  requires_inventory_review: false,
  requires_lucky_id_review: false,
  requires_accounting_review: false,
  requires_rent_lease_review: false,
  effective_date: null,
  approved_by: null,
  approved_by_username: null,
  approved_at: null,
  implemented_by: null,
  implemented_by_username: null,
  implemented_at: null,
  is_implementable: false,
  implementation_block_reason: "Implementation requires APPROVED status.",
  implementable_fields: [],
  applied_at: null,
  metadata: { ui_phase: "PHASE_2_REQUEST_ONLY" },
  created_at: "2026-05-26T10:00:00Z",
  updated_at: null,
};

const approvedSafeAmendmentFixture = {
  ...amendmentFixture,
  status: "APPROVED",
  approved_values: { address: "New smoke address" },
  is_implementable: true,
  implementation_block_reason: "",
  implementable_fields: ["address", "city"],
};

const approvedProductChangeFixture = {
  ...amendmentFixture,
  amendment_type: "PRODUCT_CHANGE",
  status: "APPROVED",
  old_values: { product_id: 2001, product_name: "Old Sofa" },
  requested_values: { approved_product_id: 2002, approved_product_name: "New Sofa", approved_product_code: "SOFA-NEW" },
  approved_values: { approved_product_id: 2002, approved_product_name: "New Sofa", approved_product_code: "SOFA-NEW" },
  is_implementable: true,
  implementation_block_reason: "",
  implementable_fields: ["product"],
};

const blockedProductChangeFixture = {
  ...approvedProductChangeFixture,
  is_implementable: false,
  implementation_block_reason: "Financial product change requires contract repricing preview and reconciliation and is not implemented in this phase.",
};

const productRecontractPreviewFixture = {
  preview_status: "READY",
  impact_type: "UPGRADE_EXTRA_PAYABLE",
  blocked_reason: "",
  source_record_mutation: false,
  old_product_id: 2001,
  old_product_name: "Old Sofa",
  old_product_code: "SOFA-OLD",
  new_product_id: 2002,
  new_product_name: "New Sofa",
  new_product_code: "SOFA-NEW",
  old_contract_total: "20000.00",
  new_contract_total: "25000.00",
  price_difference: "5000.00",
  amount_already_paid: "4000.00",
  old_remaining_balance: "16000.00",
  proposed_new_remaining_balance: "21000.00",
  current_tenure_months: 10,
  preview_tenure_months: 10,
  current_monthly_amount: "2000.00",
  proposed_monthly_amount: "2500.00",
  pending_emi_count: 8,
  effective_date_preview: "2026-05-26",
  warnings: [
    "Preview only — no source records are mutated.",
    "No contract, EMI, payment, receipt, accounting, reconciliation, stock, delivery, commission, payout, waiver, rent/lease demand, or deposit records are changed.",
    "Accounting and reconciliation are not posted by this preview.",
    "Final execution requires a later approved financial implementation phase.",
  ],
};

const productRecontractEventFixture = {
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
  new_contract_total: "25000.00",
  price_difference: "5000.00",
  amount_already_paid: "4000.00",
  old_remaining_balance: "16000.00",
  new_remaining_balance: "21000.00",
  current_tenure_months: 10,
  preview_tenure_months: 10,
  current_monthly_amount: "2000.00",
  proposed_monthly_amount: "2500.00",
  pending_emi_count: 8,
  effective_date_preview: "2026-05-26",
  source_record_mutation: false,
  warnings: productRecontractPreviewFixture.warnings,
  blocked_reason: "",
  created_at: "2026-05-26T12:00:00Z",
  created_by_display: "smoke.admin",
  customer_consent_status: "PENDING",
  customer_consented_by: null,
  customer_consented_by_display: null,
  customer_consented_at: null,
  customer_consent_note: "",
  customer_consent_snapshot: {},
  admin_approval_status: "PENDING",
  admin_approved_by: null,
  admin_approved_by_display: null,
  admin_approved_at: null,
  admin_approval_note: "",
  admin_approval_snapshot: {},
  schedule_preview_lines: [
    {
      id: 9001,
      event: 77,
      line_no: 1,
      original_emi: 301,
      original_due_date: "2026-03-01",
      original_amount: "2000.00",
      proposed_due_date: "2026-03-01",
      proposed_amount: "2625.00",
      proposed_status: "PREVIEW_ONLY",
      adjustment_type: "EXISTING_PENDING_REPLACEMENT",
      source_record_mutation: false,
      metadata: {},
    },
  ],
};

const financialImpactPreviewFixture = {
  id: 9901,
  event: productRecontractEventFixture.id,
  impact_type: "UPGRADE_EXTRA_PAYABLE",
  accounting_preview_status: "PREVIEWED",
  reconciliation_preview_status: "PREVIEWED",
  price_difference: "5000.00",
  additional_receivable_amount: "5000.00",
  credit_or_reduction_amount: "0.00",
  projected_customer_balance: "21000.00",
  projected_future_emi_total: "21000.00",
  journal_preview: { preview_only: true, posting_performed: false, lines: [{ line_no: 1, entry_side: "DR", label: "Customer Receivable / Contract Receivable", amount: "5000.00" }] },
  reconciliation_preview: { preview_only: true, items_created: false, rows: [{ reference_type: "CONTRACT_RECONTRACT_EVENT", amount: "5000.00", status: "PREVIEWED" }] },
  warnings: ["Preview evidence only. No source records are mutated."],
  blocked_reason: "",
  source_record_mutation: false,
};

const latestProductRecontractPreviewSummary = {
  id: productRecontractEventFixture.id,
  status: productRecontractEventFixture.status,
  impact_type: productRecontractEventFixture.impact_type,
  old_product_id: productRecontractEventFixture.old_product,
  old_product_name: productRecontractEventFixture.old_product_name,
  old_product_code: productRecontractEventFixture.old_product_code,
  new_product_id: productRecontractEventFixture.new_product,
  new_product_name: productRecontractEventFixture.new_product_name,
  new_product_code: productRecontractEventFixture.new_product_code,
  old_contract_total: productRecontractEventFixture.old_contract_total,
  new_contract_total: productRecontractEventFixture.new_contract_total,
  price_difference: productRecontractEventFixture.price_difference,
  amount_already_paid: productRecontractEventFixture.amount_already_paid,
  old_remaining_balance: productRecontractEventFixture.old_remaining_balance,
  proposed_new_remaining_balance: productRecontractEventFixture.new_remaining_balance,
  current_tenure_months: productRecontractEventFixture.current_tenure_months,
  preview_tenure_months: productRecontractEventFixture.preview_tenure_months,
  current_monthly_amount: productRecontractEventFixture.current_monthly_amount,
  proposed_monthly_amount: productRecontractEventFixture.proposed_monthly_amount,
  pending_emi_count: productRecontractEventFixture.pending_emi_count,
  effective_date_preview: productRecontractEventFixture.effective_date_preview,
  warnings: productRecontractEventFixture.warnings,
  customer_consent_status: "PENDING",
  customer_consented_at: null,
  customer_consent_note: "",
  admin_approval_status: "PENDING",
  admin_approved_by: null,
  admin_approved_at: null,
  admin_approval_note: "",
  admin_approval_snapshot: {},
  source_record_mutation: false,
  schedule_preview_lines: productRecontractEventFixture.schedule_preview_lines,
  latest_financial_impact_preview: financialImpactPreviewFixture,
};

const approvedProductChangeWithSavedPreviewFixture = {
  ...approvedProductChangeFixture,
  latest_product_recontract_preview: latestProductRecontractPreviewSummary,
};

const acceptedProductRecontractEventFixture = {
  ...productRecontractEventFixture,
  customer_consent_status: "ACCEPTED",
  customer_consented_at: "2026-05-26T13:00:00Z",
  customer_consent_note: "Customer accepted.",
};

const acceptedProductRecontractPreviewSummary = {
  ...latestProductRecontractPreviewSummary,
  customer_consent_status: "ACCEPTED",
  customer_consented_at: "2026-05-26T13:00:00Z",
  customer_consent_note: "Customer accepted.",
};

const approvedProductChangeWithAcceptedPreviewFixture = {
  ...approvedProductChangeFixture,
  latest_product_recontract_preview: acceptedProductRecontractPreviewSummary,
};

const lifecycleSubscriptionFixture = {
  id: 1001,
  subscription_number: "SUB-SMOKE-001",
  customer: 501,
  customer_name: "Smoke Customer",
  customer_phone: "9000000000",
  product: 2001,
  product_name: "Old Sofa",
  product_code: "SOFA-OLD",
  batch: 301,
  batch_code: "BATCH-SMOKE",
  lucky_id: 401,
  lucky_number: 7,
  plan_type: "EMI",
  monthly_amount: "2000.00",
  total_amount: "20000.00",
  tenure_months: 10,
  status: "ACTIVE",
  start_date: "2026-01-01",
  created_at: "2026-01-01T00:00:00Z",
  terms_locked_at: "2026-01-01T00:00:00Z",
};

const lifecycleProductUpgradeFixture = {
  id: 1,
  subscription: 1001,
  amendment_type: "PRODUCT_UPGRADE",
  status: "APPROVED",
  previous_values: { product_id: 2001, total_amount: "20000.00" },
  new_values: { product_id: 2002, total_amount: "25000.00", price_difference: "5000.00" },
  reason: "Customer requested upgrade to higher priced product.",
  rejection_reason: null,
  notes: "",
  requested_by: 501,
  approved_by: 1,
  approved_at: "2026-05-26T10:30:00Z",
  applied_at: null,
  created_at: "2026-05-26T10:00:00Z",
};

async function mockAmendments(page: Page, role: "customer" | "partner" | "admin", fixture = amendmentFixture) {
  const fixturePreview = (fixture as { latest_product_recontract_preview?: typeof latestProductRecontractPreviewSummary }).latest_product_recontract_preview;
  const eventRows = fixturePreview
    ? [
        {
          ...productRecontractEventFixture,
          customer_consent_status: fixturePreview.customer_consent_status,
          customer_consented_at: fixturePreview.customer_consented_at,
          customer_consent_note: fixturePreview.customer_consent_note,
          admin_approval_status: fixturePreview.admin_approval_status,
          admin_approved_at: fixturePreview.admin_approved_at,
          admin_approval_note: fixturePreview.admin_approval_note,
        },
      ]
    : [];
  await page.route(`**/api/v1/${role}/contract-amendments/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET") {
      if (/\/contract-amendments\/1\/product-recontract-preview\/save\/?$/.test(url.pathname)) {
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(productRecontractEventFixture) });
        return;
      }
      if (/\/contract-amendments\/1\/product-recontract\/consent\/?$/.test(url.pathname)) {
        const payload = request.postDataJSON() as { decision?: string; note?: string };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...productRecontractEventFixture,
            customer_consent_status: payload.decision,
            customer_consented_at: "2026-05-26T13:00:00Z",
            customer_consent_note: payload.note || "",
          }),
        });
        return;
      }
      if (/\/contract-amendments\/1\/product-recontract\/admin-decision\/?$/.test(url.pathname)) {
        const payload = request.postDataJSON() as { decision?: string; note?: string };
        const decisionEvent = {
          ...acceptedProductRecontractEventFixture,
          admin_approval_status: payload.decision,
          admin_approved_by: 1,
          admin_approved_by_display: "smoke.admin",
          admin_approved_at: "2026-05-26T14:00:00Z",
          admin_approval_note: payload.note || "",
        };
        eventRows.splice(0, eventRows.length, decisionEvent);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(decisionEvent),
        });
        return;
      }
      if (/\/contract-amendments\/1\/product-recontract\/schedule-preview\/?$/.test(url.pathname)) {
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(productRecontractEventFixture) });
        return;
      }
      if (/\/contract-amendments\/1\/product-recontract\/financial-impact-preview\/?$/.test(url.pathname)) {
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(financialImpactPreviewFixture) });
        return;
      }
      if (/\/contract-amendments\/1\/product-recontract-preview\/?$/.test(url.pathname)) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(productRecontractPreviewFixture) });
        return;
      }
      if (/\/contract-amendments\/1\/implement\/?$/.test(url.pathname)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...fixture, status: "IMPLEMENTED", implemented_at: "2026-05-26T11:00:00Z" }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
      return;
    }

    if (/\/contract-amendments\/1\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
      return;
    }

    if (/\/contract-amendments\/1\/product-recontract-events\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(eventRows) });
      return;
    }
    if (/\/contract-amendments\/1\/product-recontract\/schedule-preview\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(productRecontractEventFixture.schedule_preview_lines) });
      return;
    }
    if (/\/contract-amendments\/1\/product-recontract\/financial-impact-preview\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([financialImpactPreviewFixture]) });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 1, results: [fixture] }) });
  });
}

async function mockSubscriptionLifecycle(page: Page, amendments = [lifecycleProductUpgradeFixture]) {
  await page.route("**/api/v1/admin/subscriptions/1001/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(lifecycleSubscriptionFixture) });
  });
  await page.route("**/api/v1/admin/contracts/1001/amendments/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(amendments) });
  });
  await page.route("**/api/v1/admin/contracts/1001/possession/**", async (route) => {
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "No possession record found." }) });
  });
  await page.route("**/api/v1/admin/contracts/1001/return-inspection/**", async (route) => {
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "No inspection found." }) });
  });
}

test.describe("customer contract amendment phase-2 UI", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer amendment list loads and exposes only customer navigation", async ({ page }) => {
    await mockAmendments(page, "customer");
    await page.goto("/customer/contract-amendments");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "My amendment requests" })).toBeVisible();
    await expect(page.getByText("Guarded amendment implementation phase")).toBeVisible();
    await expect(page.getByText("AMD-SMOKE-001")).toBeVisible();

    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("link", { name: "My amendment requests", exact: true }).first()).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Contract Amendments", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Customer amendment requests", exact: true })).toHaveCount(0);
  });
});

test.describe("partner contract amendment phase-2 UI", () => {
  test.use({ storageState: authStatePath("partner") });

  test("partner amendment list loads and exposes only partner navigation", async ({ page }) => {
    await mockAmendments(page, "partner");
    await page.goto("/partner/contract-amendments");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "Customer amendment requests" })).toBeVisible();
    await expect(page.getByText("Guarded amendment implementation phase")).toBeVisible();
    await expect(page.getByText("AMD-SMOKE-001")).toBeVisible();

    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("link", { name: "Customer amendment requests", exact: true }).first()).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "My amendment requests", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Contract Amendments", exact: true })).toHaveCount(0);
  });
});

test.describe("admin contract amendment phase-2 UI", () => {
  test.use({ storageState: authStatePath("admin") });

  test("admin amendment register loads and exposes only admin navigation", async ({ page }) => {
    await mockAmendments(page, "admin");
    await page.goto("/admin/contract-amendments");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "Contract Amendments" })).toBeVisible();
    await expect(page.getByText("Guarded amendment implementation phase")).toBeVisible();
    await expect(page.getByText("AMD-SMOKE-001")).toBeVisible();

    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("link", { name: "Contract Amendments", exact: true }).first()).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "My amendment requests", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Customer amendment requests", exact: true })).toHaveCount(0);
  });

  test("admin amendment detail shows implementation button only for approved safe amendment", async ({ page }) => {
    await mockAmendments(page, "admin", approvedSafeAmendmentFixture);
    await page.goto("/admin/contract-amendments/1");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "AMD-SMOKE-001" })).toBeVisible();
    await expect(page.getByText("Only whitelisted non-financial corrections can be implemented in Phase 3.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Implement approved non-financial correction" })).toBeVisible();
  });

  test("admin amendment detail shows same-price product reference correction for approved product change", async ({ page }) => {
    await mockAmendments(page, "admin", approvedProductChangeFixture);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByText("This only corrects the stored product reference when the contract value remains unchanged.")).toBeVisible();
    await expect(page.getByText("Product reference correction preview")).toBeVisible();
    await expect(page.getByText("New Sofa", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Implement approved same-price product reference correction" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Implement approved non-financial correction" })).toHaveCount(0);
  });

  test("admin amendment detail previews backend financial product change impact", async ({ page }) => {
    await mockAmendments(page, "admin", approvedProductChangeFixture);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByRole("button", { name: "Preview financial product change" })).toBeVisible();
    await page.getByRole("button", { name: "Preview financial product change" }).click();

    await expect(page.getByText("UPGRADE_EXTRA_PAYABLE").first()).toBeVisible();
    await expect(page.getByText("20000.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("25000.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("5000.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("4000.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("21000.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Saving a preview snapshot does not change the contract, EMI schedule, payments, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply change|Execute|Update contract|Implement amendment/i })).toHaveCount(0);
  });

  test("admin amendment detail saves product recontract preview snapshot evidence", async ({ page }) => {
    await mockAmendments(page, "admin", approvedProductChangeFixture);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByRole("button", { name: "Save preview snapshot" })).toBeVisible();
    await page.getByRole("button", { name: "Save preview snapshot" }).click();

    await expect(page.getByText("Saved preview snapshot #77.")).toBeVisible();
    await expect(page.getByText("Latest saved preview snapshot")).toBeVisible();
    await expect(page.getByText("#77 · PREVIEWED · UPGRADE_EXTRA_PAYABLE").first()).toBeVisible();
    await expect(page.getByText("Source record mutation")).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply product change|Execute recontract|Update contract|Recalculate EMI now/i })).toHaveCount(0);
  });

  test("admin amendment detail shows customer consent status read-only", async ({ page }) => {
    await mockAmendments(page, "admin", approvedProductChangeWithSavedPreviewFixture);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByText("Customer recontract consent")).toBeVisible();
    await expect(page.getByText("Consent status", { exact: true })).toBeVisible();
    await expect(page.getByText("Admin approval status", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("#77 · PREVIEWED · UPGRADE_EXTRA_PAYABLE").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept proposed recontract terms" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject proposed recontract terms" })).toHaveCount(0);
  });

  test("admin amendment detail shows admin approval controls after customer accepted", async ({ page }) => {
    await mockAmendments(page, "admin", approvedProductChangeWithAcceptedPreviewFixture);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByText("Customer consent status")).toBeVisible();
    await expect(page.getByText("ACCEPTED", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Admin approval records a decision only. It does not execute product change, recalculate EMI, post accounting, update reconciliation, change stock/delivery, or mutate any contract records.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve recontract preview for future execution" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject recontract preview" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Execute recontract|Apply product change|Update contract|Recalculate EMI now/i })).toHaveCount(0);
  });

  test("admin can generate future EMI schedule preview lines after accepted and approved", async ({ page }) => {
    const approvedAndAccepted = {
      ...approvedProductChangeWithAcceptedPreviewFixture,
      latest_product_recontract_preview: {
        ...approvedProductChangeWithAcceptedPreviewFixture.latest_product_recontract_preview,
        admin_approval_status: "APPROVED",
      },
    };
    await mockAmendments(page, "admin", approvedAndAccepted);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByText("This creates preview lines only. Actual EMI records are not changed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate future EMI schedule preview" })).toBeVisible();
    await page.getByRole("button", { name: "Generate future EMI schedule preview" }).click();
    await expect(page.getByText("Future EMI schedule preview generated.")).toBeVisible();
    await expect(page.getByText("Future EMI schedule preview lines")).toBeVisible();
  });

  test("admin can generate accounting and reconciliation impact preview only", async ({ page }) => {
    const acceptedAndApprovedFixture = {
      ...approvedProductChangeWithAcceptedPreviewFixture,
      latest_product_recontract_preview: {
        ...approvedProductChangeWithAcceptedPreviewFixture.latest_product_recontract_preview,
        admin_approval_status: "APPROVED",
        schedule_preview_lines: productRecontractEventFixture.schedule_preview_lines,
      },
    };
    await mockAmendments(page, "admin", acceptedAndApprovedFixture);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByRole("button", { name: "Generate accounting & reconciliation preview" })).toBeVisible();
    await expect(page.getByText("This creates accounting and reconciliation preview evidence only. No journal, finance account, settlement, reconciliation, EMI, payment, receipt, product, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records are changed.")).toBeVisible();
    await page.getByRole("button", { name: "Generate accounting & reconciliation preview" }).click();
    await expect(page.getByText("Accounting and reconciliation impact preview generated.")).toBeVisible();
    await expect(page.getByText("Accounting and reconciliation impact preview", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Execute recontract" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Post journal" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Apply accounting" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reconcile now" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Update contract" })).toHaveCount(0);
  });

  test("admin can click approve recontract preview for future execution", async ({ page }) => {
    await mockAmendments(page, "admin", approvedProductChangeWithAcceptedPreviewFixture);
    await page.goto("/admin/contract-amendments/1");

    await page.getByRole("button", { name: "Approve recontract preview for future execution" }).click();

    await expect(page.getByText("Admin recontract preview decision recorded: APPROVED.")).toBeVisible();
    await expect(page.getByText("Admin approval status: APPROVED")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve recontract preview for future execution" })).toHaveCount(0);
  });

  test("admin can click reject recontract preview", async ({ page }) => {
    await mockAmendments(page, "admin", approvedProductChangeWithAcceptedPreviewFixture);
    await page.goto("/admin/contract-amendments/1");

    await page.getByRole("button", { name: "Reject recontract preview" }).click();

    await expect(page.getByText("Admin recontract preview decision recorded: REJECTED.")).toBeVisible();
    await expect(page.getByText("Admin approval status: REJECTED")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject recontract preview" })).toHaveCount(0);
  });

  test("admin amendment detail does not show implementation button for blocked financial product change", async ({ page }) => {
    await mockAmendments(page, "admin", blockedProductChangeFixture);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByRole("button", { name: "Implement approved same-price product reference correction" })).toHaveCount(0);
    await expect(page.getByText("Financial product change requires contract repricing preview and reconciliation")).toBeVisible();
  });

  test("admin implementation button calls only the guarded implement endpoint", async ({ page }) => {
    const calls: string[] = [];
    await mockAmendments(page, "admin", approvedSafeAmendmentFixture);
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname.includes("/contract-amendments/1/")) calls.push(url.pathname);
    });
    await page.goto("/admin/contract-amendments/1");
    await page.getByRole("button", { name: "Implement approved non-financial correction" }).click();

    await expect.poll(() => calls).toEqual(["/api/v1/admin/contract-amendments/1/implement/"]);
  });

  test("subscription lifecycle amendment panel is read-only and links to amendment detail", async ({ page }) => {
    const legacyApplyCalls: string[] = [];
    await mockSubscriptionLifecycle(page);
    await page.route("**/api/v1/admin/contracts/amendments/1/apply/**", async (route) => {
      legacyApplyCalls.push(new URL(route.request().url()).pathname);
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          detail:
            "Only whitelisted non-financial customer contact/address corrections and Phase 4 same-price product reference corrections can be implemented.",
        }),
      });
    });

    await page.goto("/admin/subscriptions/1001/lifecycle");

    const main = page.locator("#main-content");
    await expect(main.getByText("PRODUCT UPGRADE", { exact: true })).toBeVisible();
    await expect(main.getByText("Approved").first()).toBeVisible();
    await expect(main.getByText(/Approved 26 May 2026/)).toBeVisible();
    await expect(
      main.getByText(
        "Financial product upgrade/downgrade requires recontract preview and future approved execution. It is not applied from this lifecycle panel.",
      ),
    ).toBeVisible();
    await expect(main.getByRole("link", { name: "Open amendment" })).toHaveAttribute("href", "/admin/contract-amendments/1");
    await expect(main.getByRole("button", { name: /^Apply$/ })).toHaveCount(0);
    await expect(main.getByRole("button", { name: /Apply change|Execute|Update contract|Implement amendment/i })).toHaveCount(0);
    await expect(main.getByRole("link", { name: /Apply change|Execute|Update contract|Implement amendment/i })).toHaveCount(0);
    await expect(main.getByText("Only whitelisted non-financial customer contact/address corrections")).toHaveCount(0);
    await expect.poll(() => legacyApplyCalls).toEqual([]);
  });

  test("admin amendment detail still exposes decision controls", async ({ page }) => {
    await mockAmendments(page, "admin");
    await page.goto("/admin/contract-amendments/1");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "AMD-SMOKE-001" })).toBeVisible();
    await expect(page.getByText("Only approved whitelisted corrections or same-price product reference corrections can move to implementation.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve decision" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply change|Execute|Update contract|Implement amendment/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Apply change|Execute|Update contract|Implement amendment/i })).toHaveCount(0);
  });
});

test.describe("customer and partner amendment implementation visibility", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer detail shows saved recontract preview summary and consent-only warning", async ({ page }) => {
    await mockAmendments(page, "customer", approvedProductChangeWithSavedPreviewFixture);
    await page.goto("/customer/contract-amendments/1");

    await expect(page.getByText("Product recontract preview consent")).toBeVisible();
    await expect(page.getByText("Customer consent records agreement or rejection of the preview only. It does not change the product, EMI schedule, payment history, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.")).toBeVisible();
    await expect(page.getByText("Old Sofa (#2001)")).toBeVisible();
    await expect(page.getByText("New Sofa (#2002)")).toBeVisible();
    await expect(page.getByText("25000.00")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept proposed recontract terms" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject proposed recontract terms" })).toBeVisible();
    await expect(page.getByText("Future EMI schedule preview lines (read-only)")).toBeVisible();
    await expect(page.getByText("Accounting and reconciliation impact preview (read-only)")).toBeVisible();
    await expect(page.getByRole("button", { name: /Execute|Apply|Update contract|Recalculate/i })).toHaveCount(0);
  });

  test("customer can accept proposed recontract terms", async ({ page }) => {
    await mockAmendments(page, "customer", approvedProductChangeWithSavedPreviewFixture);
    await page.goto("/customer/contract-amendments/1");

    await page.getByRole("button", { name: "Accept proposed recontract terms" }).click();

    await expect(page.getByText("Customer consent status: ACCEPTED")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept proposed recontract terms" })).toHaveCount(0);
  });

  test("customer can reject proposed recontract terms", async ({ page }) => {
    await mockAmendments(page, "customer", approvedProductChangeWithSavedPreviewFixture);
    await page.goto("/customer/contract-amendments/1");

    await page.getByRole("button", { name: "Reject proposed recontract terms" }).click();

    await expect(page.getByText("Customer consent status: REJECTED")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject proposed recontract terms" })).toHaveCount(0);
  });

  test("customer detail never shows implementation action", async ({ page }) => {
    await mockAmendments(page, "customer", approvedProductChangeFixture);
    await page.goto("/customer/contract-amendments/1");

    await expect(page.getByRole("button", { name: "Implement approved non-financial correction" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Implement approved same-price product reference correction" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Preview financial product change" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save preview snapshot" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve recontract preview for future execution" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject recontract preview" })).toHaveCount(0);
  });
});

test.describe("partner amendment implementation visibility", () => {
  test.use({ storageState: authStatePath("partner") });

  test("partner detail never shows implementation action", async ({ page }) => {
    await mockAmendments(page, "partner", approvedProductChangeWithSavedPreviewFixture);
    await page.goto("/partner/contract-amendments/1");

    await expect(page.getByRole("button", { name: "Implement approved non-financial correction" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Implement approved same-price product reference correction" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Preview financial product change" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save preview snapshot" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Accept proposed recontract terms" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject proposed recontract terms" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve recontract preview for future execution" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject recontract preview" })).toHaveCount(0);
  });
});
