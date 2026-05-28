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
  sms: {
    status: "NOT_SUPPORTED",
    detail: "SMS reset is not supported in this environment.",
  },
  email: {
    status: "READY",
    fallback_enabled: true,
    backend: "django.core.mail.backends.smtp.EmailBackend",
    from_email_configured: true,
    detail: "Email reset is available.",
  },
  console: {
    status: "DISABLED",
    detail: "Console OTP logging is disabled.",
  },
  admin_visibility: {
    status: "API_ONLY",
    detail: "Admin reset monitoring is API-backed.",
    list_endpoint: "/api/v1/admin/password-reset-requests/",
  },
};

const customerFixture = {
  id: customerId,
  name: "Customer 360 Smoke",
  phone: "9800000001",
  email: "customer360@example.com",
  address: "Customer 360 Road",
  city: "Asansol",
  kyc_status: "VERIFIED",
  status: "ACTIVE",
  user_id: 701,
  user_username: "customer360",
  created_at: "2026-05-20T09:30:00Z",
  kyc_reviewed_by_username: "admin",
  kyc_reviewed_at: "2026-05-21T09:30:00Z",
  kyc_rejection_reason: "",
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
  customer: {
    id: customerId,
    name: "Customer 360 Smoke",
    phone: "9800000001",
    address: "Customer 360 Road",
    city: "Asansol",
    kyc_status: "VERIFIED",
    user_is_active: true,
  },
  overview: {
    subscription_count: 1,
    active_subscriptions: 1,
    historical_subscriptions: 0,
    cancelled_subscription_count: 0,
    completed_subscriptions: 0,
    winner_subscriptions: 0,
    total_subscription_paid: "1600.00",
    subscription_outstanding_amount: "22400.00",
    active_contract_value: "24000.00",
    historical_contract_value: "0.00",
    active_subscription_due: "1600.00",
    active_overdue_emi_count: 1,
    active_overdue_emi_amount: "1600.00",
    has_history_only_contracts: false,
    history_badges: [],
    direct_sale_count: 1,
    active_direct_sale_count: 1,
    returned_direct_sale_count: 0,
    direct_sale_outstanding_count: 1,
    direct_sale_outstanding_total: "5000.00",
    historical_direct_sale_total: "0.00",
    receipt_count: 1,
    receipt_total: "1600.00",
    invoice_count: 1,
    active_invoice_count: 1,
    historical_invoice_count: 0,
    invoice_outstanding_total: "5000.00",
    lead_count: 1,
    lead_open_count: 1,
    quotation_estimate_count: 1,
  },
  direct_sales: {
    summary: {
      total_count: 1,
      active_count: 1,
      history_count: 0,
      invoiced_count: 1,
      outstanding_count: 1,
      gross_total: "10000.00",
      received_total: "5000.00",
      outstanding_total: "5000.00",
      historical_total: "0.00",
    },
    rows: [
      {
        id: 901,
        sale_no: "DS-360",
        sale_date: "2026-05-15",
        status: "INVOICED",
        is_history_only: false,
        active_outstanding_total: "5000.00",
        branch_name: "Main Branch",
        grand_total: "10000.00",
        received_total: "5000.00",
        balance_total: "5000.00",
        billing_invoice_id: 1001,
        billing_invoice_no: "INV-360",
        delivery_required: true,
      },
    ],
  },
  subscriptions: {
    summary: {
      total_subscriptions: 1,
      active_subscriptions: 1,
      won_subscriptions: 0,
      completed_subscriptions: 0,
      pending_emis: 14,
      paid_emis: 1,
      waived_emis: 0,
      total_paid_amount: "1600.00",
      lucky_plan_draw: [],
    },
    rows: subscriptionsFixture.results,
  },
  contract_references: {
    summary: {
      total_count: 2,
      advance_emi_count: 1,
      rent_count: 1,
      lease_count: 0,
      direct_sale_count: 0,
    },
    rows: [
      {
        contract_reference_id: 10001,
        source_type: "ADVANCE_EMI",
        source_id: 601,
        reference_no: "SUB-601",
        display_reference: "SUB-601",
        customer_id: customerId,
        customer_name: "Customer 360 Smoke",
        phone_masked: "******0001",
        product_summary: "Customer 360 Sofa",
        due_amount: "1600.00",
        overdue_amount: "1600.00",
        next_due_date: "2026-06-01",
        status: "ACTIVE",
        primary_action: "COLLECT_EMI",
        allowed_actions: ["COLLECT_EMI"],
        collection_route: "/admin/finance/collect?subscription=601",
      },
      {
        contract_reference_id: 10002,
        source_type: "RENT",
        source_id: 701,
        reference_no: "RENT-701",
        display_reference: "RENT-701",
        customer_id: customerId,
        customer_name: "Customer 360 Smoke",
        phone_masked: "******0001",
        product_summary: "Rent reference",
        due_amount: "0.00",
        overdue_amount: "0.00",
        next_due_date: null,
        status: "ACTIVE",
        primary_action: "VIEW_ONLY",
        allowed_actions: [],
        disabled_reason: "Rent collection is not enabled from Customer 360.",
        collection_route: "",
      },
    ],
  },
  payments: {
    summary: {
      total_count: 1,
      active_count: 1,
      reversed_count: 0,
      total_amount: "1600.00",
      active_collected_amount: "1600.00",
      reversed_payment_amount: "0.00",
    },
    rows: paymentsFixture.results,
  },
  ledger_summary: {
    entry_count: 1,
    total_credits: "1600.00",
    total_debits: "0.00",
    net_subscription_collections: "1600.00",
    active_ledger_credits: "1600.00",
    active_ledger_debits: "0.00",
    direct_sale_receivable_total: "5000.00",
  },
  receipts_documents: {
    summary: {
      receipt_count: 1,
      receipt_total: "1600.00",
      active_receipt_count: 1,
      active_receipt_total: "1600.00",
      document_count: 1,
      invoice_count: 1,
      invoice_posted_count: 1,
      invoice_total: "10000.00",
      invoice_outstanding_total: "5000.00",
    },
    receipts: [
      {
        id: 1101,
        receipt_no: "RCPT-360",
        receipt_type: "PAYMENT",
        status: "ISSUED",
        receipt_date: "2026-05-22",
        amount: "1600.00",
        finance_account_name: "Main Cash Desk",
      },
    ],
    invoices: [
      {
        id: 1001,
        document_no: "INV-360",
        invoice_date: "2026-05-15",
        status: "POSTED",
        billing_channel: "DIRECT_SALE",
        direct_sale_id: 901,
        direct_sale_no: "DS-360",
        subscription_id: null,
        grand_total: "10000.00",
        received_total: "5000.00",
        balance_total: "5000.00",
      },
    ],
    documents: [
      {
        id: 1201,
        subscription_id: 601,
        subscription_number: "SUB-601",
        document_type: "AADHAAR",
        verification_status: "APPROVED",
        created_at: "2026-05-20T09:30:00Z",
      },
    ],
  },
  leads: {
    summary: {
      total_count: 1,
      open_count: 1,
      converted_count: 0,
      quotation_count: 1,
      estimate_count: 0,
      follow_up_required_count: 1,
      follow_up_due_count: 0,
    },
    rows: [
      {
        id: 1301,
        name: "Customer 360 Smoke",
        phone: "9800000001",
        status: "NEW",
        intent: "QUOTATION",
        source: "WALK_IN",
        interested_product: "Customer 360 Sofa",
        follow_up_required: true,
        follow_up_on: "2026-05-30",
        notes: "Interested in Lucky Plan.",
        created_at: "2026-05-18T10:00:00Z",
      },
    ],
  },
  quotation_estimates: {
    summary: {
      total_count: 1,
      quotation_count: 1,
      estimate_count: 0,
    },
    rows: [],
  },
  partner_linkages: {
    count: 1,
    rows: [{ partner_id: 401, partner_name: "Smoke Partner", subscription_count: 1 }],
  },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/admin/system/otp-delivery-readiness/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(otpReadinessFixture),
    });
  });

  await page.route(`**/api/v1/admin/customers/${customerId}/`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(customerFixture),
    });
  });

  await page.route(`**/api/v1/admin/customers/${customerId}/operational-profile/`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(operationalProfileFixture),
    });
  });

  await page.route(`**/api/v1/admin/customers/${customerId}/kyc-documents/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0, kyc_status: "VERIFIED", results: [] }),
    });
  });

  await page.route(`**/api/v1/admin/subscriptions/?customer=${customerId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(subscriptionsFixture),
    });
  });

  await page.route(`**/api/v1/admin/payments/?customer=${customerId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(paymentsFixture),
    });
  });
});

test("admin Customer 360 loads operational cockpit sections and real route links", async ({ page }) => {
  await page.goto(`/admin/customers/${customerId}`);

  await expect(page.getByRole("heading", { name: "Customer 360 Smoke" })).toBeVisible();
  await expect(page.getByText("Profile Overview")).toBeVisible();
  await expect(page.getByText("Operational Finance Summary")).toBeVisible();
  await expect(page.getByText("Contracts")).toBeVisible();
  await expect(page.getByText("Advance EMI / Lucky IDs")).toBeVisible();
  await expect(page.getByText("Rent / Lease")).toBeVisible();
  await expect(page.getByText("Active Linked Subscriptions")).toBeVisible();
  await expect(page.getByText("Payment History")).toBeVisible();
  await expect(page.getByText("Direct Sale History")).toBeVisible();
  await expect(page.getByText("Receipts & Documents")).toBeVisible();

  await expect(page.getByRole("link", { name: "Open Subscription" })).toHaveAttribute(
    "href",
    "/admin/subscriptions/601",
  );
  await expect(page.getByRole("link", { name: "Collect EMI" }).first()).toHaveAttribute(
    "href",
    "/admin/finance/collect?subscription=601",
  );
  await expect(page.getByRole("link", { name: "Open Invoice" })).toHaveAttribute(
    "href",
    "/admin/billing/documents/1001",
  );

  await expect(page.getByText("RCPT-360")).toBeVisible();
  await expect(page.getByText("INV-360")).toBeVisible();
  await expect(page.getByText("AADHAAR")).toBeVisible();
  await expect(page.getByText("Smoke Partner")).toBeVisible();

  await expect(page.getByRole("button", { name: /Generate receipt/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Post journal/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Collect rent/i })).toHaveCount(0);
});

test("admin Customer 360 handles partial operational profile failure without fake values", async ({ page }) => {
  await page.route(`**/api/v1/admin/customers/${customerId}/operational-profile/`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Operational profile unavailable" }),
    });
  });

  await page.goto(`/admin/customers/${customerId}`);

  await expect(page.getByRole("heading", { name: "Customer 360 Smoke" })).toBeVisible();
  await expect(page.getByText("Data source note")).toBeVisible();
  await expect(
    page.getByText("Operational profile sections could not be loaded from the dedicated customer operations endpoint."),
  ).toBeVisible();
  await expect(page.getByText("Active Linked Subscriptions")).toBeVisible();
  await expect(page.getByText("Payment History")).toBeVisible();
  await expect(page.getByText("SUB-601")).toBeVisible();
  await expect(page.getByText("PAY-360-001")).toBeVisible();
});
