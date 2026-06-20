import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const vendorFixture = {
  id: 701,
  vendor_code: "VEN-PRINT-701",
  name: "Print Vendor Industries",
  display_name: "Print Vendor Industries",
  legal_name: "Print Vendor Industries Pvt Ltd",
  contact_person: "Vendor Contact",
  phone: "9000000701",
  email: "vendor.print@example.com",
  gstin: "19ABCDE1234F1Z5",
  status: "ACTIVE",
  is_active: true,
  addresses: [
    {
      id: 1,
      vendor: 701,
      address_type: "BILLING",
      address_line1: "Vendor Market Road",
      address_line2: "Industrial Area",
      city: "Asansol",
      district: "Paschim Bardhaman",
      state: "West Bengal",
      pincode: "713301",
      is_primary: true,
    },
  ],
  service_areas: [],
  products: [],
  categories: [],
};

const vendorOutstandingFixture = {
  vendor_id: 701,
  opening_balance: "0.00",
  purchase_bills: "12000.00",
  vendor_payments: "5000.00",
  purchase_returns: "0.00",
  debit_notes: "0.00",
  adjustments: "0.00",
  outstanding: "7000.00",
};

const vendorBillFixture = {
  id: 301,
  bill_no: "VB-PRINT-301",
  bill_date: "2026-05-24",
  vendor: 701,
  vendor_name: "Print Vendor Industries",
  purchase_order: 201,
  purchase_order_no: "PO-PRINT-201",
  goods_receipt: 251,
  goods_receipt_no: "GRN-PRINT-251",
  finance_account: 11,
  finance_account_name: "Main Bank Account",
  status: "CANCELLED",
  subtotal: "10000.00",
  tax_total: "2000.00",
  grand_total: "12000.00",
  posted_journal_entry: null,
  posted_journal_entry_no: null,
  notes: "Cancelled supplier bill retained for audit.",
  lines: [
    {
      id: 1,
      inventory_item: 91,
      inventory_item_sku: "RAW-WOOD-001",
      inventory_item_product_name: "Premium Wood Panel",
      description: "Premium Wood Panel",
      quantity: "10.000",
      unit_cost: "1000.00",
      taxable_value: "10000.00",
      tax_amount: "2000.00",
      line_total: "12000.00",
    },
  ],
  created_at: "2026-05-24T09:00:00+05:30",
  updated_at: "2026-05-24T09:00:00+05:30",
};

const vendorPaymentFixture = {
  id: 401,
  payment_no: "VPAY-PRINT-401",
  payment_date: "2026-05-25",
  vendor: 701,
  vendor_name: "Print Vendor Industries",
  vendor_bill: 301,
  vendor_bill_no: "VB-PRINT-301",
  amount: "5000.00",
  finance_account: 11,
  finance_account_name: "Main Bank Account",
  status: "POSTED",
  posted_journal_entry: 88,
  posted_journal_entry_no: "JE-VPAY-401",
  reference_no: "UTR-VPAY-401",
  notes: "Partial supplier payment.",
  created_at: "2026-05-25T09:00:00+05:30",
  updated_at: "2026-05-25T09:00:00+05:30",
};

const emptyPage = { count: 0, next: null, previous: null, results: [] };

async function mockPurchaseVendorDocumentApis(page: Parameters<typeof test>[0]["page"]) {
  await page.route("**/api/v1/admin/vendors/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/vendors/701/outstanding/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(vendorOutstandingFixture) });
    } else if (url.includes("/vendors/701/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(vendorFixture) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPage) });
    }
  });
  await page.route("**/api/v1/inventory/vendor-payments/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/vendor-payments/401/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(vendorPaymentFixture) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 1, next: null, previous: null, results: [vendorPaymentFixture] }) });
    }
  });
  await page.route("**/api/v1/inventory/vendor-bills/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/vendor-bills/301/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(vendorBillFixture) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 1, next: null, previous: null, results: [vendorBillFixture] }) });
    }
  });
}

async function expectNoDashboardChrome(page: Parameters<typeof test>[0]["page"]) {
  await expect(page.getByRole("button", { name: "Open quick actions" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Open command palette/i })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /sidebar navigation/i })).toHaveCount(0);
}

async function expectPrintControlsHiddenDuringPrint(page: Parameters<typeof test>[0]["page"], backLinkName: string, helperText: string) {
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: backLinkName })).toBeHidden();
  await expect(page.getByText(helperText)).toBeHidden();
  await page.emulateMedia({ media: "screen" });
}

test("purchase bill print route renders branded vendor bill with unsafe status guard", async ({ page }) => {
  await mockPurchaseVendorDocumentApis(page);

  await page.goto("/admin/purchases/301/bill/print");

  await expect(page.getByText("Subidha Furniture").first()).toBeVisible();
  await expect(page.getByText("PURCHASE BILL / VENDOR BILL")).toBeVisible();
  await expect(page.getByText("VB-PRINT-301").first()).toBeVisible();
  await expect(page.getByText("CANCELLED").first()).toBeVisible();
  await expect(page.getByText("This purchase bill is CANCELLED")).toBeVisible();
  await expect(page.getByText("Print Vendor Industries")).toBeVisible();
  await expect(page.getByText("Premium Wood Panel").first()).toBeVisible();
  await expect(page.getByText("RAW-WOOD-001").first()).toBeVisible();
  await expect(page.getByText("Grand Total").first()).toBeVisible();
  await expect(page.getByText("Vendor Outstanding").first()).toBeVisible();
  await expect(page.getByText("Vendor payable remains outstanding").first()).toBeVisible();
  await expect(page.getByText("Vendor Acknowledgement Signature").first()).toBeVisible();
  await expect(page.getByText("Authorized Signature").first()).toBeVisible();
  await expect(page.getByText("Generated by SUBIDHA CORE").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to vendor bills" })).toBeVisible();
  await expectNoDashboardChrome(page);
  await expectPrintControlsHiddenDuringPrint(page, "Back to vendor bills", "Read-only purchase bill print generated from existing backend payloads.");
});

test("vendor payment voucher print route renders branded payment voucher", async ({ page }) => {
  await mockPurchaseVendorDocumentApis(page);

  await page.goto("/admin/vendors/payments/401/voucher/print");

  await expect(page.getByText("Subidha Furniture").first()).toBeVisible();
  await expect(page.getByText("VENDOR PAYMENT VOUCHER").first()).toBeVisible();
  await expect(page.getByText("VPAY-PRINT-401").first()).toBeVisible();
  await expect(page.getByText("Print Vendor Industries").first()).toBeVisible();
  await expect(page.getByText("Main Bank Account").first()).toBeVisible();
  await expect(page.getByText("UTR-VPAY-401").first()).toBeVisible();
  await expect(page.getByText("VB-PRINT-301").first()).toBeVisible();
  await expect(page.getByText("Paid Amount")).toBeVisible();
  await expect(page.getByText("Payable Balance After Payment")).toBeVisible();
  await expect(page.getByText("Vendor Receiver Signature").first()).toBeVisible();
  await expect(page.getByText("Authorized Signature").first()).toBeVisible();
  await expect(page.getByText("Generated by SUBIDHA CORE").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to vendor payments" })).toBeVisible();
  await expectNoDashboardChrome(page);
  await expectPrintControlsHiddenDuringPrint(page, "Back to vendor payments", "Read-only vendor payment voucher generated from existing backend payloads.");
});

test("vendor bills list exposes purchase bill print link", async ({ page }) => {
  await mockPurchaseVendorDocumentApis(page);

  await page.goto("/admin/purchases/bills");

  await expect(page.getByText("VB-PRINT-301")).toBeVisible();
  const printLink = page.getByRole("link", { name: "Purchase Bill PDF / Print" }).first();
  await expect(printLink).toBeVisible();
  await expect(printLink).toHaveAttribute("href", "/admin/purchases/301/bill/print");
});

test("vendor payments list exposes voucher print link", async ({ page }) => {
  await mockPurchaseVendorDocumentApis(page);

  await page.goto("/admin/purchases/vendor-payments");

  await expect(page.getByText("VPAY-PRINT-401")).toBeVisible();
  const printLink = page.getByRole("link", { name: "Vendor Payment Voucher PDF / Print" }).first();
  await expect(printLink).toBeVisible();
  await expect(printLink).toHaveAttribute("href", "/admin/vendors/payments/401/voucher/print");
});
