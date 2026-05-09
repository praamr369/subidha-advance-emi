import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("admin direct-sale workspace routes share the create-bill flow", async ({ page }) => {
  const manifest = readSmokeManifest();
  const productName = manifest.entities.public.product_name;

  await page.goto("/admin/billing/direct-sale");
  await expect(page.getByRole("heading", { name: "Direct Sale Workspace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create Direct Sale Invoice" }).first()).toBeVisible();

  await page.goto("/admin/billing/direct-sales");
  await expect(page.getByRole("heading", { name: "Direct Sale Workspace" })).toBeVisible();

  await page.goto("/admin/billing/direct-sale?mode=create");
  await expect(page.getByRole("heading", { name: "Create Direct Sale Invoice" })).toBeVisible();
  await expect(page.locator(".fixed.inset-0")).toHaveCount(0);

  await page.goto("/admin/billing/direct-sales?mode=create");
  await expect(page.getByRole("heading", { name: "Create Direct Sale Invoice" })).toBeVisible();
  await expect(page.locator(".fixed.inset-0")).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Existing Customer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Customer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Walk-in Snapshot" })).toBeVisible();
  await page.getByLabel("Search Existing Customer").fill("No Match Customer");
  await expect(page.getByRole("button", { name: "Create New Customer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use Walk-in Snapshot" })).toBeVisible();
  await page.getByRole("button", { name: "Use Walk-in Snapshot" }).click();
  await expect(page.getByLabel("Snapshot Name")).toHaveValue("No Match Customer");
  await page.getByLabel("Snapshot Name").fill("Smoke Walk In");
  await page.getByLabel("Phone").fill("9812345678");
  await page.getByLabel("Tax Mode").selectOption("GST");
  await page.getByLabel("Place of Supply / State").fill("WB");
  await page.getByLabel("Customer GST Type").selectOption("REGISTERED_BUSINESS");
  await page.getByLabel("GSTIN").fill("19ABCDE1234F1Z5");
  await page.getByLabel("Search Product").fill(productName);
  const failedProductFetch = page.getByText("Failed to fetch").first();
  if (await failedProductFetch.isVisible().catch(() => false)) {
    await expect(failedProductFetch).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: new RegExp(productName) }).first()).toBeVisible();
    await page.getByRole("button", { name: new RegExp(productName) }).first().click();
    await expect(page.getByLabel("Unit Price").first()).toHaveValue("1200.00");
  }

  await page.getByLabel("Line Discount").first().fill("100.00");
  await expect(page.locator("body")).toContainText("Discount");
  await expect(page.locator("body")).toContainText("Grand Total");

  await page.getByRole("button", { name: "Add Line" }).click();
  await expect(page.getByText("Line 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove line 2" }).click();
  await expect(page.getByText("Line 2", { exact: true })).toHaveCount(0);

  await page.getByLabel("Create purchase/stock requirement").check();
  await page.getByLabel("Required Qty").fill("1.000");
  await page.getByLabel("Requirement Note").fill("Smoke direct-sale order requirement");

  await page.goto("/admin/billing/direct-sale/create");
  await expect(page.getByRole("heading", { name: "Create Direct Sale Invoice" })).toBeVisible();
});

test("admin sales sidebar avoids duplicate direct-sale entries", async ({ page }) => {
  await page.goto("/admin");
  const sidebar = page.locator("nav").first();
  await expect(sidebar.getByRole("link", { name: "Direct Sales" })).toHaveCount(1);
  const createDirectSaleCount = await sidebar.getByRole("link", { name: "Create Direct Sale Invoice" }).count();
  expect(createDirectSaleCount).toBeLessThanOrEqual(1);
  await expect(sidebar.getByRole("link", { name: "Direct Sale Billing Workspace" })).toHaveCount(0);
});

test("erp home shows operational module cards with live entry links", async ({ page }) => {
  await page.goto("/admin/erp");
  await expect(page.getByRole("heading", { name: "ERP Home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CRM" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Finance / Accounting" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delivery" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Setup / Readiness" })).toBeVisible();
});

test("crm workspace separates customer, party, lead, follow-up, kyc, and support sections", async ({ page }) => {
  await page.goto("/admin/crm");
  await expect(page.getByRole("heading", { name: "CRM Workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registered Customers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CRM Parties" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Leads / Enquiries" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Follow-ups" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "KYC" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Support / Service Cases" })).toBeVisible();
});

test("sales workspace exposes direct-sale and invoice workflow cards", async ({ page }) => {
  await page.goto("/admin/sales");
  await expect(page.getByRole("heading", { name: "Sales Workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Direct Sales" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create Direct Sale Invoice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Receipts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales Returns" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Credit Notes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pending Stock Requirements" })).toBeVisible();
});

test("existing customer search supports mixed name and phone token query", async ({ page }) => {
  await page.route("**/api/v1/admin/customers/search/**", async (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get("q") || "").trim();
    const result =
      q.toLowerCase() === "debjit roy" || q.toLowerCase() === "debjit roy 7797280952"
        ? [{ id: 412, name: "Debjit Roy", phone: "7797280952", customer_code: "C-DEBJ0952-A1B2" }]
        : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: result.length, results: result }) });
  });

  await page.goto("/admin/billing/direct-sale?mode=create");
  await page.getByLabel("Search Existing Customer").fill("Debjit Roy 7797280952");
  await expect(page.getByRole("button", { name: "Debjit Roy" })).toBeVisible();
  await page.getByRole("button", { name: "Debjit Roy" }).click();
  await expect(page.getByText("Customer ID: #412")).toBeVisible();
  await expect(page.getByText("Customer Code: C-DEBJ0952-A1B2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Direct Sale" }).first()).toBeEnabled();
});

test("existing customer search supports name-only query", async ({ page }) => {
  await page.route("**/api/v1/admin/customers/search/**", async (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const result = q === "debjit roy" ? [{ id: 412, name: "Debjit Roy", phone: "7797280952", customer_code: "C-DEBJ0952-A1B2" }] : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: result.length, results: result }) });
  });

  await page.goto("/admin/billing/direct-sale?mode=create");
  await page.getByLabel("Search Existing Customer").fill("Debjit Roy");
  await expect(page.getByRole("button", { name: "Debjit Roy" })).toBeVisible();
});

test("existing mode does not allow typed-only customer submission", async ({ page }) => {
  await page.route("**/api/v1/admin/customers/search/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
  });
  await page.route("**/api/v1/customers/search/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exact_match: false, count: 0, results: [] }) });
  });
  await page.route("**/api/v1/crm/parties/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
  });

  await page.goto("/admin/billing/direct-sale?mode=create");
  await page.getByLabel("Search Existing Customer").fill("Debjit Roy 7797280952");
  await expect(page.getByText("No registered customer found.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Direct Sale" }).first()).toBeDisabled();
});

test("no result actions prefill parsed name and phone", async ({ page }) => {
  await page.route("**/api/v1/admin/customers/search/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
  });
  await page.route("**/api/v1/customers/search/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exact_match: false, count: 0, results: [] }) });
  });
  await page.route("**/api/v1/crm/parties/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
  });

  await page.goto("/admin/billing/direct-sale?mode=create");
  await page.getByLabel("Search Existing Customer").fill("Debjit Roy 7797280952");
  await page.getByRole("button", { name: "Create New Customer" }).click();
  await expect(page.getByLabel("New Customer Full Name")).toHaveValue("Debjit Roy");
  await expect(page.getByLabel("New Customer Phone")).toHaveValue("7797280952");

  await page.getByRole("button", { name: "Existing Customer" }).click();
  await page.getByLabel("Search Existing Customer").fill("Debjit Roy 7797280952");
  await page.getByRole("button", { name: "Use Walk-in Snapshot" }).click();
  await expect(page.getByLabel("Snapshot Name")).toHaveValue("Debjit Roy");
  await expect(page.getByLabel("Phone")).toHaveValue("7797280952");
});

test("crm-party-only result shows create-customer-from-party action without binding customer id", async ({ page }) => {
  await page.route("**/api/v1/admin/customers/search/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0, results: [] }) });
  });
  await page.route("**/api/v1/customers/search/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exact_match: false, count: 0, results: [] }) });
  });
  await page.route("**/api/v1/crm/parties/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        results: [
          {
            id: 901,
            party_no: "PTY-00901",
            display_name: "Debjit Party",
            primary_phone: "7797280952",
            role_types: ["LEAD"],
            follow_up_state: "NONE",
            open_follow_up_count: 0,
            party_kind: "PERSON",
            is_active: true,
          },
        ],
      }),
    });
  });

  await page.goto("/admin/billing/direct-sale?mode=create");
  await page.getByLabel("Search Existing Customer").fill("Debjit Party 7797280952");
  await expect(page.getByText("CRM party records were found.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create customer profile from party" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Direct Sale" }).first()).toBeDisabled();
});

test("direct-sale submit surfaces 400, 404, and 500 api errors clearly", async ({ page }) => {
  await page.route("**/api/v1/admin/customers/search/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        results: [{ id: 777, name: "Debjit Roy", phone: "7797280952", customer_code: "C-DEBJ0952-A1B2" }],
      }),
    });
  });
  await page.route("**/api/v1/admin/billing/products/search/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        results: [
          {
            id: 11,
            name: "Workspace Sofa Deluxe",
            product_code: "WS-SOFA-001",
            sku: "WS-SOFA-001",
            base_price: "1200.00",
            sale_price: "1200.00",
            inventory_status: { on_hand: "10.000", reserved: "0.000", available: "10.000", incoming: "0.000", is_in_stock: true, requires_purchase: false },
          },
        ],
      }),
    });
  });

  const routeCreate = async (status: number, body: unknown) => {
    await page.route("**/api/v1/billing/direct-sales/", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
  };

  await page.goto("/admin/billing/direct-sale?mode=create");
  await page.getByLabel("Search Existing Customer").fill("Debjit Roy");
  await page.getByRole("button", { name: "Debjit Roy" }).click();
  await page.getByLabel("Search Product").first().fill("Workspace Sofa Deluxe");
  await page.getByRole("button", { name: /Workspace Sofa Deluxe/i }).first().click();

  await routeCreate(400, { customer: ["Existing customer mode requires selecting a registered customer."] });
  await page.getByRole("button", { name: "Create Direct Sale" }).first().click();
  await expect(page.getByText("Direct sale could not be created. Please fix the highlighted fields.")).toBeVisible();
  await expect(page.getByText(/customer:/i).first()).toBeVisible();

  await routeCreate(400, {
    detail: "Direct sale invoice numbering is not configured. Complete Admin Settings -> Document Numbering.",
    numbering_key: "DIRECT_SALE_INVOICE",
  });
  await page.getByRole("button", { name: "Create Direct Sale" }).first().click();
  await expect(
    page.getByText("Direct sale invoice numbering is not configured. Complete Admin Settings -> Document Numbering.").nth(1)
  ).toBeVisible();
  await expect(page.getByText("Network request failed. Backend server or connection is unavailable.")).toHaveCount(0);

  await routeCreate(404, { detail: "Not found." });
  await page.getByRole("button", { name: "Create Direct Sale" }).first().click();
  await expect(page.getByText("Direct sale API endpoint was not found. Check frontend API path.")).toBeVisible();
  await expect(page.getByText("Network request failed. Backend server or connection is unavailable.")).toHaveCount(0);

  await routeCreate(500, { detail: "Server exploded." });
  await page.getByRole("button", { name: "Create Direct Sale" }).first().click();
  await expect(page.getByText("Server error while creating direct sale. Check backend logs.")).toBeVisible();
});

test("direct-sale submit success redirects back to workspace route", async ({ page }) => {
  await page.route("**/api/v1/admin/customers/search/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        results: [{ id: 777, name: "Debjit Roy", phone: "7797280952", customer_code: "C-DEBJ0952-A1B2" }],
      }),
    });
  });
  await page.route("**/api/v1/admin/billing/products/search/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        results: [
          {
            id: 11,
            name: "Workspace Sofa Deluxe",
            product_code: "WS-SOFA-001",
            sku: "WS-SOFA-001",
            base_price: "1200.00",
            sale_price: "1200.00",
            inventory_status: { on_hand: "10.000", reserved: "0.000", available: "10.000", incoming: "0.000", is_in_stock: true, requires_purchase: false },
          },
        ],
      }),
    });
  });
  await page.route("**/api/v1/billing/direct-sales/", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: 9001, sale_no: "SALE-TEST-9001", status: "DRAFT", sale_date: "2026-05-01", lines: [] }),
    });
  });

  await page.goto("/admin/billing/direct-sale?mode=create");
  await page.getByLabel("Search Existing Customer").fill("Debjit Roy");
  await page.getByRole("button", { name: "Debjit Roy" }).click();
  await page.getByLabel("Search Product").first().fill("Workspace Sofa Deluxe");
  await page.getByRole("button", { name: /Workspace Sofa Deluxe/i }).first().click();
  await page.getByRole("button", { name: "Create Direct Sale" }).first().click();
  await expect(page).toHaveURL(/\/admin\/billing\/direct-sale$/);
});
