import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const baseReadinessPayload = {
  module_not_configured: false,
  overall_status: "WARNINGS",
  summary: {
    blockers: 0,
    warnings: 2,
    ready_checks: 3,
    total_checks: 5,
  },
  last_checked_at: "2026-06-01T10:15:00+05:30",
  sections: [
    {
      key: "product_master",
      label: "Product master",
      status: "WARNING",
      blockers: 0,
      warnings: 1,
      checks: [
        {
          key: "products_exist",
          label: "Total products exist",
          status: "READY",
          detail: "4 product row(s) exist in product master.",
          count: 4,
          action_label: "Open products",
          action_href: "/admin/products",
        },
        {
          key: "active_products_missing_sku",
          label: "Active products missing SKU",
          status: "WARNING",
          detail: "1 active product row has no SKU.",
          count: 1,
          action_label: "Open products",
          action_href: "/admin/products",
        },
      ],
    },
    {
      key: "stock_ledger",
      label: "Stock ledger",
      status: "READY",
      blockers: 0,
      warnings: 0,
      checks: [
        {
          key: "negative_physical_stock",
          label: "No negative physical stock",
          status: "READY",
          detail: "0 active tracked items calculate negative physical stock.",
          count: 0,
          action_label: "Open stock ledger",
          action_href: "/admin/inventory/ledger",
        },
      ],
    },
  ],
  issues: [
    {
      severity: "WARNING",
      section: "product_master",
      title: "Active products missing SKU",
      detail: "Missing SKUs weaken inventory traceability.",
      object_type: "",
      object_id: "",
      action_label: "Open products",
      action_href: "/admin/products",
    },
  ],
  operator_shortcuts: [
    {
      label: "Inventory profiles",
      href: "/admin/inventory/profiles",
      description: "Maintain stock tracking profiles and default locations.",
    },
    {
      label: "Stock ledger",
      href: "/admin/inventory/ledger",
      description: "Inspect persisted stock movements and source references.",
    },
  ],
  inventory_ready: false,
  global_inventory_ready: false,
  product_count: 4,
  active_product_count: 4,
  stock_item_count: 3,
  active_tracked_stock_items: 3,
  stock_needs_open: 1,
  open_operational_stock_needs: 1,
  stock_movements_count: 7,
  opening_stock_posted_count: 1,
  opening_stock_draft_count: 0,
  opening_stock_ready: true,
  warnings: [{ code: "ACTIVE_PRODUCTS_MISSING_SKU", message: "1 active product row has no SKU." }],
  recommended_actions: ["Open products"],
};

async function mockReadiness(page: Page, payload: unknown = baseReadinessPayload, status = 200) {
  await page.route("**/api/v1/admin/inventory/readiness/**", async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}

test.describe("admin inventory readiness cockpit", () => {
  test.use({ storageState: authStatePath("admin") });

  test("renders warning cockpit sections, grouped issues, and route-backed shortcuts", async ({ page }) => {
    await mockReadiness(page);

    await page.goto("/admin/inventory/readiness");

    await expect(page.getByRole("heading", { name: "Inventory readiness" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Overall inventory readiness" })).toContainText("Warnings");
    await expect(page.getByRole("heading", { name: "Product master" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stock ledger" })).toBeVisible();
    await expect(page.getByText("Warnings (1)")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Active products missing SKU", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Inventory profiles/ })).toHaveAttribute("href", "/admin/inventory/profiles");
    await expect(page.getByRole("link", { name: /Stock ledger/ }).first()).toHaveAttribute("href", "/admin/inventory/ledger");
  });

  test("shows loading state while inventory readiness is pending", async ({ page }) => {
    await page.route("**/api/v1/admin/inventory/readiness/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(baseReadinessPayload),
      });
    });

    await page.goto("/admin/inventory/readiness");

    await expect(page.getByText("Loading inventory readiness...")).toBeVisible();
    await expect(page.getByRole("region", { name: "Overall inventory readiness" })).toBeVisible();
  });

  test("shows actionable error state when inventory readiness fails", async ({ page }) => {
    await mockReadiness(page, { detail: "Readiness failed" }, 500);

    await page.goto("/admin/inventory/readiness");

    await expect(page.getByText("Unable to load inventory readiness")).toBeVisible();
    await expect(page.getByText(/Check API connectivity/)).toBeVisible();
  });

  test("shows ready empty-state as valid data", async ({ page }) => {
    await mockReadiness(page, {
      ...baseReadinessPayload,
      overall_status: "READY",
      summary: { blockers: 0, warnings: 0, ready_checks: 5, total_checks: 5 },
      sections: baseReadinessPayload.sections.map((section) => ({ ...section, status: "READY", blockers: 0, warnings: 0 })),
      issues: [],
      inventory_ready: true,
      global_inventory_ready: true,
      warnings: [],
      recommended_actions: [],
    });

    await page.goto("/admin/inventory/readiness");

    await expect(page.getByRole("region", { name: "Overall inventory readiness" })).toContainText("Ready");
    await expect(page.getByText("No readiness issues")).toBeVisible();
    await expect(page.getByText("valid ready state")).toBeVisible();
  });

  test("renders blocker state distinctly", async ({ page }) => {
    await mockReadiness(page, {
      ...baseReadinessPayload,
      overall_status: "BLOCKED",
      summary: { blockers: 1, warnings: 1, ready_checks: 3, total_checks: 5 },
      sections: [
        { ...baseReadinessPayload.sections[0], status: "BLOCKED", blockers: 1, warnings: 1 },
        baseReadinessPayload.sections[1],
      ],
      issues: [
        {
          severity: "BLOCKER",
          section: "stock_ledger",
          title: "Negative physical stock",
          detail: "At least one active tracked item calculates negative physical stock.",
          object_type: "",
          object_id: "",
          action_label: "Open stock ledger",
          action_href: "/admin/inventory/ledger",
        },
      ],
    });

    await page.goto("/admin/inventory/readiness");

    await expect(page.getByRole("region", { name: "Overall inventory readiness" })).toContainText("Blocked");
    await expect(page.getByText("Blockers (1)")).toBeVisible();
    await expect(
      page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Blockers (1)" }) })
        .getByText("Negative physical stock", { exact: true })
    ).toBeVisible();
  });
});
