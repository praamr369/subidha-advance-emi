import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("customer") });

test("customer dashboard, subscriptions, and payments routes load with live nav only", async ({
  page,
}) => {
  await page.goto("/customer");
  await expect(
    page.getByRole("heading", { name: "Customer Workspace" })
  ).toBeVisible();
  await expect(page.locator('a[href="/customer/emis"]')).toHaveCount(0);

  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Subscriptions", exact: true })
    .click();
  await expect(page).toHaveURL(/\/customer\/subscriptions$/);
  await expect(
    page.getByRole("heading", { name: "My Subscriptions" })
  ).toBeVisible();

  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Payments", exact: true })
    .click();
  await expect(page).toHaveURL(/\/customer\/payments$/);
  await expect(page.getByRole("heading", { name: "My Payments" })).toBeVisible();
});

test("customer payment receipt is self-scoped", async ({ page }) => {
  const manifest = readSmokeManifest();

  await page.goto(`/customer/payments/${manifest.entities.customer.own_payment_id}`);
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`Payment Receipt #${manifest.entities.customer.own_payment_id}`),
    })
  ).toBeVisible();

  await page.goto(
    `/customer/payments/${manifest.entities.customer.other_payment_id}`
  );
  await expect(
    page.getByText("Unable to load payment receipt")
  ).toBeVisible();
});

test("customer legacy emis route redirects to subscriptions", async ({ page }) => {
  await page.goto("/customer/emis");
  await expect(page).toHaveURL(/\/customer\/subscriptions$/);
});
