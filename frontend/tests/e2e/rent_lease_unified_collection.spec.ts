import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.describe("rent/lease unified collection routing", () => {
  test.use({ storageState: authStatePath("admin") });

  test("admin unified search renders rent lease collection CTA from backend route", async ({ page }) => {
    await page.route("**/api/v1/admin/business-setup/checklist/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ is_ready_for_go_live: true, percent_complete: 100, counts: {}, items: [] }),
      });
    });
    await page.route("**/api/v1/admin/branches/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
    });
    await page.route("**/api/v1/admin/cash-counters/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
    });
    await page.route("**/api/v1/admin/finance-accounts/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
    });
    await page.route("**/api/v1/admin/receivables/search/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: 1,
          results: [
            {
              contract_reference_id: 91,
              result_type: "RENT",
              action_type: "COLLECT_RENT_LEASE",
              collectible: true,
              collection_workflow: "RENT_MONTHLY",
              reason_if_not_collectible: null,
              source_type: "RENT",
              source_id: 77,
              reference_no: "SUB/RENT/2026/00001",
              display_reference: "SUB/RENT/2026/00001",
              customer_id: 22,
              customer_name: "Smoke Customer",
              phone_masked: "******1234",
              product_summary: "Rent Sofa",
              due_amount: "1000.00",
              paid_amount: "0.00",
              total_amount: "6000.00",
              overdue_amount: "0.00",
              next_due_date: "2026-06-01",
              due_date: "2026-06-01",
              status: "PENDING",
              payment_state: "UNPAID",
              primary_action: "COLLECT_RENT_LEASE",
              allowed_actions: ["COLLECT_RENT_LEASE"],
              disabled_reason: null,
              collection_route: "/admin/finance/collect?workflow=unified&subscription=77",
              action_url: "/admin/finance/collect?workflow=unified&subscription=77",
              demand_id: 101,
              demand_type: "RENT_MONTHLY",
            },
          ],
        }),
      });
    });

    await page.goto("/admin/finance/collect?workflow=unified");

    await expect(page.getByRole("heading", { name: "Payment Collection" })).toBeVisible();
    await expect(page.locator("body")).toContainText("rent/lease source collections");
    await page.getByPlaceholder(/Phone, IDs/i).fill("9101000004");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("SUB/RENT/2026/00001")).toBeVisible();
    await expect(page.getByTestId("unified-receivable-open-rent-lease-link")).toHaveAttribute(
      "href",
      "/admin/finance/collect?workflow=unified&subscription=77"
    );
    await expect(page.getByTestId("unified-receivable-open-rent-lease-link")).toContainText(
      "Open rent/lease collection"
    );
  });
});
