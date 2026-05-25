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
  applied_at: null,
  metadata: { ui_phase: "PHASE_2_REQUEST_ONLY" },
  created_at: "2026-05-26T10:00:00Z",
  updated_at: null,
};

async function mockAmendments(page: Page, role: "customer" | "partner" | "admin") {
  await page.route(`**/api/v1/${role}/contract-amendments/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(amendmentFixture),
      });
      return;
    }

    if (/\/contract-amendments\/1\/?$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(amendmentFixture),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 1, results: [amendmentFixture] }),
    });
  });
}

test.describe("customer contract amendment phase-2 UI", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer amendment list loads and exposes only customer navigation", async ({ page }) => {
    await mockAmendments(page, "customer");
    await page.goto("/customer/contract-amendments");

    await expect(page.getByRole("heading", { name: "My amendment requests" })).toBeVisible();
    await expect(page.getByText("Decision-only amendment phase")).toBeVisible();
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

    await expect(page.getByRole("heading", { name: "Customer amendment requests" })).toBeVisible();
    await expect(page.getByText("Decision-only amendment phase")).toBeVisible();
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

    await expect(page.getByRole("heading", { name: "Contract Amendments" })).toBeVisible();
    await expect(page.getByText("Decision-only amendment phase")).toBeVisible();
    await expect(page.getByText("AMD-SMOKE-001")).toBeVisible();

    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("link", { name: "Contract Amendments", exact: true }).first()).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "My amendment requests", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Customer amendment requests", exact: true })).toHaveCount(0);
  });

  test("admin amendment detail has no implementation action", async ({ page }) => {
    await mockAmendments(page, "admin");
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByRole("heading", { name: "AMD-SMOKE-001" })).toBeVisible();
    await expect(page.getByText("Workflow stops at admin decision in this phase.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve decision" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply|Implement|Execute|Update contract/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Apply|Implement|Execute|Update contract/i })).toHaveCount(0);
  });
});
