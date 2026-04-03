import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("admin dashboard loads and subscription detail handoff preserves payment context", async ({
  page,
}) => {
  const manifest = readSmokeManifest();

  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Admin Operations" })
  ).toBeVisible();

  await page.goto(
    `/admin/subscriptions/${manifest.entities.admin.subscription_id}`
  );
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`Subscription #${manifest.entities.admin.subscription_id}`),
    })
  ).toBeVisible();

  await page.getByRole("link", { name: "Collect Payment" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/admin/payments/create\\?subscription=${manifest.entities.admin.subscription_id}$`
    )
  );
  await expect(page.locator("#subscription_id")).toHaveValue(
    String(manifest.entities.admin.subscription_id)
  );
  await expect(page.locator("#emi_id")).not.toHaveValue("");
});

test("admin payment create search uses q query contract and returns results", async ({
  page,
}) => {
  const manifest = readSmokeManifest();
  const requestUrls: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/v1/admin/subscriptions/")) {
      requestUrls.push(request.url());
    }
  });

  await page.goto("/admin/payments/create");
  await page.getByLabel("Search subscription").fill(
    manifest.entities.admin.search_query
  );

  await page.waitForResponse(
    (response) =>
      response.url().includes(
        `/api/v1/admin/subscriptions/?q=${manifest.entities.admin.search_query}`
      ) && response.ok()
  );

  await expect(
    page.getByRole("button", {
      name: new RegExp(`^${manifest.entities.admin.subscription_number}\\s`),
    })
  ).toBeVisible();
  expect(
    requestUrls.some((url) =>
      url.includes(
        `/api/v1/admin/subscriptions/?q=${manifest.entities.admin.search_query}`
      )
    )
  ).toBeTruthy();
  expect(
    requestUrls.some((url) =>
      url.includes("/api/v1/admin/subscriptions/?search=")
    )
  ).toBeFalsy();
});

test("admin customer detail handoff preserves subscription-create customer prefill", async ({
  page,
}) => {
  const manifest = readSmokeManifest();

  await page.goto(`/admin/customers/${manifest.entities.admin.customer_id}`);
  await expect(
    page.getByRole("heading", { name: manifest.entities.admin.customer_name })
  ).toBeVisible();

  await page
    .locator(
      `a[href="/admin/subscriptions/create?customer=${manifest.entities.admin.customer_id}"]`
    )
    .first()
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/admin/subscriptions/create\\?customer=${manifest.entities.admin.customer_id}$`
    )
  );
  await expect(
    page.getByText(
      `${manifest.entities.admin.customer_name} (${manifest.entities.admin.search_query})`
    ).first()
  ).toBeVisible();
});

test("admin analytics shows an error state instead of fake zero fallback on dashboard failure", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/dashboard/", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Smoke analytics failure" }),
    });
  });

  await page.goto("/admin/analytics");
  await expect(
    page.getByText("Unable to load analytics")
  ).toBeVisible();
  await expect(page.getByText("Active Subscriptions")).not.toBeVisible();
});

test("legacy overdue admin route redirects to canonical overdue workspace", async ({
  page,
}) => {
  await page.goto("/admin/emi/overdue");
  await expect(page).toHaveURL(/\/admin\/emis\/overdue$/);
});

test("legacy commission and reconciliation routes redirect to canonical admin workspaces", async ({
  page,
}) => {
  await page.goto("/admin/partners/commisions?partner=7");
  await expect(page).toHaveURL(/\/admin\/finance\/commissions\?partner=7$/);

  await page.goto("/admin/partner/commissions?partner=7");
  await expect(page).toHaveURL(/\/admin\/finance\/commissions\?partner=7$/);

  await page.goto("/admin/finance/reconciliation?status=OPEN");
  await expect(page).toHaveURL(/\/admin\/finance\/reconciliation\?status=OPEN$/);
});
