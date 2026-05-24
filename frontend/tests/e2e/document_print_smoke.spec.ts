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

const deliveryFixture = {
  id: 901,
  case_id: 901,
  service_case_id: 901,
  case_no: "CASE-DEL-901",
  record_kind: "DIRECT_SALE_DELIVERY",
  source_type: "DIRECT_SALE",
  source_label: "DS-PRINT-101",
  delivery_reference: "DCH-PRINT-901",
  sale_no: "DS-PRINT-101",
  sale_number: "DS-PRINT-101",
  direct_sale_id: 101,
  invoice_number: "DSI-2026-00001",
  invoice_document_no: "DSI-2026-00001",
  billing_invoice_id: 701,
  customer_id: 501,
  customer_name: "Print Smoke Customer",
  customer_phone: "9000000101",
  receiver_name: "Receiver Smoke",
  receiver_phone: "9000000202",
  delivery_address_snapshot: "Court More\nAsansol, West Bengal 713304",
  product_id: 301,
  product_name: "Subidha Premium Sofa",
  product_code: "SF-SOFA-PRINT",
  status: "SCHEDULED",
  status_label: "Scheduled",
  delivery_display: "Ready for delivery",
  delivery_state: "READY_FOR_DELIVERY",
  delivery_phase_code: "READY_FOR_DELIVERY",
  payment_state: "PARTIAL",
  invoice_state: "POSTED",
  stock_state: "AVAILABLE",
  scheduled_date: "2026-05-25",
  delivered_at: null,
  grand_total: "11000.00",
  received_total: "5000.00",
  balance_total: "6000.00",
  operational_notes: "Handle with care.",
  blocked_by_payment: false,
  blocked_by_stock: false,
  payment_exception_approved_at: "2026-05-24T10:30:00+05:30",
  payment_exception_approved_by_username: "admin",
  payment_exception_reason: "Manager approved delivery before final collection.",
  payment_exception_outstanding_amount_snapshot: "6000.00",
  links: {
    open_invoice: "/admin/billing/documents/701",
    open_direct_sale: "/admin/billing/direct-sale?highlight_sale=101",
    open_customer: "/admin/customers/501",
    open_service_case: "/admin/service-desk/cases/901",
  },
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
  await page.route("**/admin/deliveries/direct-sale-cases/901/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deliveryFixture),
    });
  });
  await page.route("**/admin/audit-logs/timeline/ServiceDeskCase/901/", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPage) });
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

test("direct-sale delivery challan print route renders branded challan", async ({ page }) => {
  await mockDocumentApis(page);

  await page.goto("/admin/deliveries/direct-sale-cases/901/print");

  await expect(page.getByText("Subidha Furniture").first()).toBeVisible();
  await expect(page.getByText("DELIVERY CHALLAN")).toBeVisible();
  await expect(page.getByText("DCH-PRINT-901").first()).toBeVisible();
  await expect(page.getByText("Print Smoke Customer").first()).toBeVisible();
  await expect(page.getByText("Receiver Smoke").first()).toBeVisible();
  await expect(page.getByText("DSI-2026-00001").first()).toBeVisible();
  await expect(page.getByText("Court More").first()).toBeVisible();
  await expect(page.getByText("Ready for delivery").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
  await expect(page.getByText("Delivery documents")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Delivery Challan / Print" })).toHaveCount(0);
});

test("direct-sale delivery detail exposes delivery challan print link", async ({ page }) => {
  await mockDocumentApis(page);

  await page.goto("/admin/deliveries/direct-sale-cases/901");

  const challanLink = page.getByRole("link", { name: "Delivery Challan / Print" }).first();
  await expect(challanLink).toBeVisible();
  await expect(challanLink).toHaveAttribute("href", "/admin/deliveries/direct-sale-cases/901/print");
});
