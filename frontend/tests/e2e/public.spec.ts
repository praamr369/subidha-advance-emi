import { expect, test } from "@playwright/test";

import { readSmokeManifest } from "./helpers/smoke-data";

test("public primary navigation exposes catalogue links", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(nav.getByRole("link", { name: /products/i }).first()).toBeVisible();
});

test("public home loads with apply nav, live stats, and latest winner widget", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Subidha Furniture logo" }).first()
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Apply" }).first()).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /Furniture and appliances with clear monthly plans/i,
    })
  ).toBeVisible();
  await expect(page.getByText("Published batches").first()).toBeVisible();
  await expect(page.getByText("Latest winner").first()).toBeVisible();
});

test("public product enquiry routes into apply and the apply form submits", async ({
  page,
}) => {
  const manifest = readSmokeManifest();
  const suffix = Date.now().toString().slice(-8);
  const phone = `9${suffix.padStart(9, "0")}`;

  await page.route("**/api/v1/public/leads/", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Application submitted successfully.",
        lead_id: 5501,
      }),
    });
  });

  await page.goto("/products");
  await expect(
    page.getByRole("heading", { name: "Products" })
  ).toBeVisible();
  await expect(page.getByText("Browse the live catalogue").first()).toBeVisible();
  await expect(page.getByText("Media-ready cards")).toBeVisible();

  await page.goto(`/products/${manifest.entities.public.product_id}`);
  await expect(
    page.getByRole("main").getByText("Base price", { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText("Product code").first()).toBeVisible();
  await page.getByRole("link", { name: "Enquire Now" }).click();
  await expect(page).toHaveURL(/\/apply\?/);
  await expect(page.getByText("Selected Product Context")).toBeVisible();

  await page.getByLabel("Name").fill("Playwright Public Lead");
  await page.getByLabel("Phone").fill(phone);
  await page.getByLabel("City / Area").fill("Dhaka");
  await page
    .getByRole("button", { name: "Submit Application" })
    .click();

  await expect(page.getByText(/Application submitted successfully\./)).toBeVisible();
  await expect(page.getByText(/Reference #5501\./)).toBeVisible();
});

test("public product detail keeps enquiry workflow and catalogue facts visible", async ({
  page,
}) => {
  const manifest = readSmokeManifest();

  await page.goto(`/products/${manifest.entities.public.product_id}`);
  await expect(page.getByText("Product code").first()).toBeVisible();
  await expect(page.getByText("Media state").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Enquire Now" })).toBeVisible();
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
  await expect(page.locator("body")).toContainText("Public commit hash");
  await expect(page.locator("body")).toContainText("Verification");
  await expect(page.locator("body")).not.toContainText("winner_customer_name");
});

test("public stats section renders explicit live-data contract copy", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Live public business signals", exact: true })
  ).toBeVisible();
  await expect(page.locator("body")).toContainText(
    /Published batches|Live public stats are currently unavailable\./i
  );
});

test("latest winner section shows a truthful live or empty state", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Latest winner").first()).toBeVisible();
  await expect(page.locator("body")).toContainText(
    /No winner published yet|Latest published draw result/i
  );
});

test("public fair draw pages surface commitment and masked winner trust details", async ({
  page,
}) => {
  const manifest = readSmokeManifest();

  await page.goto("/lucky-plan/fair-draw");
  await expect(page.getByRole("heading", { name: "Fair Draw" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Commitment hash first, reveal later");
  await expect(page.locator("body")).toContainText("Sealed envelope");

  await page.goto(`/lucky-plan/fair-draw/${manifest.entities.public.winner_draw_id}`);
  await expect(page.getByRole("heading", { name: /Fair Draw #/ })).toBeVisible();
  await expect(page.locator("body")).toContainText("Public verification record");
  await expect(page.locator("body")).toContainText("Masked public winner detail");
  await expect(page.locator("body")).not.toContainText("customer_phone");
});
