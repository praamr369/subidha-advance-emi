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

test("admin customer CSV import preview enables confirm-import only after a clean preview", async ({
  page,
}) => {
  let previewCalls = 0;
  let importCalls = 0;

  await page.route("**/api/v1/admin/customers/import/preview/", async (route) => {
    previewCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        columns: ["name", "phone"],
        preview_rows: [
          {
            row_number: 2,
            name: "Import Ready Customer",
            phone: "9100000001",
            valid: true,
          },
        ],
        errors: [],
        valid_count: 1,
        invalid_count: 0,
      }),
    });
  });

  await page.route("**/api/v1/admin/customers/import-csv/", async (route) => {
    importCalls += 1;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        created: 1,
        skipped: 0,
        row_count: 1,
        rows: [
          {
            row_number: 2,
            name: "Import Ready Customer",
            phone: "9100000001",
            created_customer_id: 501,
            created_user_id: 801,
            generated_username: "importreadycustomer",
          },
        ],
      }),
    });
  });

  await page.goto("/admin/customers");
  await page
    .locator("#customer-import-file")
    .setInputFiles({
      name: "customers.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("name,phone\nImport Ready Customer,9100000001\n"),
    });

  await expect(
    page.getByRole("button", { name: "Confirm Import" })
  ).toBeDisabled();

  await page.getByRole("button", { name: "Preview CSV" }).click();

  await expect(page.locator("body")).toContainText("Preview ready. 1 row can be imported safely.");
  await expect(
    page.getByRole("button", { name: "Confirm Import" })
  ).toBeEnabled();

  await page.getByRole("button", { name: "Confirm Import" }).click();

  await expect(page.locator("body")).toContainText("Customer import completed. Created 1 row and skipped 0.");
  await expect(page.locator("body")).toContainText("importreadycustomer");
  expect(previewCalls).toBe(1);
  expect(importCalls).toBe(1);
});

test("dead batch lucky-id generation route redirects to canonical batch detail", async ({
  page,
}) => {
  await page.goto("/admin/batches/999999/generate-lucky-ids");
  await expect(page).toHaveURL(/\/admin\/batches\/999999$/);
});

test("admin batch edit only exposes canonical lifecycle targets", async ({
  page,
}) => {
  let currentStatus = "OPEN";
  let postedStatus = "";

  await page.route("**/api/v1/admin/batches/42/summary/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 42,
        batch_code: "BATCH-42",
        status: currentStatus,
        duration_months: 12,
        total_slots: 100,
        draw_day: 5,
        start_date: "2026-04-01",
        subscription_count: 60,
        active_subscription_count: 60,
        won_subscription_count: 0,
        available_lucky_ids: 40,
        assigned_lucky_ids: 60,
        won_lucky_ids: 0,
        monthly_booked_value: "60000.00",
        draw_count: 0,
      }),
    });
  });

  await page.route("**/api/v1/admin/batches/42/transition-status/", async (route) => {
    const payload = route.request().postDataJSON() as { status?: string };
    postedStatus = String(payload.status ?? "");
    currentStatus = postedStatus || currentStatus;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 42,
        batch_code: "BATCH-42",
        total_slots: 100,
        duration_months: 12,
        draw_day: 5,
        start_date: "2026-04-01",
        status: currentStatus,
        created_at: "2026-04-01T08:30:00Z",
      }),
    });
  });

  await page.route("**/api/v1/admin/batches/42/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 42,
        batch_code: "BATCH-42",
        total_slots: 100,
        duration_months: 12,
        draw_day: 5,
        start_date: "2026-04-01",
        status: currentStatus,
        created_at: "2026-04-01T08:30:00Z",
      }),
    });
  });

  await page.goto("/admin/batches/42/edit");
  await expect(
    page.getByRole("heading", { name: "Edit BATCH-42" })
  ).toBeVisible();

  const optionTexts = await page
    .locator("#target-status option")
    .evaluateAll((options) => options.map((option) => option.textContent?.trim()));

  expect(optionTexts).toEqual([
    "Select next status",
    "FULL",
    "DRAW_IN_PROGRESS",
  ]);
  expect(optionTexts).not.toContain("ACTIVE");
  expect(optionTexts).not.toContain("CANCELLED");
  await expect(page.locator("body")).toContainText(
    "OPEN can move to FULL or DRAW_IN_PROGRESS."
  );

  await page.locator("#target-status").selectOption("DRAW_IN_PROGRESS");
  await page.getByRole("button", { name: "Change Status" }).click();

  await expect(page.locator("body")).toContainText(
    "Batch status changed to DRAW_IN_PROGRESS."
  );
  expect(postedStatus).toBe("DRAW_IN_PROGRESS");
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
