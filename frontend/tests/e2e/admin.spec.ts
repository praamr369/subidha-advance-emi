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

test("admin customer create success exposes OTP access handoff without echoing the password", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/customers/", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: 620,
        user: 911,
        user_username: "newcustomer620",
        name: "New Customer",
        phone: "01988001122",
        kyc_status: "PENDING",
        created_at: "2026-04-04T06:00:00Z",
      }),
    });
  });

  await page.goto("/admin/customers/create");
  await page.locator("#customer-name").fill("New Customer");
  await page.locator("#customer-phone").fill("01988001122");
  await page.locator("#customer-username").fill("newcustomer620");
  await page.locator("#customer-password").fill("SecurePass123!");
  await page.getByRole("button", { name: "Create Customer" }).click();

  await expect(page.locator("body")).toContainText("Customer access handoff");
  await expect(page.locator("body")).toContainText("newcustomer620");
  await expect(page.locator("body")).toContainText("01988001122");
  await expect(page.locator("body")).not.toContainText("SecurePass123!");

  await page.getByRole("link", { name: "Start OTP Reset" }).click();
  await expect(page).toHaveURL(/\/forgot-password\?identifier=01988001122$/);
  await expect(page.locator("#identifier")).toHaveValue("01988001122");
  await expect(page.locator("body")).toContainText(
    "request a 6-digit reset code"
  );
});

test("admin customer detail shows OTP access handoff for existing customer", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/customers/55/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 55,
        name: "Access Ready Customer",
        phone: "01755555555",
        email: "access@example.com",
        user: 405,
        user_username: "accessready55",
        status: "ACTIVE",
        kyc_status: "PENDING",
        created_at: "2026-04-04T06:00:00Z",
      }),
    });
  });

  await page.route("**/api/v1/admin/subscriptions/?customer=55", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });

  await page.route("**/api/v1/admin/payments/?customer=55", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });

  await page.goto("/admin/customers/55");
  await expect(page.locator("body")).toContainText("Access Handoff");
  await expect(page.locator("body")).toContainText("accessready55");
  await expect(page.locator("body")).toContainText("01755555555");
  await expect(
    page.locator('a[href="/forgot-password?identifier=01755555555"]')
  ).toBeVisible();
});

test("public OTP reset flow supports prefilled identifier, resend, and manual code entry", async ({
  page,
}) => {
  let forgotPayload: Record<string, unknown> | null = null;
  let resendPayload: Record<string, unknown> | null = null;
  let resetPayload: Record<string, unknown> | null = null;

  await page.route("**/api/v1/auth/forgot-password/", async (route) => {
    forgotPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "If an eligible account exists, a reset code has been sent.",
      }),
    });
  });

  await page.route("**/api/v1/auth/resend-reset-otp/", async (route) => {
    resendPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "OTP resent successfully.",
      }),
    });
  });

  await page.route("**/api/v1/auth/reset-password/", async (route) => {
    resetPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Password reset completed.",
      }),
    });
  });

  await page.goto("/forgot-password?identifier=01977001122");
  await expect(page.locator("#identifier")).toHaveValue("01977001122");
  await page.getByRole("button", { name: "Send reset code" }).click();

  await expect(page.locator("body")).toContainText(
    "If an eligible account exists, a reset code has been requested."
  );
  expect(forgotPayload).toMatchObject({ identifier: "01977001122" });

  await page.getByRole("link", { name: "Continue With OTP" }).click();
  await expect(page).toHaveURL(/\/reset-password\?identifier=01977001122$/);
  await expect(page.locator("#identifier")).toHaveValue("01977001122");

  await page.getByRole("button", { name: "Resend OTP" }).click();
  await expect(page.locator("body")).toContainText("OTP resent successfully.");
  expect(resendPayload).toMatchObject({ identifier: "01977001122" });

  await page.locator("#otp").fill("123456");
  await page.locator("#password").fill("ResetPass123");
  await page.locator("#confirm-password").fill("ResetPass123");
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page.locator("body")).toContainText(
    "Password reset successfully! Redirecting to login..."
  );
  expect(resetPayload).toMatchObject({
    identifier: "01977001122",
    otp: "123456",
    new_password: "ResetPass123",
    confirm_password: "ResetPass123",
  });
});

test("admin subscription create speeds up repeated onboarding without changing backend contract", async ({
  page,
}) => {
  const customerSearchUrls: string[] = [];
  const productSearchUrls: string[] = [];
  const batchSearchUrls: string[] = [];
  let luckyPreviewCalls = 0;
  let createdSubscriptionBody: Record<string, unknown> | null = null;

  await page.route("**/api/v1/admin/customers/search/**", async (route) => {
    customerSearchUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 101,
          name: "Rahim Uddin",
          phone: "01711111111",
          kyc_status: "APPROVED",
        },
      ]),
    });
  });

  await page.route("**/api/v1/admin/products/search/**", async (route) => {
    productSearchUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 202,
          name: "Classic Wardrobe",
          product_code: "ALM-7",
          base_price: "360000.00",
          category: "Furniture",
          subcategory: "Wardrobe",
          is_emi_enabled: true,
          is_rent_enabled: true,
          is_lease_enabled: false,
        },
      ]),
    });
  });

  await page.route("**/api/v1/admin/batches/?q=*", async (route) => {
    batchSearchUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            id: 17,
            batch_code: "APR-2026-OPEN",
            status: "OPEN",
            duration_months: 12,
            draw_day: 5,
            start_date: "2026-04-05",
            available_slots: 15,
          },
        ],
      }),
    });
  });

  await page.route("**/api/v1/admin/lucky-ids/available/?batch_id=17", async (route) => {
    luckyPreviewCalls += 1;
    const availableCount = luckyPreviewCalls === 1 ? 15 : 14;
    const luckyIds = Array.from({ length: availableCount }, (_, index) => ({
      id: 700 + index,
      lucky_number: 7 + index,
      status: "AVAILABLE",
      batch: 17,
    }));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: availableCount,
        results: luckyIds,
      }),
    });
  });

  await page.route("**/api/v1/admin/subscriptions/", async (route) => {
    createdSubscriptionBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: 8801,
        customer: 101,
        product: 202,
        batch: 17,
        lucky_id: 707,
        partner: null,
        plan_type: "EMI",
        tenure_months: 12,
        start_date: "2026-04-04",
        total_amount: "360000.00",
        monthly_amount: "30000.00",
        status: "ACTIVE",
      }),
    });
  });

  await page.goto("/admin/subscriptions/create");

  const customerInput = page.locator(
    'input[placeholder="Search customer by name or phone"]'
  );
  const productInput = page.locator(
    'input[placeholder="Search product by name or code"]'
  );
  const batchInput = page.locator('input[placeholder="Search batch by code"]');

  await customerInput.fill("01711111111");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/admin/customers/search/?q=01711111111") &&
        response.ok()
    ),
    customerInput.press("Enter"),
  ]);
  await page.getByRole("button", { name: /Rahim Uddin/ }).click();

  await productInput.fill("ALM-7");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/admin/products/search/?q=ALM-7") &&
        response.ok()
    ),
    productInput.press("Enter"),
  ]);
  await page.getByRole("button", { name: /Classic Wardrobe/ }).click();

  await expect(page.locator("body")).toContainText("Enabled modes EMI / RENT");

  await batchInput.fill("APR-2026-OPEN");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/admin/batches/?q=APR-2026-OPEN") &&
        response.ok()
    ),
    batchInput.press("Enter"),
  ]);
  await page.getByRole("button", { name: /APR-2026-OPEN/ }).click();

  await expect(page.locator("body")).toContainText(
    "APR-2026-OPEN is ready for EMI onboarding."
  );
  await expect(page.locator("body")).toContainText(
    "15 Lucky IDs are currently available in APR-2026-OPEN."
  );
  await expect(page.locator("body")).toContainText(
    "Showing the first 12 available Lucky IDs for quick pick."
  );

  await page.getByRole("button", { name: "Create Subscription" }).click();

  await expect(page.locator("body")).toContainText("Subscription created");
  await expect(
    page.getByRole("button", { name: "Create Another With Same Setup" })
  ).toBeVisible();

  expect(customerSearchUrls).toHaveLength(1);
  expect(productSearchUrls).toHaveLength(1);
  expect(batchSearchUrls).toHaveLength(1);
  expect(customerSearchUrls[0]).toContain("/api/v1/admin/customers/search/?q=01711111111");
  expect(productSearchUrls[0]).toContain("/api/v1/admin/products/search/?q=ALM-7");
  expect(createdSubscriptionBody).toMatchObject({
    customer: 101,
    product: 202,
    batch: 17,
    lucky_id: null,
    plan_type: "EMI",
    tenure_months: 12,
  });

  await page.getByRole("button", { name: "Create Another With Same Setup" }).click();

  await expect(customerInput).toHaveValue("");
  await expect(page.locator("body")).toContainText("Classic Wardrobe (ALM-7)");
  await expect(page.locator("body")).toContainText("APR-2026-OPEN is ready for EMI onboarding.");
  await expect(page.locator("body")).toContainText(
    "14 Lucky IDs are currently available in APR-2026-OPEN."
  );
  expect(luckyPreviewCalls).toBeGreaterThanOrEqual(2);
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
  await expect(
    page.locator('a[href="/forgot-password?identifier=9100000001"]')
  ).toBeVisible();
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
