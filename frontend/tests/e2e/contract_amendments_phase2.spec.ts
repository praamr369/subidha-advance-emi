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
  is_implementable: false,
  implementation_block_reason: "Implementation requires APPROVED status.",
  implementable_fields: [],
  applied_at: null,
  metadata: { ui_phase: "PHASE_2_REQUEST_ONLY" },
  created_at: "2026-05-26T10:00:00Z",
  updated_at: null,
};

const approvedSafeAmendmentFixture = {
  ...amendmentFixture,
  status: "APPROVED",
  approved_values: { address: "New smoke address" },
  is_implementable: true,
  implementation_block_reason: "",
  implementable_fields: ["address", "city"],
};

const approvedProductChangeFixture = {
  ...amendmentFixture,
  amendment_type: "PRODUCT_CHANGE",
  status: "APPROVED",
  old_values: { product_id: 2001, product_name: "Old Sofa" },
  requested_values: { approved_product_id: 2002, approved_product_name: "New Sofa", approved_product_code: "SOFA-NEW" },
  approved_values: { approved_product_id: 2002, approved_product_name: "New Sofa", approved_product_code: "SOFA-NEW" },
  is_implementable: true,
  implementation_block_reason: "",
  implementable_fields: ["product"],
};

const blockedProductChangeFixture = {
  ...approvedProductChangeFixture,
  is_implementable: false,
  implementation_block_reason: "Product change would require price/EMI/tenure recalculation because target product base price differs from the locked contract total amount.",
};

async function mockAmendments(page: Page, role: "customer" | "partner" | "admin", fixture = amendmentFixture) {
  await page.route(`**/api/v1/${role}/contract-amendments/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET") {
      if (/\/contract-amendments\/1\/implement\/?$/.test(url.pathname)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...fixture, status: "IMPLEMENTED", implemented_at: "2026-05-26T11:00:00Z" }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
      return;
    }

    if (/\/contract-amendments\/1\/?$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 1, results: [fixture] }) });
  });
}

test.describe("customer contract amendment phase-2 UI", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer amendment list loads and exposes only customer navigation", async ({ page }) => {
    await mockAmendments(page, "customer");
    await page.goto("/customer/contract-amendments");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "My amendment requests" })).toBeVisible();
    await expect(page.getByText("Guarded amendment implementation phase")).toBeVisible();
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

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "Customer amendment requests" })).toBeVisible();
    await expect(page.getByText("Guarded amendment implementation phase")).toBeVisible();
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

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "Contract Amendments" })).toBeVisible();
    await expect(page.getByText("Guarded amendment implementation phase")).toBeVisible();
    await expect(page.getByText("AMD-SMOKE-001")).toBeVisible();

    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("link", { name: "Contract Amendments", exact: true }).first()).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "My amendment requests", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Customer amendment requests", exact: true })).toHaveCount(0);
  });

  test("admin amendment detail shows implementation button only for approved safe amendment", async ({ page }) => {
    await mockAmendments(page, "admin", approvedSafeAmendmentFixture);
    await page.goto("/admin/contract-amendments/1");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "AMD-SMOKE-001" })).toBeVisible();
    await expect(page.getByText("Only whitelisted non-financial corrections can be implemented in Phase 3.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Implement approved non-financial correction" })).toBeVisible();
  });

  test("admin amendment detail shows product reference implementation for approved product change", async ({ page }) => {
    await mockAmendments(page, "admin", approvedProductChangeFixture);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByText("This changes only the contract product reference.")).toBeVisible();
    await expect(page.getByText("Product reference preview")).toBeVisible();
    await expect(page.getByText("New Sofa")).toBeVisible();
    await expect(page.getByRole("button", { name: "Implement approved product reference change" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Implement approved non-financial correction" })).toHaveCount(0);
  });

  test("admin amendment detail does not show implementation button for blocked product change", async ({ page }) => {
    await mockAmendments(page, "admin", blockedProductChangeFixture);
    await page.goto("/admin/contract-amendments/1");

    await expect(page.getByRole("button", { name: "Implement approved product reference change" })).toHaveCount(0);
    await expect(page.getByText("Product change would require price/EMI/tenure recalculation")).toBeVisible();
  });

  test("admin implementation button calls only the guarded implement endpoint", async ({ page }) => {
    const calls: string[] = [];
    await mockAmendments(page, "admin", approvedSafeAmendmentFixture);
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname.includes("/contract-amendments/1/")) calls.push(url.pathname);
    });
    await page.goto("/admin/contract-amendments/1");
    await page.getByRole("button", { name: "Implement approved non-financial correction" }).click();

    await expect.poll(() => calls).toEqual(["/api/v1/admin/contract-amendments/1/implement/"]);
  });

  test("admin amendment detail still exposes decision controls", async ({ page }) => {
    await mockAmendments(page, "admin");
    await page.goto("/admin/contract-amendments/1");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "AMD-SMOKE-001" })).toBeVisible();
    await expect(page.getByText("Only approved whitelisted corrections or safe product reference changes can move to implementation.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve decision" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply change|Execute|Update contract|Implement amendment/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Apply change|Execute|Update contract|Implement amendment/i })).toHaveCount(0);
  });
});

test.describe("customer and partner amendment implementation visibility", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer detail never shows implementation action", async ({ page }) => {
    await mockAmendments(page, "customer", approvedProductChangeFixture);
    await page.goto("/customer/contract-amendments/1");

    await expect(page.getByRole("button", { name: "Implement approved non-financial correction" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Implement approved product reference change" })).toHaveCount(0);
  });
});

test.describe("partner amendment implementation visibility", () => {
  test.use({ storageState: authStatePath("partner") });

  test("partner detail never shows implementation action", async ({ page }) => {
    await mockAmendments(page, "partner", approvedProductChangeFixture);
    await page.goto("/partner/contract-amendments/1");

    await expect(page.getByRole("button", { name: "Implement approved non-financial correction" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Implement approved product reference change" })).toHaveCount(0);
  });
});
