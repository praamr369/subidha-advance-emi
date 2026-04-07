import { expect, test } from "@playwright/test";

import { readSmokeManifest } from "./helpers/smoke-data";

test("public home loads with apply nav, live stats, and latest winner widget", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Subidha Furniture logo" }).first()
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Apply" }).first()).toBeVisible();
  await expect(page.getByText("Published Batches")).toBeVisible();
  await expect(page.getByText("Latest Published Winner")).toBeVisible();
});

test("public product enquiry routes into apply and the apply form submits", async ({
  page,
}) => {
  const manifest = readSmokeManifest();
  const suffix = Date.now().toString().slice(-8);
  const phone = `9${suffix.padStart(9, "0")}`;

  await page.goto("/products");
  await expect(
    page.getByRole("heading", {
      name: /Explore the live product catalogue before you enter the Lucky Plan flow/i,
    })
  ).toBeVisible();
  await expect(page.getByText("Catalogue Filters").first()).toBeVisible();
  await expect(page.getByText("Live results").first()).toBeVisible();
  await expect(page.getByText("Media-ready cards")).toBeVisible();

  await page.goto(`/products/${manifest.entities.public.product_id}`);
  await expect(page.getByText("Live public product detail").first()).toBeVisible();
  await expect(page.getByText("Base price", { exact: true })).toBeVisible();
  await expect(page.getByText("What happens next")).toBeVisible();
  await page.getByRole("link", { name: "Enquire Now" }).click();
  await expect(page).toHaveURL(/\/apply\?/);
  await expect(page.getByText("Selected Product Context")).toBeVisible();

  await page.getByLabel("Name").fill("Playwright Public Lead");
  await page.getByLabel("Phone").fill(phone);
  await page.getByLabel("City / Area").fill("Dhaka");
  await page
    .getByRole("button", { name: "Submit Application" })
    .click();

  await expect(page.getByText(/Reference #\d+\./)).toBeVisible();
});

test("public product detail keeps enquiry workflow and catalogue facts visible", async ({
  page,
}) => {
  const manifest = readSmokeManifest();

  await page.goto(`/products/${manifest.entities.public.product_id}`);
  await expect(page.getByText("Product code").first()).toBeVisible();
  await expect(page.getByText("Media state").first()).toBeVisible();
  await expect(page.getByText("Enquiry path")).toBeVisible();
  await expect(page.getByText("Product context preserved")).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact branch" })).toBeVisible();
});

test("public winner history page loads with live data", async ({ page }) => {
  await page.goto("/winner-history");
  await expect(
    page.getByRole("heading", { name: "Winner History" })
  ).toBeVisible();
  const winnerHistoryTable = page.getByRole("table", {
    name: "Winner history records",
  });
  await expect(winnerHistoryTable).toBeVisible();
  await expect(
    winnerHistoryTable.getByRole("cell", {
      name: "PW-SMOKE-WINNER",
      exact: true,
    })
  ).toBeVisible();
});

test("public stats failure renders an error state instead of fake zero cards", async ({
  page,
}) => {
  await page.route("**/api/v1/public/stats/", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Smoke public stats failure" }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("Public stats unavailable")).toBeVisible();
  await expect(page.getByText("Published Batches")).not.toBeVisible();
});

test("latest winner widget shows loading then empty state cleanly", async ({
  page,
}) => {
  await page.route("**/api/v1/public/latest-winner/", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ winner: null }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("Loading latest winner...")).toBeVisible();
  await expect(page.getByText("No winner published yet")).toBeVisible();
});
