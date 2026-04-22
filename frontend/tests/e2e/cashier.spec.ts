import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("cashier") });

test.describe.serial("cashier smoke", () => {
  test("cashier dashboard loads", async ({ page }) => {
    await page.goto("/cashier");
    await expect(
      page.getByRole("heading", { name: "Cashier Dashboard" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("complementary")
        .getByRole("link", { name: "Payment History", exact: true })
    ).toBeVisible();
  });

  test("cashier collectible search works by phone and subscription", async ({
    page,
  }) => {
    const manifest = readSmokeManifest();

    await page.goto("/cashier/collect");
    await page.locator("#cashier-search-input").fill(
      manifest.entities.cashier.customer_phone
    );
    await page
      .locator("form")
      .filter({ has: page.locator("#cashier-search-input") })
      .getByRole("button", { name: "Search" })
      .click();

    await expect(page.getByText("Customer summary")).toBeVisible();
    await expect(
      page.getByText(manifest.entities.cashier.customer_name).first()
    ).toBeVisible();

    await page.selectOption("#cashier-search-mode", "subscription");
    await page.locator("#cashier-search-input").fill(
      manifest.entities.cashier.subscription_number
    );
    await page
      .locator("form")
      .filter({ has: page.locator("#cashier-search-input") })
      .getByRole("button", { name: "Search" })
      .click();

    await expect(page.getByText("Search matches")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(manifest.entities.cashier.subscription_number),
      }).first()
    ).toBeVisible();
  });

  test("cashier collection flow posts and opens receipt plus searchable history", async ({
    page,
  }) => {
    const manifest = readSmokeManifest();

    await page.goto("/cashier/collect");
    await page.locator("#cashier-search-input").fill(
      manifest.entities.cashier.customer_phone
    );
    await page
      .locator("form")
      .filter({ has: page.locator("#cashier-search-input") })
      .getByRole("button", { name: "Search" })
      .click();

    await page.getByRole("button", { name: /EMI Month 2/i }).click();
    await expect(page.locator("#collect-amount")).toHaveValue("200.00");
    await page.selectOption("#collect-method", "CASH");
    await page.locator("#collect-finance-account").selectOption({ index: 1 });
    await page.getByRole("button", { name: /^Collect Payment$/ }).click();

    await expect(page.getByRole("link", { name: "Open Receipt" })).toBeVisible();
    await page.getByRole("link", { name: "Open Receipt" }).click();

    await expect(page).toHaveURL(/\/cashier\/payments\/\d+$/);
    const heading = await page
      .getByRole("heading", { name: /Receipt #\d+/ })
      .textContent();
    const paymentIdMatch = heading?.match(/(\d+)/);
    expect(paymentIdMatch).toBeTruthy();
    const paymentId = paymentIdMatch?.[1] ?? "";

    await page.getByRole("link", { name: "Back to History" }).click();
    await expect(page).toHaveURL(/\/cashier\/payments$/);
    await page.locator("#cashier-payment-search").fill(paymentId);
    await page
      .locator("form")
      .filter({ has: page.locator("#cashier-payment-search") })
      .getByRole("button", { name: "Search" })
      .click();
    await expect(page.getByText(`#${paymentId}`, { exact: true }).first()).toBeVisible();
  });

  test("cashier can collect unapplied advance with a finance account", async ({
    page,
  }) => {
    const manifest = readSmokeManifest();

    await page.goto("/cashier/collect");
    await page.locator("#cashier-search-input").fill(
      manifest.entities.cashier.customer_phone
    );
    await page
      .locator("form")
      .filter({ has: page.locator("#cashier-search-input") })
      .getByRole("button", { name: "Search" })
      .click();

    await expect(page.getByText("Step 4 · Collect unapplied customer advance")).toBeVisible();
    await page.locator("#collect-advance-amount").fill("50.00");
    await page.locator("#collect-advance-finance-account").selectOption({ index: 1 });
    await page.getByRole("button", { name: /^Collect Advance$/ }).click();

    await expect(page.getByText(/Customer advance collected successfully/i)).toBeVisible();
    await expect(page.getByText(/Advance #/i)).toBeVisible();
  });

  test("cashier cannot access admin pages", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/unauthorized$/);
  });
});
