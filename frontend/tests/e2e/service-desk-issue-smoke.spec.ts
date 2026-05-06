import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const overviewPayload = {
  summary: {
    case_count: 0,
    open_count: 0,
    returns_count: 0,
    service_count: 0,
    complaint_case_count: 0,
    finance_pending_count: 0,
    stock_pending_count: 0,
    support_request_count: 0,
    open_support_request_count: 0,
  },
  recent_cases: [],
  recent_complaints: [],
};

const ticketsPayload = {
  count: 0,
  summary: { total: 0, open: 0, by_status: {}, by_priority: {} },
  results: [],
};

test.describe("Customer issue desk smoke (mocked APIs)", () => {
  test.use({ storageState: authStatePath("customer") });

  test("support hub and new form render", async ({ page }) => {
    await page.route("**/api/v1/customer/support/tickets/**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ count: 0, results: [] }),
        });
        return;
      }
      await route.continue();
    });

    await page.route("**/api/v1/customer/subscriptions/**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ count: 0, results: [] }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/customer/support");
    await expect(page.getByRole("heading", { name: "Support & requests" })).toBeVisible();
    await expect(page.getByText("No tickets in this view")).toBeVisible();

    await page.goto("/customer/support/new");
    await expect(page.getByRole("heading", { name: /new support request/i })).toBeVisible();
    await expect(page.getByPlaceholder("Describe what happened in detail")).toBeVisible();
    await expect(page.getByText("Attachments:")).toBeVisible();
  });
});

test.describe("Admin issue desk smoke (mocked APIs)", () => {
  test.use({ storageState: authStatePath("admin") });

  test("service desk shows TKT section; invalid id shows error", async ({ page }) => {
    await page.route("**/api/v1/service-desk/overview/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overviewPayload),
      });
    });
    await page.route("**/api/v1/admin/support/tickets/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/999999/") && route.request().method() === "GET") {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ticketsPayload),
      });
    });

    await page.goto("/admin/service-desk");
    await expect(page.getByText("Customer issue tickets (TKT)")).toBeVisible();

    await page.goto("/admin/service-desk/999999");
    await expect(page.getByRole("heading", { name: "Issue ticket" })).toBeVisible();
    await expect(page.getByText("Ticket unavailable").or(page.getByText("Error"))).toBeVisible();
  });
});
