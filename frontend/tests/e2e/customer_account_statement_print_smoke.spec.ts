import { expect, type Page, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const customerFixture = {
  id: 501,
  name: "Smoke Statement Customer",
  phone: "9876543210",
  email: "statement.customer@example.test",
  address: "12 Market Road",
  city: "Asansol",
  customer_code: "CUST-501",
  status: "ACTIVE",
  kyc_status: "VERIFIED",
  created_at: "2026-05-01T09:00:00+05:30",
};

const subscriptionFixture = {
  id: 901,
  subscription_number: "SUB-STMT-901",
  customer: 501,
  customer_name: "Smoke Statement Customer",
  customer_phone: "9876543210",
  plan_type: "ADVANCE_EMI",
  product_name: "Dining Set",
  product_code: "DIN-01",
  batch_code: "BATCH-MAY",
  lucky_number: 27,
  lucky_id: 2701,
  status: "ACTIVE",
  tenure_months: 10,
  monthly_amount: "2000.00",
  total_amount: "20000.00",
  financial_summary: {
    paid_amount: "6000.00",
    outstanding_amount: "14000.00",
    emi_count_paid: 3,
    emi_count_pending: 7,
  },
};

const paymentFixture = {
  id: 701,
  reference_no: "PAY-STMT-701",
  receipt_no: "RCPT-STMT-701",
  payment_date: "2026-05-20",
  source_module: "ADVANCE_EMI",
  source_reference: "SUB-STMT-901",
  method: "UPI",
  amount: "2000.00",
  status: "POSTED",
  subscription: 901,
  subscription_number: "SUB-STMT-901",
};

const emptyOperationalProfile = {
  overview: {
    subscription_count: 1,
    active_subscriptions: 1,
    historical_subscriptions: 0,
    active_contract_value: "20000.00",
    historical_contract_value: "0.00",
    subscription_outstanding_amount: "14000.00",
    direct_sale_count: 0,
    active_direct_sale_count: 0,
    returned_direct_sale_count: 0,
    direct_sale_outstanding_count: 0,
    direct_sale_outstanding_total: "0.00",
    receipt_count: 1,
    receipt_total: "2000.00",
    invoice_count: 0,
    active_invoice_count: 0,
    historical_invoice_count: 0,
    invoice_outstanding_total: "0.00",
    lead_count: 0,
    lead_open_count: 0,
    quotation_estimate_count: 0,
  },
  direct_sales: { summary: { total_count: 0, active_count: 0, history_count: 0, outstanding_count: 0, gross_total: "0.00", received_total: "0.00", outstanding_total: "0.00" }, rows: [] },
  contract_references: { summary: { total_count: 0, advance_emi_count: 0, rent_count: 0, lease_count: 0, direct_sale_count: 0 }, rows: [] },
  ledger_summary: { entry_count: 0, total_credits: "0.00", total_debits: "0.00", net_subscription_collections: "2000.00", active_ledger_credits: "2000.00", active_ledger_debits: "0.00", direct_sale_receivable_total: "0.00" },
  receipts_documents: { summary: { receipt_count: 1, receipt_total: "2000.00", active_receipt_count: 1, active_receipt_total: "2000.00", document_count: 0, invoice_count: 0, invoice_posted_count: 0, invoice_total: "0.00", invoice_outstanding_total: "0.00" }, receipts: [], invoices: [], documents: [] },
  leads: { summary: { total_count: 0, open_count: 0, converted_count: 0, quotation_count: 0, estimate_count: 0, follow_up_required_count: 0, follow_up_due_count: 0 }, rows: [] },
  quotation_estimates: { summary: { total_count: 0, quotation_count: 0, estimate_count: 0 }, rows: [] },
  partner_linkages: { count: 0, rows: [] },
};

const emptyPage = { count: 0, next: null, previous: null, results: [] };

async function mockCustomerStatementApis(page: Page) {
  await page.route("**/admin/customers/501/", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(customerFixture) });
  });
  await page.route("**/admin/subscriptions/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 1, next: null, previous: null, results: [subscriptionFixture] }),
    });
  });
  await page.route("**/admin/payments/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 1, next: null, previous: null, total_paid_amount: "6000.00", results: [paymentFixture] }),
    });
  });
  await page.route("**/admin/customers/501/operational-profile/", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyOperationalProfile) });
  });
  await page.route("**/admin/customers/501/kyc-documents/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPage) });
  });
}

async function expectNoDashboardChrome(page: Page) {
  await expect(page.getByRole("button", { name: "Open quick actions" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Open command palette/i })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /sidebar navigation/i })).toHaveCount(0);
}

test("customer account statement print route renders read-only customer evidence document", async ({ page }) => {
  await mockCustomerStatementApis(page);

  await page.goto("/admin/customers/501/statement/print?start_date=2026-05-01&end_date=2026-05-24");

  await expect(page.getByText("Subidha Furniture").first()).toBeVisible();
  await expect(page.getByText("CUSTOMER ACCOUNT STATEMENT")).toBeVisible();
  await expect(page.getByText("Smoke Statement Customer").first()).toBeVisible();
  await expect(page.getByText("9876543210").first()).toBeVisible();
  await expect(page.getByText("12 Market Road").first()).toBeVisible();
  await expect(page.getByText("CUST-501").first()).toBeVisible();
  await expect(page.getByText("Subscription / Contract Section")).toBeVisible();
  await expect(page.getByText("SUB-STMT-901").first()).toBeVisible();
  await expect(page.getByText("Dining Set")).toBeVisible();
  await expect(page.getByText("Payment / Receipt Section")).toBeVisible();
  await expect(page.getByText("PAY-STMT-701")).toBeVisible();
  await expect(page.getByText("RCPT-STMT-701")).toBeVisible();
  await expect(page.getByText(/₹2,000\.00/).first()).toBeVisible();
  await expect(page.getByText("Backend-Reported Total Paid")).toBeVisible();
  await expect(page.getByText(/₹6,000\.00/).first()).toBeVisible();
  await expect(page.getByText("This document does not calculate running balance.")).toBeVisible();
  await expect(page.getByText("Direct-sale/rent-lease totals are not inferred.")).toBeVisible();
  await expect(page.getByText(/^Running Balance$/i)).toHaveCount(0);
  await expect(page.getByText("Generated by SUBIDHA CORE")).toBeVisible();
  await expect(page.getByText("Prepared By Signature")).toBeVisible();
  await expect(page.getByText("Customer Acknowledgement Signature")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to customer record" })).toBeVisible();
  await expectNoDashboardChrome(page);

  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to customer record" })).toBeHidden();
  await expect(page.getByText("Generated from customer detail, customer-filtered payments, and customer-matched subscription rows only.")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
});

test("customer detail exposes account statement print link", async ({ page }) => {
  await mockCustomerStatementApis(page);

  await page.goto("/admin/customers/501");

  const link = page.getByRole("link", { name: "Customer Account Statement PDF / Print" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/admin/customers/501/statement/print");
});
