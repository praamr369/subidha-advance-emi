import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("partner") });

test("partner dashboard loads and payouts is not shown in navigation", async ({
  page,
}) => {
  await page.goto("/partner");
  await expect(
    page.getByRole("heading", { name: "Partner Dashboard" })
  ).toBeVisible();
  await expect(page.locator('a[href="/partner/payouts"]')).toHaveCount(0);
});

test("partner payouts route redirects to commissions", async ({ page }) => {
  await page.goto("/partner/payouts");
  await expect(page).toHaveURL(/\/partner\/commissions$/);
  await expect(
    page.getByRole("heading", { name: "Partner Commissions" })
  ).toBeVisible();
});

test("partner customers detail flow and payments history work", async ({
  page,
}) => {
  const manifest = readSmokeManifest();

  await page.goto("/partner/customers");
  await page
    .getByPlaceholder("Search name or phone")
    .fill(manifest.entities.admin.search_query);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: "View Detail" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/partner/customers/${manifest.entities.partner.customer_id}$`)
  );
  await expect(
    page.getByRole("heading", { name: manifest.entities.admin.customer_name })
  ).toBeVisible();

  await page.getByRole("link", { name: "Customer Payments" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/partner/payments\\?customer=${manifest.entities.partner.customer_id}$`)
  );
  await expect(
    page.getByRole("heading", { name: "Partner Payments" })
  ).toBeVisible();
  await page.getByRole("link", { name: "View Detail" }).first().click();
  await expect(page).toHaveURL(
    /\/partner\/payments\/\d+/
  );
  await expect(
    page.getByRole("heading", {
      name: /Payment #\d+/,
    })
  ).toBeVisible();
});

test("partner collection request detail loads directly", async ({ page }) => {
  const manifest = readSmokeManifest();

  await page.goto(
    `/partner/collections/${manifest.entities.partner.collection_request_id}`
  );
  await expect(
    page.getByRole("heading", {
      name: new RegExp(
        `Collection Request #${manifest.entities.partner.collection_request_id}`
      ),
    })
  ).toBeVisible();
});
