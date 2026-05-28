import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const customerId = 501;

const otpReadinessFixture = {
  overall_status: "READY",
  summary: "Email OTP delivery is configured for customer handoff.",
  delivery_backend: "AUTO",
  public_reset_roles: ["CUSTOMER", "PARTNER"],
  public_reset_identifiers: ["email"],
  sms: { status: "NOT_SUPPORTED", detail: "SMS reset is not supported." },
  email: {
    status: "READY",
    fallback_enabled: true,
    backend: "django.core.mail.backends.smtp.EmailBackend",
    from_email_configured: true,
    detail: "Email reset is available.",
  },
  console: { status: "DISABLED", detail: "Console OTP logging is disabled." },
  admin_visibility: {
    status: "API_ONLY",
    detail: "Admin reset monitoring is API-backed.",
    list_endpoint: "/api/v1/admin/password-reset-requests/",
  },
};

const customerFixture = {
  id: customerId,
  name: "Customer 360 Amendment Smoke",
  phone: "9800000001",
  email: "customer360-amendment@example.com",
  address: "Customer 360 Road",
  city: "Asansol",
  kyc_status: "VERIFIED",
  status: "ACTIVE",
  user_id: 701,
  user_username: "customer360amend",
  created_at: "2026-05-20T09:30:00Z",
};

const subscriptionsFixture = {
  results: [
    {
      id: 601,
      subscription_number: "SUB-601",
      product_name: "Customer 360 Sofa",
      batch_code: "BATCH-360",
      lucky_number: 36,
      plan_type: "EMI",
      total_amount: "24000.00",
      monthly_amount: "1600.00",
      status: "ACTIVE",
      start_date: "2026-05-01",
    },
  ],
};

const paymentsFixture = {
  results: [
    {
      id: 801,
      amount: "1600.00",
      method: "UPI",
      reference_no: "PAY-360-001",
      payment_date: "2026-05-22T11:00:00Z",
      subscription_id: 601,
      subscription_number: "SUB-601",
      is_reversed: false,
      is_active_collection: true,
    },
  ],
};

const operationalProfileFixture = {
  overview: {
    subscription_count: 1,
    active_subscriptions: 1,
    historical_subscriptions: 0,
    active_contract_value: "24000.00",
    historical_contract_value: "0.00",
    subscription_outstanding_amount: "22400.00",
    direct_sale_count: 0,
    active_direct_sale_count: 0,
    returned_direct_sale_count: 0,
    direct_sale_outstanding_count: 0,
    direct_sale_outstanding_total: "0.00",
    receipt_count: 0,
    receipt_total: "0.00",
    invoice_count: 0,
    active_invoice_count: 0,
    historical_invoice_count: 0,
    invoice_outstanding_total: "0.00",
    lead_count: 0,
    lead_open_count: 0,
    quotation_estimate_count: 0,
  },
  direct_sales: {
    summary: {
      total_count: 0,
      active_count: 0,
      history_count: 0,
      outstanding_count: 0,
      gross_total: "0.00",
      received_total: "0.00",
      outstanding_total: "0.00",
      historical_total: "0.00",
    },
    rows: [],
  },
  contract_references: {
    summary: { total_count: 0, advance_emi_count: 0, rent_count: 0, lease_count: 0, direct_sale_count: 0 },
    rows: [],
  },
  ledger_summary: {
    entry_count: 0,
    total_credits: "0.00",
    total_debits: "0.00",
    net_subscription_collections: "0.00",
    active_ledger_credits: "0.00",
    active_ledger_debits: "0.00",
    direct_sale_receivable_total: "0.00",
  },
  receipts_documents: {
    summary: {
      receipt_count: 0,
      receipt_total: "0.00",
      active_receipt_count: 0,
      active_receipt_total: "0.00",
      document_count: 0,
      invoice_count: 0,
      invoice_posted_count: 0,
      invoice_total: "0.00",
      invoice_outstanding_total: "0.00",
    },
    receipts: [],
    invoices: [],
    documents: [],
  },
  leads: {
    summary: {
      total_count: 0,
      open_count: 0,
      converted_count: 0,
      quotation_count: 0,
      estimate_count: 0,
      follow_up_required_count: 0,
      follow_up_due_count: 0,
    },
    rows: [],
  },
  quotation_estimates: { summary: { total_count: 0, quotation_count: 0, estimate_count: 0 }, rows: [] },
  partner_linkages: { count: 0, rows: [] },
};

const amendmentRows = [
  {
    id: 901,
    amendment_no: "AMD-901",
    contract_type: "EMI_SUBSCRIPTION",
    subscription: 601,
    subscription_number: "SUB-601",
    rent_lease_contract: null,
    rent_lease_contract_number: null,
    customer: customerId,
    customer_name: "Customer 360 Amendment Smoke",
    customer_phone: "9800000001",
    requested_role: "CUSTOMER",
    amendment_type: "PRODUCT_CHANGE",
    status: "APPROVED",
    reason: "Upgrade product.",
    latest_product_recontract_preview: {
      id: 7001,
      status: "PREVIEWED",
      impact_type: "UPGRADE_EXTRA_PAYABLE",
      customer_consent_status: "ACCEPTED",
      admin_approval_status: "APPROVED",
      accounting_bridge_posting_id: 8001,
      journal_entry_id: 8101,
      reconciliation_item_id: 8201,
      reconciliation_run_id: 8301,
      reconciliation_evidence_ids: [8401],
      executed: true,
      executed_at: "2026-05-25T10:00:00Z",
    },
    created_at: "2026-05-24T10:00:00Z",
  },
  {
    id: 902,
    amendment_no: "AMD-902",
    contract_type: "RENT_LEASE",
    subscription: null,
    subscription_number: null,
    rent_lease_contract: 701,
    rent_lease_contract_number: "RENT-701",
    customer: customerId,
    customer_name: "Customer 360 Amendment Smoke",
    customer_phone: "9800000001",
    requested_role: "PARTNER",
    amendment_type: "RENT_AMOUNT_CHANGE",
    status: "REQUESTED",
    reason: "Rent review.",
    latest_product_recontract_preview: null,
    created_at: "2026-05-23T10:00:00Z",
  },
];

const recontractReportRows = [
  {
    id: 7001,
    amendment_id: 901,
    amendment_no: "AMD-901",
    subscription_id: 601,
    subscription_number: "SUB-601",
    customer_id: customerId,
    customer_name: "Customer 360 Amendment Smoke",
    customer_phone: "9800000001",
    old_product_id: 31,
    old_product_name: "Old Sofa",
    old_product_code: "OLD-SOFA",
    new_product_id: 32,
    new_product_name: "New Sofa",
    new_product_code: "NEW-SOFA",
    old_contract_total: "24000.00",
    new_contract_total: "30000.00",
    price_difference: "6000.00",
    customer_consent_status: "ACCEPTED",
    admin_approval_status: "APPROVED",
    schedule_preview_status: "GENERATED",
    financial_impact_preview_status: "PREVIEWED",
    accounting_posting_status: "POSTED",
    reconciliation_bridge_status: "LINKED",
    executed: true,
    executed_status: "EXECUTED",
    executed_at: "2026-05-25T10:00:00Z",
    addendum_print_eligible: true,
    addendum_print_reference: { amendment_id: 901, route: "/admin/contract-amendments/901/recontract-addendum/print" },
    created_at: "2026-05-24T10:00:00Z",
  },
];

async function mockBaseCustomer360(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/admin/system/otp-delivery-readiness/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(otpReadinessFixture) });
  });
  await page.route(`**/api/v1/admin/customers/${customerId}/`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(customerFixture) });
  });
  await page.route(`**/api/v1/admin/customers/${customerId}/operational-profile/`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(operationalProfileFixture) });
  });
  await page.route(`**/api/v1/admin/customers/${customerId}/kyc-documents/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
  });
  await page.route(`**/api/v1/admin/subscriptions/?customer=${customerId}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(subscriptionsFixture) });
  });
  await page.route(`**/api/v1/admin/payments/?customer=${customerId}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(paymentsFixture) });
  });
}

test("Customer 360 shows amendment and executed recontract status with addendum link", async ({ page }) => {
  await mockBaseCustomer360(page);
  await page.route(`**/api/v1/admin/contract-amendments/?customer=${customerId}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(amendmentRows) });
  });
  await page.route(`**/api/v1/admin/contract-amendments/recontract-report/?customer=${customerId}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(recontractReportRows) });
  });

  await page.goto(`/admin/customers/${customerId}`);

  await expect(page.getByText("Contract Amendments & Recontracts")).toBeVisible();
  await expect(page.getByText("AMD-901")).toBeVisible();
  await expect(page.getByText("Product change")).toBeVisible();
  await expect(page.getByText("ACCEPTED")).toBeVisible();
  await expect(page.getByText("POSTED")).toBeVisible();
  await expect(page.getByText("LINKED")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open amendment detail" }).first()).toHaveAttribute(
    "href",
    "/admin/contract-amendments/901",
  );
  await expect(page.getByRole("link", { name: /Recontract addendum \/ print/i })).toHaveAttribute(
    "href",
    "/admin/contract-amendments/901/recontract-addendum/print",
  );
  await expect(page.getByText("AMD-902")).toBeVisible();
  await expect(page.getByRole("link", { name: /Recontract addendum \/ print/i })).toHaveCount(1);

  await expect(page.getByRole("button", { name: /Execute approved recontract/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Apply product change/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Recalculate EMI now/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Create accounting posting/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Create reconciliation bridge/i })).toHaveCount(0);
});

test("Customer 360 amendment panel shows empty state", async ({ page }) => {
  await mockBaseCustomer360(page);
  await page.route(`**/api/v1/admin/contract-amendments/?customer=${customerId}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
  await page.route(`**/api/v1/admin/contract-amendments/recontract-report/?customer=${customerId}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.goto(`/admin/customers/${customerId}`);

  await expect(page.getByText("Contract Amendments & Recontracts")).toBeVisible();
  await expect(page.getByText("No amendment or recontract activity for this customer.")).toBeVisible();
});

test("Customer 360 amendment panel shows safe error state", async ({ page }) => {
  await mockBaseCustomer360(page);
  await page.route(`**/api/v1/admin/contract-amendments/?customer=${customerId}`, async (route) => {
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Amendments unavailable" }) });
  });
  await page.route(`**/api/v1/admin/contract-amendments/recontract-report/?customer=${customerId}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.goto(`/admin/customers/${customerId}`);

  await expect(page.getByRole("heading", { name: "Customer 360 Amendment Smoke" })).toBeVisible();
  await expect(page.getByText("Could not load amendment/recontract activity")).toBeVisible();
  await expect(page.getByText(/Customer profile remains available/i)).toBeVisible();
});
