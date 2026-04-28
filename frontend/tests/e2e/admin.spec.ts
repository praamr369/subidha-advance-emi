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

  await page.getByRole("link", { name: "Collect Payment" }).click();
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

test("admin finance control center renders operational settlement and transfer surfaces", async ({
  page,
}) => {
  await page.goto("/admin/finance");

  await expect(
    page.getByRole("heading", { name: "Finance Control Center" })
  ).toBeVisible();
  await expect(page.getByText("Operational settlement posture")).toBeVisible();
  await expect(page.getByText("Admin finance transfer")).toBeVisible();
  await expect(page.getByText("Pending Settlement")).toBeVisible();
  await expect(page.getByRole("button", { name: "Post Transfer" })).toBeVisible();
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
    /\/admin\/finance\/reconciliation\?view=payments&subscription=901&payment=91&status=FLAGGED&flagged=true&locked=false&q=winner$/
  );
  await expect(
    page.getByRole("heading", { name: "Admin Reconciliation" })
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("Payment reconciliation queue");
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
