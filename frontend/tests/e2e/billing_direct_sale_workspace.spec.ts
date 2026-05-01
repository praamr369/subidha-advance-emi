import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("admin direct-sale workspace routes share the create-bill flow", async ({ page }) => {
  const manifest = readSmokeManifest();
  const productName = manifest.entities.public.product_name;

  await page.goto("/admin/billing/direct-sale");
  await expect(page.getByRole("heading", { name: "Direct Sale Workspace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create Direct Sale Invoice" })).toBeVisible();

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
  await expect(page.getByRole("button", { name: new RegExp(productName) }).first()).toBeVisible();
  await page.getByRole("button", { name: new RegExp(productName) }).first().click();
  await expect(page.getByLabel("Unit Price").first()).toHaveValue("1200.00");

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
  await expect(sidebar.getByRole("link", { name: "Direct Sale Billing Workspace" })).toHaveCount(0);
});
