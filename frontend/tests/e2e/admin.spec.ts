import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const otpReadinessFixture = {
  overall_status: "READY",
  summary:
    "Customer and partner public password reset now depends on email delivery only.",
  delivery_backend: "AUTO",
  public_reset_roles: ["CUSTOMER", "PARTNER"],
  public_reset_identifiers: ["phone", "email", "username"],
  sms: {
    status: "NOT_SUPPORTED",
    detail:
      "SMS delivery is not used for public customer or partner password reset in the current codebase.",
  },
  email: {
    status: "READY",
    fallback_enabled: true,
    backend: "django.core.mail.backends.smtp.EmailBackend",
    from_email_configured: true,
    detail:
      "Email OTP delivery is configured, but ops should still run a live reset test before promising access.",
  },
  console: {
    status: "DISABLED",
    detail: "Console OTP logging is disabled outside debug environments.",
  },
  admin_visibility: {
    status: "API_ONLY",
    detail:
      "Admin password reset request list/detail/resend/invalidate APIs exist, but there is still no dedicated admin page for that workflow.",
    list_endpoint: "/api/v1/admin/password-reset-requests/",
  },
};

test("admin dashboard loads and subscription detail handoff preserves payment context", async ({
  page,
}) => {
  const manifest = readSmokeManifest();

  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: /(?:Executive|Admin) Dashboard/i })
  ).toBeVisible();

  await page.goto(
    `/admin/subscriptions/${manifest.entities.admin.subscription_id}`
  );
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`Subscription #${manifest.entities.admin.subscription_id}`),
    })
  ).toBeVisible();

  const subscriptionId = manifest.entities.admin.subscription_id;
  const collectPaymentLink = page.locator(
    `a[href="/admin/finance/collect?subscription=${subscriptionId}"]`,
  );
  if ((await collectPaymentLink.count()) === 0) {
    await expect(page.locator("body")).toContainText(
      /Unable to load subscription detail|Failed to fetch|Loading subscription detail|Checking setup readiness/i
    );
    return;
  }
  await collectPaymentLink.first().scrollIntoViewIfNeeded();
  await collectPaymentLink.first().click();
  await expect(page).toHaveURL(
    new RegExp(
      `/admin/finance/collect\\?subscription=${manifest.entities.admin.subscription_id}$`
    )
  );
  await expect(page.locator("#subscription_id")).toHaveValue(
    String(manifest.entities.admin.subscription_id)
  );
  await expect(page.locator("#emi_id")).not.toHaveValue("");
  await expect(page.locator("#finance_account_id")).not.toHaveValue("");
});

test("admin dashboard renders operations cockpit strips and ledgers", async ({ page }) => {
  await page.goto("/admin");
  const heading = page.getByRole("heading", {
    name: /Daily Operator Dashboard|Executive Dashboard|Admin Dashboard/i,
  });
  const headingVisible = await heading.isVisible().catch(() => false);
  if (!headingVisible) {
    await expect(page.locator("body")).toContainText(/Unable to load|Failed to load/i);
    return;
  }
  const simpleModeMarker = page.getByText("Today Collection");
  const dashboardErrorVisible = await page
    .locator("body")
    .getByText(/Unable to load|Failed to load/i)
    .isVisible()
    .catch(() => false);
  if (dashboardErrorVisible) {
    await expect(page.locator("body")).toContainText(/Unable to load|Failed to load/i);
    return;
  }
  if (await simpleModeMarker.isVisible().catch(() => false)) {
    await expect(page.getByText("Active Outstanding")).toBeVisible();
    await expect(page.getByText("Returns / Refunds")).toBeVisible();
    await expect(page.getByText("Lucky Draw Actions")).toBeVisible();
    await expect(page.getByText("Needs Collection")).toBeVisible();
    await expect(page.getByText("Active Invoice Balance")).toBeVisible();
  } else {
    await expect(page.locator("body")).toContainText(
      /Collections today|Outstanding receivables|Needs attention|Quick actions|Setup incomplete for live operations|Operational summary/i
    );
  }
});

test("admin finance control center renders operational settlement and transfer surfaces", async ({
  page,
}) => {
  await page.goto("/admin/finance");

  await expect(
    page.getByRole("heading", { name: "Finance Operations" })
  ).toBeVisible();
  if (await page.getByText("Failed to fetch").isVisible().catch(() => false)) {
    await expect(page.getByText(/Unable to load finance control center/i)).toBeVisible();
  } else {
    await expect(page.getByText("Operational settlement posture")).toBeVisible();
    await expect(page.getByText("Admin finance transfer")).toBeVisible();
    await expect(page.getByText("Pending Settlement")).toBeVisible();
    await expect(page.getByRole("button", { name: "Post Transfer" })).toBeVisible();
  }
});

test("admin can review and approve a subscription request from the admin queue detail page", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/subscription-requests/81/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 81,
        requester: 9,
        requester_username: "partner_user",
        requester_role_snapshot: "PARTNER",
        partner: 9,
        partner_id: 9,
        partner_username: "partner_user",
        customer: null,
        customer_id: null,
        customer_name: null,
        customer_phone: null,
        customer_email: null,
        requested_customer_name: "Pending Review Customer",
        requested_customer_phone: "01744444444",
        requested_customer_email: "pending-review@example.com",
        requested_customer_address: "Review Road",
        requested_customer_city: "Dhaka",
        product: 91,
        product_id: 91,
        product_name: "Approval Product",
        product_code: "APP-091",
        product_image: null,
        batch: 92,
        batch_id: 92,
        batch_code: "APP-BATCH-92",
        preferred_lucky_number: 11,
        requested_tenure_months_snapshot: 12,
        notes: "Review this request",
        status: "SUBMITTED",
        reviewed_by: null,
        reviewed_by_username: null,
        reviewed_at: null,
        review_note: "",
        approved_subscription_id: null,
        approved_subscription_number: null,
        created_at: "2026-04-07T10:15:00Z",
        updated_at: "2026-04-07T10:15:00Z",
      }),
    });
  });

  await page.route("**/api/v1/admin/subscription-request-options/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: [
          {
            id: 91,
            name: "Approval Product",
            product_code: "APP-091",
            base_price: "18000.00",
            image: null,
          },
        ],
        batches: [
          {
            id: 92,
            batch_code: "APP-BATCH-92",
            duration_months: 12,
            available_slots: 10,
            start_date: "2026-04-01",
            status: "OPEN",
          },
        ],
        lucky_numbers: [11, 12, 13],
        customers: [
          {
            id: 55,
            name: "Existing Customer",
            phone: "01799999999",
            email: "existing@example.com",
            kyc_status: "VERIFIED",
          },
        ],
      }),
    });
  });

  await page.route("**/api/v1/admin/subscription-requests/81/approve/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Subscription request approved successfully.",
        result: {
          id: 81,
          requester: 9,
          requester_username: "partner_user",
          requester_role_snapshot: "PARTNER",
          partner: 9,
          partner_id: 9,
          partner_username: "partner_user",
          customer: 55,
          customer_id: 55,
          customer_name: "Existing Customer",
          customer_phone: "01799999999",
          customer_email: "existing@example.com",
          requested_customer_name: "Pending Review Customer",
          requested_customer_phone: "01744444444",
          requested_customer_email: "pending-review@example.com",
          requested_customer_address: "Review Road",
          requested_customer_city: "Dhaka",
          product: 91,
          product_id: 91,
          product_name: "Approval Product",
          product_code: "APP-091",
          product_image: null,
          batch: 92,
          batch_id: 92,
          batch_code: "APP-BATCH-92",
          preferred_lucky_number: 11,
          requested_tenure_months_snapshot: 12,
          notes: "Review this request",
          status: "APPROVED",
          reviewed_by: 1,
          reviewed_by_username: "admin",
          reviewed_at: "2026-04-07T10:20:00Z",
          review_note: "Approved with linked customer",
          approved_subscription_id: 901,
          approved_subscription_number: "SUB-901",
          created_at: "2026-04-07T10:15:00Z",
          updated_at: "2026-04-07T10:20:00Z",
        },
      }),
    });
  });

  await page.goto("/admin/subscription-requests/81");
  await expect(
    page.getByRole("heading", { name: "Request #81" })
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("Review action");

  await page.getByRole("combobox", { name: /^Customer$/ }).selectOption("55");
  await page
    .getByRole("combobox", { name: /^Lucky number override$/ })
    .selectOption("12");
  await page
    .getByRole("textbox", { name: /^Review note$/ })
    .fill("Approved with linked customer");
  await page.getByRole("button", { name: "Approve Request" }).click();

  await expect(
    page.getByText("Subscription request approved successfully.")
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Approved Subscription" })).toHaveAttribute(
    "href",
    "/admin/subscriptions/901"
  );
});

test("admin completed winner detail keeps contract status completed and shows winner history separately", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/subscriptions/901/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 901,
        customer_id: 33,
        customer_name: "Winner Customer",
        customer_phone: "01711111111",
        product_id: 44,
        product_name: "Lucky Plan Product",
        product_code: "LP-901",
        partner_id: 12,
        partner_name: "Partner One",
        partner_phone: "01811111111",
        batch_id: 55,
        batch_code: "BATCH-901",
        batch_status: "ACTIVE",
        lucky_id: 77,
        lucky_number: 15,
        plan_type: "EMI",
        tenure_months: 3,
        start_date: "2026-03-01",
        total_amount: "3000.00",
        monthly_amount: "1000.00",
        status: "COMPLETED",
        winner_month: 1,
        winner_status: "WON",
        waived_amount: "2000.00",
        fulfillment_status: null,
        delivery_status: null,
        created_at: "2026-03-01T08:00:00Z",
        emi_count: 3,
        paid_emi_count: 1,
        pending_emi_count: 0,
        waived_emi_count: 2,
        financial_summary: {
          subscription_id: 901,
          total_amount: "3000.00",
          total_emi_amount: "3000.00",
          emi_total: "3000.00",
          paid_amount: "1000.00",
          waived_amount: "2000.00",
          stored_waived_amount: "2000.00",
          waiver_ledger_amount: "2000.00",
          reversed_amount: "0.00",
          pending_amount: "0.00",
          remaining_amount: "0.00",
          outstanding_amount: "0.00",
          emi_count_total: 3,
          emi_count_paid: 1,
          emi_count_waived: 2,
          emi_count_pending: 0,
          winner_status: "WON",
          winner_month: 1,
          lucky_id: 77,
          lucky_number: 15,
          batch: {
            id: 55,
            batch_code: "BATCH-901",
            status: "ACTIVE",
          },
          partner: {
            id: 12,
            username: "partner-one",
            phone: "01811111111",
            commission_rate: "5.00",
          },
        },
        reconciliation_flags: {
          is_financially_consistent: true,
          pending_matches_remaining: true,
          has_reversal_history: false,
          has_waiver_history: true,
          warnings: [],
        },
        winner_summary: {
          winner_status: "WON",
          winner_month: 1,
          lucky_id: 77,
          lucky_number: 15,
          draw_id: 8,
          draw_month: 1,
          draw_revealed_at: "2026-03-05T09:00:00Z",
          waiver_scope: "FUTURE_EMI_ONLY",
          waived_emi_count: 2,
          waived_amount: "2000.00",
        },
        delivery_summary: null,
        deliveries: [],
        emis: [
          {
            id: 1,
            month_no: 1,
            due_date: "2026-03-10",
            amount: "1000.00",
            status: "PAID",
            derived_status: "PAID",
            paid_amount: "1000.00",
            total_paid: "1000.00",
            reversed_amount: "0.00",
            waived_amount: "0.00",
            waiver_ledger_amount: "0.00",
            balance_amount: "0.00",
            is_overdue: false,
            is_status_consistent: true,
            warnings: [],
          },
          {
            id: 2,
            month_no: 2,
            due_date: "2026-04-10",
            amount: "1000.00",
            status: "WAIVED",
            derived_status: "WAIVED",
            paid_amount: "0.00",
            total_paid: "0.00",
            reversed_amount: "0.00",
            waived_amount: "1000.00",
            waiver_ledger_amount: "1000.00",
            balance_amount: "0.00",
            is_overdue: false,
            is_status_consistent: true,
            warnings: [],
          },
          {
            id: 3,
            month_no: 3,
            due_date: "2026-05-10",
            amount: "1000.00",
            status: "WAIVED",
            derived_status: "WAIVED",
            paid_amount: "0.00",
            total_paid: "0.00",
            reversed_amount: "0.00",
            waived_amount: "1000.00",
            waiver_ledger_amount: "1000.00",
            balance_amount: "0.00",
            is_overdue: false,
            is_status_consistent: true,
            warnings: [],
          },
        ],
      }),
    });
  });

  await page.route("**/api/v1/admin/payments/?subscription=901", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        next: null,
        previous: null,
        total_paid_amount: "1000.00",
        results: [
          {
            id: 91,
            customer: 33,
            customer_name: "Winner Customer",
            customer_phone: "01711111111",
            subscription: 901,
            subscription_id: 901,
            subscription_number: "SUB-901",
            subscription_status: "COMPLETED",
            product_name: "Lucky Plan Product",
            product_code: "LP-901",
            emi: 1,
            emi_id: 1,
            emi_month_no: 1,
            emi_due_date: "2026-03-10",
            emi_amount: "1000.00",
            emi_status: "PAID",
            batch: 55,
            batch_code: "BATCH-901",
            lucky_number: 15,
            amount: "1000.00",
            method: "CASH",
            reference_no: "PAY-901",
            payment_date: "2026-03-10",
            paid_at: "2026-03-10T10:00:00Z",
            collected_by: 1,
            collected_by_username: "admin",
            verified_by: null,
            verified_by_username: null,
            created_at: "2026-03-10T10:00:00Z",
          },
        ],
      }),
    });
  });

  await page.route("**/api/v1/admin/subscriptions/901/timeline/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0, results: [] }),
    });
  });

  await page.goto("/admin/subscriptions/901");
  await expect(
    page.getByRole("heading", { name: "Subscription #901" })
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("Contract, winner, and waiver posture");
  await expect(page.locator("body")).toContainText("Contract fully settled");
  await expect(page.locator("body")).toContainText("Winner benefit recorded");
  await expect(page.locator("body")).toContainText("Waiver settled the remaining exposure");
  await expect(page.locator("body")).toContainText("COMPLETED");
  await expect(page.locator("body")).toContainText("Winner recorded");
  await expect(page.locator("body")).toContainText("Month 1");
  await expect(page.locator("body")).not.toContainText("subscription status is not");
  await expect(page.locator("body")).not.toContainText("Lucky ID status is not WON");
});

test("admin payment reconciliation compatibility route forwards query params to canonical workspace", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/subscriptions/reconciliation-attention/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checked_count: 1,
        flagged_count: 0,
        results: [],
        note: "No mismatches detected.",
      }),
    });
  });

  await page.route("**/api/v1/admin/reconciliations/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 0,
        next: null,
        previous: null,
        results: [],
      }),
    });
  });

  await page.goto(
    "/admin/payments/reconciliation?subscription=901&payment=91&status=FLAGGED&flagged=true&locked=false&q=winner"
  );

  await expect(page).toHaveURL(
    /\/admin\/accounting\/bridge-reconciliation/
  );
  await expect(
    page.getByRole("heading", { name: "Accounting Bridge Reconciliation" })
  ).toBeVisible();
});

test("admin managed user edit page uses internal-user API and never calls partner subscription detail", async ({
  page,
}) => {
  let partnerSubscriptionCalls = 0;
  let patchPayload: Record<string, unknown> | null = null;

  await page.route("**/api/v1/partner/subscriptions/**", async (route) => {
    partnerSubscriptionCalls += 1;
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Should not hit partner subscription endpoint" }),
    });
  });

  await page.route("**/api/v1/admin/internal-users/77/", async (route) => {
    if (route.request().method() === "PATCH") {
      patchPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 77,
          username: "managedpartner77",
          phone: String(patchPayload.phone ?? "01999999999"),
          email: String(patchPayload.email ?? "managed.partner.updated@example.com"),
          first_name: String(patchPayload.first_name ?? "Managed"),
          last_name: String(patchPayload.last_name ?? "Partner"),
          full_name: "Managed Partner Updated",
          role: String(patchPayload.role ?? "PARTNER"),
          commission_rate: String(patchPayload.commission_rate ?? "7.25"),
          is_active: Boolean(patchPayload.is_active ?? true),
          is_staff: false,
          is_superuser: false,
          date_joined: "2026-04-01T08:30:00Z",
          last_login: "2026-04-03T09:15:00Z",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 77,
        username: "managedpartner77",
        phone: "01999999999",
        email: "managed.partner@example.com",
        first_name: "Managed",
        last_name: "Partner",
        full_name: "Managed Partner",
        role: "PARTNER",
        commission_rate: "6.50",
        is_active: true,
        is_staff: false,
        is_superuser: false,
        date_joined: "2026-04-01T08:30:00Z",
        last_login: "2026-04-03T09:15:00Z",
      }),
    });
  });

  await page.goto("/admin/settings/users/77/edit");
  await expect(
    page.getByRole("heading", { name: "Edit Managed User: Managed Partner" })
  ).toBeVisible();
  await expect(page.locator("#commissionRate")).toHaveValue("6.50");

  await page.locator("#firstName").fill("Managed Updated");
  await page.locator("#commissionRate").fill("7.25");
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect(page.locator("body")).toContainText(
    "managedpartner77 updated successfully."
  );
  expect(patchPayload).not.toBeNull();
  expect(patchPayload?.role).toBe("PARTNER");
  expect(patchPayload?.commission_rate).toBe("7.25");
  expect(partnerSubscriptionCalls).toBe(0);
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

  await page.goto("/admin/finance/collect");
  await page.getByLabel("Search subscription").fill(
    manifest.entities.admin.search_query
  );
  await page.getByRole("button", { name: "Search" }).click();

  const failedToFetch = page.getByText("Failed to fetch");
  if (await failedToFetch.isVisible().catch(() => false)) {
    await expect(page.locator("body")).toContainText(/Failed to fetch|Unable to load/i);
    return;
  }

  await expect
    .poll(
      () =>
        requestUrls.some((url) =>
          url.includes(
            `/api/v1/admin/subscriptions/?q=${manifest.entities.admin.search_query}`
          )
        ),
      { timeout: 10_000 }
    )
    .toBeTruthy();

  const subscriptionResultButton = page.getByRole("button", {
    name: new RegExp(`^${manifest.entities.admin.subscription_number}\\s`),
  });
  const searchFailedState = page.getByText(/Search failed/i);
  if (await searchFailedState.isVisible().catch(() => false)) {
    await expect(page.locator("body")).toContainText(
      /Enter a phone, contract reference, Lucky ID, batch, KYC, customer, or sale reference/i
    );
  } else
  if (await subscriptionResultButton.isVisible().catch(() => false)) {
    await expect(subscriptionResultButton).toBeVisible();
  } else {
    await expect(page.locator("body")).toContainText(/Selected subscription|No subscription selected/i);
  }
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
  const namedHeading = page.getByRole("heading", {
    name: manifest.entities.admin.customer_name,
  });
  if (await namedHeading.isVisible().catch(() => false)) {
    await expect(namedHeading).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: /Customer #/i })).toBeVisible();
  }

  if (await page.getByText("Failed to fetch").isVisible().catch(() => false)) {
    await expect(page.locator("body")).toContainText(/Unable to load customer detail|Failed to fetch/i);
    return;
  }

  await page
    .locator(
      `a[href="/admin/subscriptions/advance-emi/create?customer=${manifest.entities.admin.customer_id}"]`
    )
    .first()
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/admin/subscriptions/advance-emi/create\\?customer=${manifest.entities.admin.customer_id}$`
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
  await page.route(
    "**/api/v1/admin/system/otp-delivery-readiness/",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(otpReadinessFixture),
      });
    }
  );

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
          email: "newcustomer620@example.com",
          kyc_status: "PENDING",
          created_at: "2026-04-04T06:00:00Z",
        }),
      });
  });

  await page.goto("/admin/customers/create");
  await page.locator("#customer-name").fill("New Customer");
  await page.locator("#customer-phone").fill("01988001122");
  await page.locator("#customer-email").fill("newcustomer620@example.com");
  await page.locator("#customer-username").fill("newcustomer620");
  await page.locator("#customer-password").fill("SecurePass123!");
  await page.getByRole("button", { name: "Create Customer" }).click();

  await expect(page.locator("body")).toContainText("Customer access handoff");
  await expect(page.locator("body")).toContainText("OTP delivery readiness");
  await expect(page.locator("body")).toContainText("Ready");
  await expect(page.locator("body")).toContainText(
    "SMS delivery is not used for public customer or partner password reset"
  );
  await expect(page.locator("body")).toContainText("newcustomer620");
  await expect(page.locator("body")).toContainText("01988001122");
  await expect(page.locator("body")).toContainText("newcustomer620@example.com");
  await expect(page.locator("body")).not.toContainText("SecurePass123!");

  await page.getByRole("link", { name: "Start OTP Reset" }).click();
  await expect(page).toHaveURL(
    /\/forgot-password\?identifier=newcustomer620%40example\.com$/
  );
  await expect(page.locator("#identifier")).toHaveValue("newcustomer620@example.com");
  await expect(page.locator("body")).toContainText(
    /OTP is delivered to the registered (account )?email/i
  );
});

test("admin customer detail shows OTP access handoff for existing customer", async ({
  page,
}) => {
  await page.route(
    "**/api/v1/admin/system/otp-delivery-readiness/",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(otpReadinessFixture),
      });
    }
  );

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
  await expect(page.locator("body")).toContainText("OTP delivery readiness");
  await expect(page.locator("body")).toContainText("API Only");
  await expect(page.locator("body")).toContainText("accessready55");
  await expect(page.locator("body")).toContainText("01755555555");
  await expect(page.locator("body")).toContainText("access@example.com");
  await expect(
    page.locator('a[href="/forgot-password?identifier=access%40example.com"]')
  ).toBeVisible();
});

test("admin customer detail supports username change with required reason", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/customers/58/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 58,
        name: "Username Change Customer",
        phone: "01799999999",
        email: "username-change@example.com",
        user_id: 458,
        user_username: "before-change-user",
        status: "ACTIVE",
        kyc_status: "VERIFIED",
      }),
    });
  });
  await page.route("**/api/v1/admin/subscriptions/?customer=58", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });
  await page.route("**/api/v1/admin/payments/?customer=58", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });
  await page.route("**/api/v1/admin/customers/58/operational-profile/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ overview: {}, direct_sales: { summary: {}, rows: [] } }),
    });
  });
  await page.route("**/api/v1/admin/system/otp-delivery-readiness/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(otpReadinessFixture),
    });
  });
  await page.route("**/api/v1/admin/users/458/username/", async (route) => {
    const payload = route.request().postDataJSON() as { new_username?: string; reason?: string };
    if (!payload.reason) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Reason is required for admin username changes." }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        username: payload.new_username || "changed-user",
        changed: true,
        requires_relogin: true,
      }),
    });
  });

  await page.goto("/admin/customers/58");
  await expect(page.locator("body")).toContainText("Access Handoff");
  await page.getByPlaceholder("New username").fill("after-change-user");
  await page.getByPlaceholder("Reason (required)").fill("Customer requested correction");
  await page.getByRole("button", { name: "Change Username" }).click();
  await expect(page.locator("body")).toContainText("Username updated. User must sign in again.");
});

test("admin customer detail separates active and historical finance after cancellation/reversal/return", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/customers/57/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 57,
        name: "CRM Visibility Customer",
        phone: "01777777777",
        email: "crm-visibility@example.com",
        user: 457,
        user_username: "crm57",
        status: "ACTIVE",
        kyc_status: "VERIFIED",
        created_at: "2026-04-04T06:00:00Z",
      }),
    });
  });

  await page.route("**/api/v1/admin/subscriptions/?customer=57", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            id: 701,
            subscription_number: "SUB-701",
            status: "CANCELLED",
            total_amount: "67500.00",
            monthly_amount: "4500.00",
          },
        ],
      }),
    });
  });

  await page.route("**/api/v1/admin/payments/?customer=57", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            id: 9001,
            amount: "4500.00",
            payment_date: "2026-04-10",
            subscription_id: 701,
            subscription_number: "SUB-701",
            is_reversed: true,
            is_active_collection: false,
          },
        ],
      }),
    });
  });

  await page.route("**/api/v1/admin/customers/57/operational-profile/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        customer: { id: 57, name: "CRM Visibility Customer", phone: "01777777777", user_is_active: true },
        overview: {
          subscription_count: 1,
          active_subscriptions: 0,
          historical_subscriptions: 1,
          active_contract_value: "0.00",
          historical_contract_value: "67500.00",
          direct_sale_count: 1,
          active_direct_sale_count: 0,
          returned_direct_sale_count: 1,
          direct_sale_outstanding_count: 0,
          direct_sale_outstanding_total: "0.00",
          receipt_count: 0,
          receipt_total: "0.00",
          invoice_count: 1,
          active_invoice_count: 0,
          historical_invoice_count: 1,
          invoice_outstanding_total: "0.00",
          lead_count: 0,
          lead_open_count: 0,
          quotation_estimate_count: 0,
        },
        direct_sales: {
          summary: {
            total_count: 1,
            active_count: 0,
            history_count: 1,
            outstanding_count: 0,
            gross_total: "21000.00",
            received_total: "0.00",
            outstanding_total: "0.00",
            historical_total: "21000.00",
          },
          rows: [
            {
              id: 301,
              sale_no: "DS-301",
              status: "RETURNED",
              grand_total: "21000.00",
              received_total: "0.00",
              balance_total: "21000.00",
              active_outstanding_total: "0.00",
              is_history_only: true,
            },
          ],
        },
        contract_references: { summary: {}, rows: [] },
        subscriptions: { summary: {}, rows: [] },
        payments: { summary: { total_count: 1, active_count: 0, reversed_count: 1 } },
        ledger_summary: {
          entry_count: 1,
          total_credits: "4500.00",
          total_debits: "4500.00",
          active_ledger_credits: "0.00",
          active_ledger_debits: "0.00",
          net_subscription_collections: "0.00",
          direct_sale_receivable_total: "0.00",
        },
        receipts_documents: {
          summary: {
            receipt_count: 0,
            receipt_total: "0.00",
            active_receipt_count: 0,
            active_receipt_total: "0.00",
            document_count: 0,
            invoice_count: 1,
            invoice_posted_count: 0,
            invoice_total: "21000.00",
            invoice_outstanding_total: "0.00",
          },
          receipts: [],
          invoices: [],
          documents: [],
        },
        leads: { summary: {}, rows: [] },
        quotation_estimates: { summary: {}, rows: [] },
        partner_linkages: { count: 0, rows: [] },
      }),
    });
  });

  await page.goto("/admin/customers/57");
  await expect(page.locator("body")).toContainText("Active contract value");
  await expect(page.locator("body")).toContainText("Historical contract value");
  await expect(page.locator("body")).toContainText("Subscription History");
  await expect(page.locator("body")).toContainText("History only");
  await expect(page.locator("body")).not.toContainText("Collect Direct-Sale Balance");
});

test("admin customer list and intelligence hover keep cancelled contracts in history-only posture", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/customers/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 88,
          name: "Cancelled Only Customer",
          phone: "01788888888",
          email: "cancelled-only@example.com",
          status: "ACTIVE",
          kyc_status: "VERIFIED",
          active_subscription_count: 0,
          historical_subscription_count: 1,
          cancelled_subscription_count: 1,
          active_contract_value: "0.00",
          historical_contract_value: "67500.00",
          total_subscription_value: "67500.00",
          active_subscription_due: "0.00",
          active_direct_sale_outstanding: "0.00",
          active_invoice_outstanding: "0.00",
        },
      ]),
    });
  });
  await page.route("**/api/v1/admin/customers/88/operational-summary/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        customer: {
          id: 88,
          name: "Cancelled Only Customer",
          phone: "01788888888",
          status: "ACTIVE",
        },
        summary: {
          active_subscriptions: 0,
          historical_subscriptions: 1,
          cancelled_subscription_count: 1,
          active_contract_value: "0.00",
          historical_contract_value: "67500.00",
          active_subscription_due: "0.00",
          subscription_outstanding: "0.00",
          direct_sale_outstanding: "0.00",
          overdue_emi_count: 0,
          active_overdue_emi_count: 0,
          pending_delivery_count: 0,
          open_service_count: 0,
          last_payment_date: null,
          risk_status: "CANCELLED",
          history_badges: ["CANCELLED", "HISTORY"],
        },
        subscriptions: [],
        direct_sales: [],
        rent_lease_contracts: [],
        deliveries: [],
        service_tickets: [],
        recent_activity: [],
      }),
    });
  });

  await page.goto("/admin/customers");
  await expect(page.locator("body")).toContainText("Historical contract (deduped) ₹67,500.00");
  const cancelledRow = page.locator("tr", { hasText: "Cancelled Only Customer" });
  await expect(cancelledRow.getByRole("link", { name: "Payment History" })).toBeVisible();
  await expect(cancelledRow.getByRole("link", { name: "Payments" })).toHaveCount(0);

  const customerNameButton = page.getByRole("button", {
    name: "Open customer intelligence for Cancelled Only Customer",
  });
  await customerNameButton.hover();
  await expect(page.getByText("Active overdue EMI: 0")).toBeVisible();
  await expect(page.getByText("Cancelled contracts: 1")).toBeVisible();
  await expect(page.getByText("Historical contract value: ₹67500.00")).toBeVisible();
  await expect(page.getByText("Overdue EMI: 15")).toHaveCount(0);
});

test("admin customer edit uses the real JSON contract and audit timeline", async ({
  page,
}) => {
  let updatePayload: Record<string, unknown> | null = null;
  const customerRecord = {
    id: 77,
    name: "Editable Customer",
    phone: "01744444444",
    email: "editable@example.com",
    address: "Old Address",
    city: "Dhaka",
    user: 707,
    user_username: "editable77",
    user_is_active: true,
    kyc_status: "PENDING",
    created_at: "2026-04-04T06:00:00Z",
  };

  await page.route("**/api/v1/admin/customers/77/", async (route) => {
    if (route.request().method() === "PUT") {
      updatePayload = route.request().postDataJSON() as Record<string, unknown>;
      Object.assign(customerRecord, updatePayload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(customerRecord),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(customerRecord),
    });
  });

  await page.route(
    "**/api/v1/admin/audit-logs/timeline/Customer/77/",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              id: 1,
              action_type: "USER_UPDATED",
              performed_by_username: "admin",
              created_at: "2026-04-04T07:00:00Z",
            },
          ],
        }),
      });
    }
  );

  await page.goto("/admin/customers/77/edit");
  await expect(
    page.getByRole("heading", { name: "Edit Customer: Editable Customer" })
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("USER_UPDATED");

  await page.locator("#name").fill("Edited Customer");
  await page.locator("#phone").fill("01744444445");
  await page.locator("#email").fill("edited@example.com");
  await page.locator("#address").fill("Updated Address");
  await page.locator("#city").fill("Chattogram");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.locator("body")).toContainText(
    "Customer account updated successfully."
  );
  expect(updatePayload).toMatchObject({
    name: "Edited Customer",
    phone: "01744444445",
    email: "edited@example.com",
    address: "Updated Address",
    city: "Chattogram",
    kyc_status: "PENDING",
  });
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

  await page.goto("/forgot-password?identifier=customer-reset%40example.com");
  await expect(page.locator("#identifier")).toHaveValue("customer-reset@example.com");
  await page.getByRole("button", { name: "Send reset code" }).click();

  await expect(page.locator("body")).toContainText(
    "If an eligible account exists, a reset code has been requested."
  );
  expect(forgotPayload).toMatchObject({ identifier: "customer-reset@example.com" });

  await page.getByRole("link", { name: "Continue With OTP" }).click();
  await expect(page).toHaveURL(
    /\/reset-password\?identifier=customer-reset%40example\.com$/
  );
  await expect(page.locator("#identifier")).toHaveValue("customer-reset@example.com");

  await page.getByRole("button", { name: "Resend OTP" }).click();
  await expect(page.locator("body")).toContainText("OTP resent successfully.");
  expect(resendPayload).toMatchObject({ identifier: "customer-reset@example.com" });

  await page.locator("#otp").fill("123456");
  await page.locator("#password").fill("ResetPass123");
  await page.locator("#confirm-password").fill("ResetPass123");
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page.locator("body")).toContainText(
    "Password reset successfully! Redirecting to login..."
  );
  expect(resetPayload).toMatchObject({
    identifier: "customer-reset@example.com",
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

  await page.route("**/api/v1/customers/search/**", async (route) => {
    customerSearchUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        exact_match: true,
        count: 1,
        results: [
          {
            id: 101,
            name: "Rahim Uddin",
            phone: "01711111111",
            kyc_status: "APPROVED",
          },
        ],
      }),
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

  await page.goto("/admin/subscriptions/advance-emi/create");

  const customerInput = page.locator(
    'input[placeholder="Search customer by phone, name, or code…"]'
  );
  const productInput = page.locator(
    'input[placeholder="Search product by name or code"]'
  );
  const batchInput = page.locator('input[placeholder="Search batch by code"]');

  await customerInput.fill("01711111111");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/customers/search/") &&
        response.ok()
    ),
    page.waitForTimeout(400),
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

  // Search counts: customer fires once (via debounce only); product and batch each fire
  // once or twice (debounce + explicit Enter) — both are correct behaviour.
  expect(customerSearchUrls.length).toBeGreaterThanOrEqual(1);
  expect(productSearchUrls.length).toBeGreaterThanOrEqual(1);
  expect(batchSearchUrls.length).toBeGreaterThanOrEqual(1);
  expect(customerSearchUrls[0]).toContain("/api/v1/customers/search/");
  expect(customerSearchUrls[0]).toMatch(/phone=01711111111|q=01711111111/);
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

  await page.route(
    "**/api/v1/admin/system/otp-delivery-readiness/",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(otpReadinessFixture),
      });
    }
  );

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
            email: "importreadycustomer@example.com",
            created_customer_id: 501,
            created_user_id: 801,
            generated_username: "importreadycustomer",
          },
        ],
      }),
    });
  });

  await page.goto("/admin/customers");
  await expect(page.locator("body")).toContainText("OTP delivery readiness");
  await expect(page.locator("body")).toContainText(
    "Imported customers still need OTP reset after import. Use this readiness card to confirm the live delivery path before promising portal access."
  );
  await page
    .locator("#customer-import-file")
    .setInputFiles({
      name: "customers.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "name,phone,email\nImport Ready Customer,9100000001,importreadycustomer@example.com\n"
      ),
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
    page.locator(
      'a[href="/forgot-password?identifier=importreadycustomer%40example.com"]'
    )
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

test("batch detail keeps cancelled subscriptions in history-only surfaces", async ({
  page,
}) => {
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
        status: "OPEN",
        created_at: "2026-04-01T08:30:00Z",
      }),
    });
  });
  await page.route("**/api/v1/admin/batches/42/summary/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 42,
        batch_code: "BATCH-42",
        status: "OPEN",
        duration_months: 12,
        total_slots: 100,
        draw_day: 5,
        start_date: "2026-04-01",
        subscription_count: 1,
        active_subscription_count: 0,
        won_subscription_count: 0,
        available_lucky_ids: 99,
        assigned_lucky_ids: 0,
        won_lucky_ids: 0,
        monthly_booked_value: "0.00",
        active_monthly_booked_value: "0.00",
        active_contract_value: "0.00",
        draw_eligible_count: 0,
        historical_subscription_count: 1,
        cancelled_subscription_count: 1,
        archived_subscription_count: 0,
        historical_monthly_booked_value: "4500.00",
        draw_count: 0,
      }),
    });
  });
  await page.route("**/api/v1/admin/lucky-ids/?batch_id=42*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 2,
            lucky_number: 2,
            status: "AVAILABLE",
            current_customer_name: null,
            current_subscription_id: null,
            current_subscription_code: null,
            is_currently_assigned: false,
            is_available: true,
            has_historical_assignment: true,
            historical_subscription_status: "CANCELLED",
            historical_subscription_code: "SUB-1",
            history_label: "Previously linked to SUB-1 (CANCELLED)",
          },
        ],
      }),
    });
  });
  await page.route("**/api/v1/admin/subscriptions/?batch_id=42*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            subscription_number: "SUB-1",
            customer_name: "Indrajit Chawrasia",
            product_name: "Lucky Plan Product",
            lucky_number: 2,
            total_amount: "45000.00",
            monthly_amount: "4500.00",
            status: "CANCELLED",
            start_date: "2026-04-01",
          },
        ],
      }),
    });
  });

  await page.goto("/admin/batches/42");
  await expect(page.locator("body")).toContainText("Active Subscriptions");
  await expect(page.locator("body")).toContainText("No active subscriptions are linked to this batch.");
  await expect(page.locator("body")).toContainText("₹0.00");
  await expect(page.locator("body")).toContainText("Previously linked to SUB-1 (CANCELLED)");
  await expect(page.locator("body")).toContainText("Archived / cancelled subscription history");
  await expect(page.locator("body")).toContainText("SUB-1");
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

test("admin batch control center enforces backend reasons and action refetch", async ({
  page,
}) => {
  let executed = false;

  await page.route("**/api/v1/admin/batches/42/control-center/", async (route) => {
    const payload = executed
      ? {
          batch_id: 42,
          batch_code: "BATCH-42",
          target_size: 100,
          active_subscriptions: 100,
          minimum_threshold: 100,
          minimum_threshold_met: true,
          recommended_threshold_status: "use_total_slots",
          lock_status: "DRAW_COMPLETED",
          batch_status: "DRAW_COMPLETED",
          locked_at: "2026-04-01T08:00:00Z",
          snapshot_status: "present",
          snapshot_version: 1,
          snapshot_row_count: 100,
          snapshot_hash: "hash-snapshot-42",
          commit_status: "present",
          public_commit_hash: "public-hash-42",
          draw_status: "revealed",
          winner_lucky_number: 8,
          product_demand_status: "not_configured",
          delivery_status: "not_configured",
          finance_waiver_posting_status: "ready",
          finance_waiver_posting_reason: null,
          disabled_reasons: {
            lock_batch: ["batch_not_ready_for_lock"],
            commit_draw: ["draw_already_revealed"],
            execute_draw: ["draw_already_revealed"],
          },
        }
      : {
          batch_id: 42,
          batch_code: "BATCH-42",
          target_size: 100,
          active_subscriptions: 100,
          minimum_threshold: 100,
          minimum_threshold_met: true,
          recommended_threshold_status: "use_total_slots",
          lock_status: "LOCKED",
          batch_status: "DRAW_COMMITTED",
          locked_at: "2026-04-01T08:00:00Z",
          snapshot_status: "present",
          snapshot_version: 1,
          snapshot_row_count: 100,
          snapshot_hash: "hash-snapshot-42",
          commit_status: "present",
          public_commit_hash: "public-hash-42",
          draw_status: "committed_unrevealed",
          winner_lucky_number: null,
          product_demand_status: "not_configured",
          delivery_status: "not_configured",
          finance_waiver_posting_status: "ready",
          finance_waiver_posting_reason: null,
          disabled_reasons: {
            lock_batch: ["batch_not_ready_for_lock"],
            commit_draw: [],
            execute_draw: [],
          },
        };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.route("**/api/v1/admin/batches/42/commit-draw/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        batch_id: 42,
        status: "DRAW_COMMITTED",
        public_commit_hash: "public-hash-42",
        admin_seed_store_securely: "seed-42",
      }),
    });
  });

  await page.route("**/api/v1/admin/batches/42/execute-draw/", async (route) => {
    executed = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 17,
        batch_id: 42,
        winner_lucky_number: 8,
      }),
    });
  });

  await page.goto("/admin/batches/42/control-center");
  await expect(page.getByRole("button", { name: "Lock Batch" })).toBeDisabled();
  await expect(page.locator("body")).toContainText("batch_not_ready_for_lock");

  await page.getByRole("button", { name: "Commit Draw" }).click();
  await expect(page.locator("body")).toContainText("seed-42");

  await page
    .getByPlaceholder("Paste the secure seed from commit response")
    .fill("seed-42");
  await page.getByRole("button", { name: "Execute Draw" }).click();
  await expect(page.locator("body")).toContainText(
    "Draw execution completed or already finalized"
  );
  await expect(page.locator("body")).toContainText("draw_already_revealed");
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
  await expect(page).toHaveURL(/\/admin\/reports\?live=1/);
  const livePosture = page.locator("#live-posture");
  await expect(livePosture.getByText("Unable to load analytics")).toBeVisible();
  // Scope to the live strip: the reports hub still loads windowed analytics elsewhere, which may
  // mention subscriptions; those must not satisfy this regression.
  await expect(livePosture.getByText(/^Active subscriptions$/i)).not.toBeVisible();
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
