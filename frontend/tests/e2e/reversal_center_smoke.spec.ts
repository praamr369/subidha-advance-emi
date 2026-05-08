import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("reversal center loads", async ({ page }) => {
  await page.goto("/admin/billing/reversals");
  await expect(page.getByRole("heading", { name: "Returns, Voids & Reversal Center" })).toBeVisible();
});

test("cancel and void actions require reason", async ({ page }) => {
  await page.goto("/admin/billing/reversals");
  await page.getByRole("button", { name: "Cancel Sale" }).click();
  await expect(page.locator("body")).toContainText("Cancel reason is required");

  await page.getByRole("button", { name: "Void Receipt" }).click();
  await expect(page.locator("body")).toContainText("Void reason is required");
});

test("return and refund forms render with required controls", async ({ page }) => {
  await page.goto("/admin/billing/reversals");
  await expect(page.getByRole("button", { name: "Create Return" })).toBeVisible();
  await expect(page.getByPlaceholder("Sale Line ID", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Return Kind")).toBeVisible();
  await expect(page.getByLabel("Stock Destination", { exact: true })).toBeVisible();

  await expect(page.getByText("Exchange Product")).toBeVisible();
  await expect(page.getByPlaceholder("Old Sale Line ID")).toHaveCount(0);
  await expect(page.getByPlaceholder("New Inventory Item ID")).toHaveCount(0);
  await expect(page.getByPlaceholder("Search replacement by product/SKU")).toBeVisible();

  await expect(page.getByRole("button", { name: "View Return Eligibility" })).toBeVisible();
  await expect(page.getByPlaceholder("Direct Sale ID").first()).toBeVisible();

  await expect(page.getByRole("button", { name: "Create Refund" })).toBeVisible();
  await expect(page.getByPlaceholder("Finance Account ID")).toBeVisible();

  await page.getByRole("button", { name: "Create Refund" }).click();
  await expect(page.locator("body")).toContainText("Refund method and finance account are required");
});

test("voided receipt does not force reverse-linked-receipts messaging in invoice cancel modal", async ({ page }) => {
  await page.route("**/api/v1/billing/invoices/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 101,
            document_no: "INV-2026-27-00001",
            invoice_date: "2026-04-15",
            financial_year: "2026-27",
            document_type: "INVOICE",
            customer: 1,
            customer_name: "Smoke Customer",
            direct_sale: 1,
            direct_sale_no: "SALE-2026-27-00001",
            billing_channel: "RETAIL",
            source_type: "DIRECT_SALE",
            source_reference: "SALE-2026-27-00001",
            tax_mode: "NON_GST",
            status: "POSTED",
            subtotal: "21000.00",
            discount_total: "0.00",
            taxable_total: "21000.00",
            tax_total: "0.00",
            grand_total: "21000.00",
            received_total: "0.00",
            balance_total: "21000.00",
            active_receipt_total: "0.00",
            void_receipt_total: "21000.00",
            customer_name_snapshot: "Smoke Customer",
            customer_phone_snapshot: "9000000000",
            next_actions: [],
            blocking_reasons: [],
            lines: [],
          },
        ],
      }),
    });
  });

  await page.goto("/admin/billing/invoices");
  await page.getByRole("button", { name: "Void invoice" }).click();
  await expect(page.getByText("Admin Audited Cancellation")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Receipt reversal is required before financial closure.");
});

test("delivered direct sale workspace shows return and exchange actions", async ({ page }) => {
  await page.route("**/api/v1/accounting/finance-accounts/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }) });
  });
  await page.route("**/api/v1/billing/direct-sales/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            sale_no: "SALE-2026-27-00001",
            sale_date: "2026-04-15",
            financial_year: "2026-27",
            status: "INVOICED",
            tax_mode: "NON_GST",
            delivery_required: true,
            delivered_at: "2026-04-16T10:00:00Z",
            subtotal: "21000.00",
            discount_total: "0.00",
            taxable_total: "21000.00",
            tax_total: "0.00",
            grand_total: "21000.00",
            received_total: "0.00",
            balance_total: "21000.00",
            active_receipt_total: "0.00",
            void_receipt_total: "21000.00",
            receipt_status: "VOID",
            billing_invoice_id: 101,
            billing_invoice_no: "INV-2026-27-00001",
            billing_invoice_status: "POSTED",
            operational_state: "DELIVERED_COMPLETE",
            delivery_status: "DELIVERED",
            next_actions: [],
            blocking_reasons: [],
            payment_state: "PARTIAL",
            inventory_state: "FULFILLED",
            collection_state: "COLLECTIBLE",
            lines: [],
          },
        ],
      }),
    });
  });
  await page.route("**/api/v1/admin/inventory/requirements/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }) });
  });

  await page.goto("/admin/billing/direct-sale");
  await expect(page.getByRole("link", { name: "Return Product" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Exchange Product" })).toBeVisible();
  await expect(page.getByText("VOID")).toBeVisible();
});

test("return eligibility panel shows allowed post-sale actions", async ({ page }) => {
  await page.route("**/api/v1/admin/billing/returns/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
  });
  await page.route("**/api/v1/admin/billing/direct-sales/1/return-eligibility/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        direct_sale_id: 1,
        sale_no: "SALE-2026-27-00001",
        customer_name: "Smoke Customer",
        sale_status: "INVOICED",
        invoice_status: "POSTED",
        delivery_status: "DELIVERED",
        active_receipt_total: "0.00",
        void_receipt_total: "21000.00",
        outstanding_balance: "21000.00",
        receipt_summary: {
          posted_receipt_count: 0,
          posted_receipt_total: "0.00",
          received_total: "0.00",
          balance_total: "21000.00",
        },
        allowed_actions: ["RETURN_PRODUCT", "EXCHANGE_PRODUCT"],
        blocking_reasons: ["Delivered direct sales must use return or exchange workflow."],
        sold_lines: [],
        return_lines: [{ sale_line_id: 77, product_id: 8, product_name: "Chair", sku: "CHAIR-01", inventory_item_id: 9, sold_quantity: "1.000", already_returned_quantity: "0.000", returnable_quantity: "1.000", default_return_quantity: "1.000", unit_price: "1000.00", line_total: "1000.00" }],
        stock_destinations: [{ id: 5, name: "Inspection", code: "INSP", type: "INSPECTION", is_sellable: false, requires_condition_confirmation: false }],
        default_stock_destination_id: 5,
        can_finalize_reversal: false,
        finalize_blocking_reasons: ["Invoice must be reversed/voided first"],
        workflow_steps: [
          { key: "RECEIPT_VOIDED", label: "Receipt voided", status: "DONE" },
          { key: "INVOICE_REVERSED_OR_VOIDED", label: "Invoice reversed/voided", status: "DONE" },
        ],
      }),
    });
  });

  await page.goto("/admin/billing/reversals");
  const eligibilityCard = page
    .locator("div.rounded.border.p-3")
    .filter({ has: page.getByText("View Return Eligibility") })
    .first();
  await eligibilityCard.getByPlaceholder("Direct Sale ID").fill("1");
  await eligibilityCard.getByRole("button", { name: "View Return Eligibility" }).click();
  await expect(page.locator("body")).toContainText("Allowed actions: RETURN_PRODUCT, EXCHANGE_PRODUCT");
  await expect(page.locator("body")).toContainText("Receipts: active 0.00 · void 21000.00 · Outstanding 21000.00");
  await expect(page.locator("body")).toContainText("Workflow checklist");
  await expect(page.locator("body")).toContainText("Finalize blockers");
});

test("create return disabled when stock setup missing", async ({ page }) => {
  await page.route("**/api/v1/admin/billing/returns/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
  });
  await page.route("**/api/v1/admin/billing/direct-sales/1/return-eligibility/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        direct_sale_id: 1,
        sale_status: "DELIVERED",
        invoice_status: "VOID",
        delivery_status: "DELIVERED",
        active_receipt_total: "0.00",
        void_receipt_total: "21000.00",
        outstanding_balance: "0.00",
        receipt_summary: { posted_receipt_count: 0, posted_receipt_total: "0.00", received_total: "0.00", balance_total: "0.00", active_receipt_count: 0, void_receipt_count: 1 },
        allowed_actions: ["RETURN_PRODUCT", "EXCHANGE_PRODUCT"],
        return_lines: [{ sale_line_id: 77, product_id: 8, product_name: "Chair", sku: "CHAIR-01", inventory_item_id: 9, sold_quantity: "1.000", already_returned_quantity: "0.000", returnable_quantity: "1.000", default_return_quantity: "1.000", unit_price: "1000.00", line_total: "1000.00" }],
        stock_setup_required: true,
        stock_setup_message: "Create INSPECTION, DAMAGED, and SERVICE stock locations before processing returns.",
        missing_location_types: ["INSPECTION", "DAMAGED", "SERVICE"],
        can_create_return: false,
        can_finalize_reversal: false,
        workflow_steps: [],
        sold_lines: [],
      }),
    });
  });
  await page.goto("/admin/billing/reversals?direct_sale=1");
  await expect(page.getByText("Create INSPECTION, DAMAGED, and SERVICE stock locations before processing returns.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Return" })).toBeDisabled();
});

test("direct sale query hides raw id fields and allows return when eligible", async ({ page }) => {
  await page.route("**/api/v1/admin/billing/returns/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
  });
  await page.route("**/api/v1/admin/billing/direct-sales/1/return-eligibility/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        direct_sale_id: 1,
        sale_no: "SALE-2026-27-00001",
        customer_name: "Amrita Roy",
        sale_status: "INVOICED",
        invoice_status: "VOID",
        delivery_status: "DELIVERED",
        active_receipt_total: "0.00",
        void_receipt_total: "21000.00",
        outstanding_balance: "21000.00",
        receipt_summary: { posted_receipt_count: 0, posted_receipt_total: "0.00", received_total: "0.00", balance_total: "21000.00", active_receipt_count: 0, void_receipt_count: 1 },
        allowed_actions: ["RETURN_PRODUCT", "EXCHANGE_PRODUCT"],
        can_create_return: true,
        can_create_exchange: true,
        can_finalize_reversal: false,
        finalize_blocking_reasons: ["Delivered lines still have returnable quantity. Post SALE_RETURN_IN first."],
        return_lines: [{ sale_line_id: 77, product_id: 8, product_name: "Chair", sku: "CHAIR-01", inventory_item_id: 9, sold_quantity: "1.000", already_returned_quantity: "0.000", returnable_quantity: "1.000", default_return_quantity: "1.000", unit_price: "1000.00", line_total: "1000.00" }],
        stock_destinations: [{ id: 5, name: "Inspection", code: "INSP", type: "INSPECTION", is_sellable: false, requires_condition_confirmation: false }],
        default_stock_destination_id: 5,
        workflow_steps: [
          { key: "RECEIPT_VOIDED", label: "Receipt voided", status: "DONE" },
          { key: "INVOICE_REVERSED_OR_VOIDED", label: "Invoice reversed/voided", status: "DONE" },
          { key: "PRODUCT_RETURNED_TO_STOCK", label: "Product returned to stock", status: "REQUIRED" },
          { key: "FINALIZE_ARCHIVE", label: "Finalize/archive sale", status: "BLOCKED" },
        ],
        sold_lines: [],
      }),
    });
  });
  await page.goto("/admin/billing/reversals?direct_sale=1");
  await expect(page.getByPlaceholder("Direct Sale ID")).toHaveCount(1); // only eligibility viewer field
  await expect(page.getByRole("button", { name: "Create Return" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Finalize Full Cancellation / Archive Sale" })).toBeDisabled();
});
