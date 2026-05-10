import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("admin outstanding ledger loads, filters, and exposes export link", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/outstandings/**", async (route) => {
    const url = new URL(route.request().url());
    const operation = url.searchParams.get("operation") || "all";
    const state = url.searchParams.get("state") || "all";
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const rows = [
      {
        id: "EMI-1",
        operation_type: "advance_emi",
        source_type: "EMI",
        source_id: 1,
        customer_id: 10,
        customer_name: "Filter Customer",
        customer_phone: "01700000000",
        contract_reference: "SUB-1",
        document_no: "",
        product_summary: "Chair",
        batch_code: "B1",
        lucky_number: "01",
        due_date: "2026-04-01",
        original_amount: "1000.00",
        paid_amount: "0.00",
        waived_amount: "0.00",
        outstanding_amount: "1000.00",
        overdue_days: 12,
        age_bucket: "8_15",
        status: "OVERDUE",
        collection_allowed: true,
        detail_url: "/admin/subscriptions/1",
        customer_url: "/admin/customers/10",
        payment_url: "/admin/finance/collect?workflow=advance-emi&subscription=1&emi=1",
        risk_flags: [],
      },
      {
        id: "DIRECT-SALE-2",
        operation_type: "direct_sale",
        source_type: "DIRECT_SALE",
        source_id: 2,
        customer_id: 11,
        customer_name: "Sale Customer",
        customer_phone: "01800000000",
        contract_reference: "SALE-2",
        document_no: "INV-2",
        product_summary: "Table",
        batch_code: null,
        lucky_number: null,
        due_date: "2026-06-01",
        original_amount: "2000.00",
        paid_amount: "500.00",
        waived_amount: "0.00",
        outstanding_amount: "1500.00",
        overdue_days: 0,
        age_bucket: "current",
        status: "DUE",
        collection_allowed: true,
        detail_url: "/admin/billing/direct-sales/2",
        customer_url: "/admin/customers/11",
        payment_url: "/admin/finance/collect?workflow=direct-sale&direct_sale_id=2",
        risk_flags: [],
      },
    ];
    const filtered = rows.filter((row) => {
      if (operation !== "all" && row.operation_type !== operation) return false;
      if (state === "overdue" && row.overdue_days <= 0) return false;
      if (q && !row.customer_name.toLowerCase().includes(q)) return false;
      return true;
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: filtered.length,
        page: 1,
        page_size: 100,
        results: filtered,
        summary: {
          total_outstanding_amount: "2500.00",
          overdue_amount: "1000.00",
          due_today_amount: "0.00",
          upcoming_amount: "1500.00",
          advance_emi_outstanding: "1000.00",
          rent_outstanding: "0.00",
          lease_outstanding: "0.00",
          direct_sale_outstanding: "1500.00",
          billing_invoice_outstanding: "0.00",
          overdue_count: 1,
          serious_30_plus_count: 0,
        },
      }),
    });
  });

  await page.goto("/admin/outstandings");
  const workspace = page.locator("#main-content");
  await expect(
    page.getByRole("heading", { name: "Outstanding Ledger" })
  ).toBeVisible();
  await expect(page.getByText("Filter Customer")).toBeVisible();
  await workspace.getByRole("combobox").nth(0).selectOption("advance_emi");
  await expect(page.getByText("Sale Customer")).not.toBeVisible();
  await workspace.getByRole("combobox").nth(1).selectOption("overdue");
  await page.getByPlaceholder("Search customer/reference/product").fill("filter");
  await expect(page.getByText("Filter Customer")).toBeVisible();

  const exportLink = page.getByRole("link", { name: "Export CSV" });
  await expect(exportLink).toBeVisible();
  await expect(exportLink).toHaveAttribute(
    "href",
    /\/api\/v1\/admin\/outstandings\/export\.csv/
  );
});
