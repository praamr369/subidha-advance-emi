import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("admin direct-sale workspace routes share the create-bill flow", async ({ page }) => {
  const manifest = readSmokeManifest();
  const productName = manifest.entities.public.product_name;

  await page.goto("/admin/billing/direct-sale");
  await expect(page.getByRole("heading", { name: "Direct Sale Workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Bill" })).toBeVisible();

  await page.goto("/admin/billing/direct-sales");
  await expect(page.getByRole("heading", { name: "Direct Sale Workspace" })).toBeVisible();

  await page.getByRole("button", { name: "Create Bill" }).click();
  await expect(page.getByRole("heading", { name: "Create Direct Sale Bill" })).toBeVisible();

  await page.getByLabel("Walk-in / Snapshot Name").fill("Smoke Walk In");
  await page.getByLabel("Phone").fill("9812345678");
  await page.getByLabel("Search Product").fill(productName);
  await expect(page.getByRole("button", { name: new RegExp(productName) }).first()).toBeVisible();
  await page.getByRole("button", { name: new RegExp(productName) }).first().click();
  await expect(page.getByLabel("Unit Price").first()).toHaveValue("1200.00");

  await page.getByLabel("Line Discount").first().fill("100.00");
  await expect(page.locator("body")).toContainText("Discount");
  await expect(page.locator("body")).toContainText("Grand Total");

  await page.getByRole("button", { name: "Add Line" }).click();
  await expect(page.getByText("Line 2")).toBeVisible();
  await page.getByRole("button", { name: "Remove line 2" }).click();
  await expect(page.getByText("Line 2")).toHaveCount(0);

  await page.getByLabel("Create purchase/stock requirement").check();
  await page.getByLabel("Required Qty").fill("1.000");
  await page.getByLabel("Requirement Note").fill("Smoke direct-sale order requirement");

  const createButton = page.getByRole("button", { name: "Create Direct Sale" });
  await createButton.dblclick();
  await expect(page.getByText(/Direct sale .* created/i)).toBeVisible();
});
