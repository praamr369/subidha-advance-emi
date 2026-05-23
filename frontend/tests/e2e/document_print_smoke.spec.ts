import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const directSaleFixture = {
  id: 101,
  sale_no: "DS-PRINT-101",
  sale_date: "2026-05-24",
  financial_year: "2026-2027",
  customer: 501,
  customer_name: "Print Smoke Customer",
  status: "INVOICED",
  tax_mode: "NON_GST",
  branch_name: "Asansol Main Branch",
  finance_account_name: "Main Cash Desk",
  billing_invoice_id: 701,
  billing_invoice_no: "DSI-2026-00001",
  billing_invoice_status: "POSTED",
  payment_state: "PARTIAL",
  receipt_status: "POSTED",
  customer_name_snapshot: "Print Smoke Customer",
  customer_phone_snapshot: "9000000101",
  customer_snapshot_email: "print.smoke@example.com",
  customer_snapshot_billing_address_line1: "Court More",
  customer_snapshot_city: "Asansol",
  customer_snapshot_state: "West Bengal",
  customer_snapshot_pincode: "713304",
  delivery_required: true,
  subtotal: "12000.00",
  discount_total: "1000.00",
  taxable_total: "11000.00",
  tax_total: "0.00",
  grand_total: "11000.00",
  received_total: "5000.00",
  balance_total: "6000.00",
  next_actions: ["COLLECT_DIRECT_SALE_BALANCE"],
  blocking_reasons: [],
  operational_state: "PAYMENT_PARTIAL",
  lines: [
    {
      id: 1,
      product: 301,
      product_code: "SF-SOFA-PRINT",
      sku_snapshot: "SOFA-PRINT-001",
      description: "Subidha Premium Sofa",
      quantity: "1.000",
      unit_price: "12000.00",
      discount_amount: "1000.00",
      taxable_value: "11000.00",
      gst_rate: null,
      cgst_amount: "0.00",
      sgst_amount: "0.00",
      igst_amount: "0.00",
      line_total: "11000.00",
    },
  ],
};

const receiptFixture = {
  id: 501,
  receipt_no: "RCT-PRINT-501",
  receipt_type: "RETAIL_RECEIPT",
  status: "POSTED",
  receipt_date: "2026-05-24",
  branch_name: "Asansol Main Branch",
  cash_counter_name: "Front Counter",
  finance_account_name: "Main Cash Desk",
  billing_invoice: 701,
  direct_sale: 101,
  direct_sale_no: "DS-PRINT-101",
  customer: 501,
  subscription: null,
  payment: null,
  source_type: "DIRECT_SALE",
  source_reference: "DSI-2026-00001",
  amount: "5000.00",
  customer_name_snapshot: "Print Smoke Customer",
  customer_phone_snapshot: "9000000101",
  notes: "Smoke receipt",
  posted_journal_entry_no: "JE-PRINT-501",
};

const emptyPage = { count: 0, next: null, previous: null, results: [] };

async function mockDocumentApis(page: Parameters<typeof test>[0]["page"]) {
  await page.route("**/billing/direct-sales/**", async (route) => {
    const url = new URL(route.request().url());
    if (/\/billing\/direct-sales\/101\/$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(directSaleFixture),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 1, next: null, previous: null, results: [directSaleFixture] }),
    });
  });
  await page.route("**/billing/receipts/501/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(receiptFixture),
    });
  });
}

async function mockWorkspaceApis(page: Parameters<typeof test>[0]["page"]) {
  await mockDocumentApis(page);
  await page.route("**/accounting/finance-accounts/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPage) });
  });
  await page.route("**/compliance/tax-profile/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ snapshot: { mode: "GST_UNREGISTERED" } }),
    });
  });
  await page.route("**/admin/inventory/requirements/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPage) });
  });
}

test("direct-sale invoice print route renders branded financial document", async ({ page }) => {
  await mockDocumentApis(page);

  await page.goto("/admin/billing/direct-sale/101/print");

  await expect(page.getByText("Subidha Furniture").first()).toBeVisible();
  await expect(page.getByText("NON-GST INVOICE")).toBeVisible();
  await expect(page.getByText("DSI-2026-00001").first()).toBeVisible();
  await expect(page.getByText("Print Smoke Customer").first()).toBeVisible();
  await expect(page.getByText("Subidha Premium Sofa")).toBeVisible();
  await expect(page.getByText("Grand Total")).toBeVisible();
  await expect(page.getByText("Received")).toBeVisible();
  await expect(page.getByText("Balance Due")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
});

test("receipt print route renders branded receipt and unsafe-status guard surface", async ({ page }) => {
  await mockDocumentApis(page);

  await page.goto("/admin/billing/receipts/501/print");

  await expect(page.getByText("Subidha Furniture").first()).toBeVisible();
  await expect(page.getByText("PAYMENT RECEIPT")).toBeVisible();
  await expect(page.getByText("RCT-PRINT-501").first()).toBeVisible();
  await expect(page.getByText("Print Smoke Customer").first()).toBeVisible();
  await expect(page.getByText("Amount Paid")).toBeVisible();
  await expect(page.getByText("Source Ref")).toBeVisible();
  await expect(page.getByText("DSI-2026-00001").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
});

test("direct-sale workspace exposes branded invoice PDF link", async ({ page }) => {
  await mockWorkspaceApis(page);

  await page.goto("/admin/billing/direct-sale");

  await expect(page.getByRole("heading", { name: "Direct Sale Workspace" })).toBeVisible();
  await expect(page.getByText("DSI-2026-00001").first()).toBeVisible();
  const printLink = page.getByRole("link", { name: "Invoice PDF" }).first();
  await expect(printLink).toBeVisible();
  await expect(printLink).toHaveAttribute("href", "/admin/billing/direct-sale/101/print");
});
