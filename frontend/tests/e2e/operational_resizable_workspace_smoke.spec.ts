import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test.describe("operational resizable workspaces", () => {
  test("operations command center exposes split workspace chrome", async ({ page }) => {
    await page.route("**/api/v1/admin/operations/queue-summary/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              key: "subscription_requests_pending",
              count: 1,
              severity: "MEDIUM",
              oldest_pending_date: null,
              detail_url: "/admin/operations",
              empty_state: null,
            },
          ],
        }),
      });
    });
    await page.route("**/api/v1/admin/operations/command-center/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/admin/operations/command-center");
    await expect(page.getByRole("heading", { name: "Operations Command Center" })).toBeVisible();
    await expect(page.locator("[data-op-workspace]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Queues" })).toBeVisible();
  });

  test("global search shows workspace after results load", async ({ page }) => {
    await page.route("**/api/v1/admin/global-search/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: 1,
          results: [
            {
              type: "subscription",
              title: "Smoke Subscription",
              subtitle: "Smoke customer preview line",
              status: "active",
              deep_link: "/admin/subscriptions/1",
            },
          ],
        }),
      });
    });

    await page.goto("/admin/global-search");
    await page.locator("#admin-global-search").fill("ab");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("[data-op-workspace]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Smoke Subscription" }).first()).toBeVisible();
  });

  test("crm workspace renders operational split", async ({ page }) => {
    await page.route("**/api/v1/admin/crm/workspace/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          as_of: "2026-05-02",
          crm_pipeline: [
            { key: "support_open", count: 2 },
            { key: "pending_kyc", count: 1 },
          ],
          today_work: [],
          customer_360: [],
        }),
      });
    });
    await page.route("**/api/v1/crm/overview/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          summary: {
            party_count: 3,
            lead_count: 4,
            customer_count: 0,
            partner_count: 0,
            vendor_count: 0,
            staff_count: 0,
            due_follow_up_count: 5,
            scheduled_follow_up_count: 0,
            open_interaction_count: 0,
          },
          lead_pipeline: {
            new: 0,
            in_progress: 0,
            contacted: 0,
            converted: 0,
            closed: 0,
          },
          recent_parties: [],
          recent_leads: [],
          follow_up_queue: [],
        }),
      });
    });
    await page.route("**/api/v1/admin/customers/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 6, next: null, previous: null, results: [] }),
      });
    });

    await page.goto("/admin/crm");
    await expect(page.getByRole("heading", { name: "CRM Workspace" }).first()).toBeVisible();
    await expect(page.locator("[data-op-workspace]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Registered Customers" }).first()).toBeVisible();
  });

  test("stock needs split loads with mocked rows", async ({ page }) => {
    await page.route("**/api/v1/admin/inventory/stock-needs/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: 1,
          results: [
            {
              id: 9001,
              need_no: "PN-9001",
              product_name_snapshot: "Smoke Sofa",
              shortage_quantity: 3,
              status: "open",
              source_module: "smoke",
            },
          ],
        }),
      });
    });

    await page.goto("/admin/inventory/stock-needs");
    await expect(page.getByRole("banner").getByRole("heading", { name: "Stock needs" })).toBeVisible();
    await expect(page.locator("[data-op-workspace]")).toBeVisible();
    await expect(page.getByText("PN-9001")).toBeVisible();
  });

  test("finance workspace uses resizable lanes", async ({ page }) => {
    await page.route("**/api/v1/admin/finance/workspace/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          as_of: "2026-05-02",
          cards: [
            {
              key: "collections",
              label: "Collections",
              count: 2,
              severity: "LOW",
              source: "smoke-fixture",
              deep_link: "/admin/collections",
            },
          ],
        }),
      });
    });

    await page.goto("/admin/finance/workspace");
    await expect(page.getByRole("heading", { name: "Finance Workspace" }).first()).toBeVisible();
    await expect(page.locator("[data-op-workspace]")).toBeVisible();
    await expect(page.getByRole("button", { name: /Collections/i })).toBeVisible();
  });
});
