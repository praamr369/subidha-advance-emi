import { expect, test, type Page, type Route } from "@playwright/test";

const period = { year: 2026, month: 6 };

const actionItems = [
  {
    key: "critical-first",
    severity: "CRITICAL",
    title: "Critical finance blocker",
    description: "Resolve the blocker before close.",
    source_area: "trial_balance",
    count: 1,
    deferred: false,
  },
  {
    key: "deferred-info",
    severity: "INFO",
    title: "Opening balance automation",
    description: "Opening balance automation remains deferred.",
    source_area: "trial_balance",
    count: 0,
    deferred: true,
  },
];

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installP4Mocks(page: Page) {
  await page.route("**/api/v1/**", (route) =>
    json(route, { count: 0, results: [] })
  );

  await page.route("**/api/v1/admin/financial-intelligence/trial-balance/**", (route) =>
    json(route, {
      as_of: "2026-06-18",
      period,
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      total_debit: "1000.00",
      total_credit: "1000.00",
      difference: "0.00",
      is_balanced: true,
      status: "WARNING",
      critical_check_count: 0,
      rows: [
        {
          account_id: 1,
          account_code: "1000",
          account_name: "Cash",
          account_type: "ASSET",
          is_active: true,
          normal_balance: "DR",
          opening_debit: "0.00",
          opening_credit: "0.00",
          period_debit: "1000.00",
          period_credit: "0.00",
          closing_debit: "1000.00",
          closing_credit: "0.00",
          net_balance: "1000.00",
          status: "OK",
        },
      ],
      checks: [
        {
          key: "journal.draft_in_period",
          label: "Draft journals",
          status: "WARNING",
          message: "One draft journal is excluded.",
          count: 1,
        },
      ],
      action_items: actionItems,
    })
  );

  await page.route("**/api/v1/admin/financial-intelligence/liability-reconciliation/**", (route) =>
    json(route, {
      as_of: "2026-06-18",
      period,
      overall_status: "WARNING",
      customer_advance: {
        status: "INFO",
        source_available: true,
        total_advance_collected: "5000.00",
        total_advance_applied: "1000.00",
        total_advance_refunded: "0.00",
        expected_liability: "4000.00",
        unapplied_balance: "4000.00",
        posted_liability_balance: null,
        bridge_gap_count: 1,
        stale_unapplied_count: 0,
        checks: [],
      },
      security_deposit: {
        status: "WARNING",
        source_available: true,
        total_deposit_collected: "8000.00",
        total_deposit_refunded: "0.00",
        total_deposit_deducted: "500.00",
        expected_deposit_liability: "7500.00",
        posted_deposit_liability_balance: null,
        unposted_collection_count: 1,
        unposted_refund_count: 0,
        unposted_deduction_count: 0,
        checks: [],
      },
      checks: [],
      action_items: actionItems,
      metadata: { read_only: true },
    })
  );

  await page.route("**/api/v1/admin/financial-intelligence/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/v1/admin/financial-intelligence/") {
      return route.fallback();
    }
    return json(route, {
      as_of: "2026-06-18",
      period,
      overall_status: "WARNING",
      sections: {
        collection: { status: "OK", period_payment_count: 2, period_payment_amount: "2000.00" },
        billing: { status: "OK", invoice_count: 1, invoice_amount: "3000.00" },
        bridge: { status: "WARNING", total_bridge_postings: 2, total_posted: 1, total_draft: 1, total_void: 0 },
        reconciliation: { status: "INFO", deferred: true, message: "Deferred reconciliation source." },
        advance_deposit: {
          status: "WARNING",
          customer_advance: { status: "OK", total_unapplied_amount: "4000.00", total_count: 1 },
          security_deposit: { status: "WARNING", collected_amount: "8000.00", deposit_transactions_without_bridge: 1 },
        },
        control: { status: "WARNING", control_exceptions: {}, cash_desk: {}, month_end_close: { blocking_check_count: 1 } },
        inventory_finance: { status: "OK", delivered_without_stock_ledger_count: 0, direct_sale_without_stock_ledger_count: 0 },
        trial_balance: { status: "WARNING", total_debit: "1000.00", total_credit: "1000.00", difference: "0.00", critical_check_count: 0 },
      },
      action_items: actionItems,
    });
  });

  await page.route("**/api/v1/admin/accounting/close-cockpit/**", (route) =>
    json(route, {
      period,
      as_of: "2026-06-18",
      overall_status: "CRITICAL",
      can_close: false,
      can_lock: false,
      period_state: {
        ...period,
        period_start: "2026-06-01",
        period_end: "2026-06-30",
        period_code: "FY26-06",
        period_id: 1,
        status: "OPEN",
        is_locked: false,
        is_closed: false,
      },
      sections: {
        month_end: { status: "CRITICAL" },
        financial_intelligence: { status: "WARNING" },
        trial_balance: { status: "WARNING" },
        liability_reconciliation: { status: "INFO", deferred: true, message: "GL comparison deferred." },
        period_lock: {
          period_exists: true,
          period_id: 1,
          period_code: "FY26-06",
          status: "OPEN",
          is_locked: false,
          is_closed: false,
          lock_allowed: false,
          lock_blockers: [],
          manual_lock_required: true,
          existing_lock_endpoint: "/api/v1/accounting/periods/1/lock/",
        },
      },
      blockers: [actionItems[0]],
      warnings: [{
        key: "draft-warning",
        severity: "WARNING",
        title: "Draft journal",
        description: "One draft journal is excluded.",
        source_area: "trial_balance",
      }],
      action_items: actionItems,
      metadata: { generated_at: "2026-06-18T00:00:00Z", read_only: true, note: "Read only" },
    })
  );

  await page.route("**/api/v1/admin/accounting/exports/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("export_format") === "csv") {
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="p4.csv"' },
        body: "account_code,period_debit\n1000,1000.00\n",
      });
      return;
    }
    const reportPath = url.pathname.split("/exports/")[1].replaceAll("/", "");
    if (reportPath) {
      await json(route, {
        report_key: reportPath,
        period,
        as_of: "2026-06-18",
        columns: ["account_code", "period_debit"],
        rows: [{ account_code: "1000", period_debit: "1000.00" }],
        totals: { total_debit: "1000.00", total_credit: "1000.00" },
        warnings: [],
        metadata: { read_only: true },
      });
      return;
    }
    await json(route, {
      report_key: "accounting_export_index",
      period,
      as_of: "2026-06-18",
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      reports: [
        {
          key: "trial_balance_export",
          title: "Trial Balance Export",
          description: "Posted journal balances.",
          endpoint: "admin/accounting/exports/trial-balance/",
          formats: ["json", "csv"],
        },
      ],
      metadata: { read_only: true },
    });
  });
}

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    { name: "subidha_auth", value: "1", url: "http://127.0.0.1:3100" },
    { name: "subidha_role", value: "ADMIN", url: "http://127.0.0.1:3100" },
  ]);
  await page.addInitScript(() => {
    const session = {
      id: 1,
      name: "P4 RC Admin",
      role: "ADMIN",
      accessToken: "mock-p4-admin-token",
      refreshToken: "mock-p4-refresh-token",
    };
    window.localStorage.setItem("subidha_session", JSON.stringify(session));
    window.localStorage.setItem("subidha_access_token", session.accessToken);
    window.localStorage.setItem("subidha_refresh_token", session.refreshToken);
  });
});

test("P4 finance pages render seeded, deferred, warning, and empty states without runtime errors", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await installP4Mocks(page);

  const pages = [
    ["/admin/accounting/financial-intelligence", "Financial Intelligence"],
    ["/admin/accounting/trial-balance-check", "Trial Balance Check"],
    ["/admin/accounting/liability-reconciliation", "Liability Reconciliation"],
    ["/admin/accounting/close-cockpit", "Period Close Cockpit"],
    ["/admin/accounting/exports", "Accounting Exports"],
  ] as const;

  for (const [url, heading] of pages) {
    await page.goto(url);
    await expect(
      page.locator("#main-content").getByRole("heading", { name: heading, exact: true })
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/application error|internal server error/i);
  }

  await page.goto("/admin/accounting/financial-intelligence");
  await expect(page.getByText("Critical finance blocker")).toBeVisible();
  await expect(page.getByText("Opening balance automation", { exact: true })).toBeVisible();
  const statuses = page.locator("text=CRITICAL").first();
  await expect(statuses).toBeVisible();

  await page.goto("/admin/accounting/trial-balance-check");
  await expect(page.getByText("1000 · Cash")).toBeVisible();
  await expect(page.getByText("One draft journal is excluded.")).toBeVisible();

  await page.goto("/admin/accounting/liability-reconciliation");
  await expect(page.getByText("Deferred — posted GL comparison unavailable").first()).toBeVisible();
  await expect(page.getByText("Critical finance blocker")).toBeVisible();

  await page.goto("/admin/accounting/close-cockpit");
  await expect(page.getByText("Draft journal", { exact: true })).toBeVisible();
  await expect(page.getByText("GL comparison deferred.")).toBeVisible();

  await page.goto("/admin/accounting/exports");
  await expect(page.getByText("Trial Balance Export")).toBeVisible();
  await page.getByRole("button", { name: "View JSON" }).click();
  await expect(page.getByText("Rows:")).toBeVisible();
  const csvRequest = page.waitForRequest((request) =>
    request.method() === "GET" &&
    request.url().includes("/api/v1/admin/accounting/exports/trial-balance/") &&
    request.url().includes("export_format=csv")
  );
  await page.getByRole("button", { name: "Download CSV" }).click();
  await csvRequest;

  expect(runtimeErrors).toEqual([]);
});

test("P4 finance pages remain usable at 390px and tolerate partial arrays", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installP4Mocks(page);
  await page.route("**/api/v1/admin/financial-intelligence/trial-balance/**", (route) =>
    json(route, {
      as_of: "2026-06-18",
      period,
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      total_debit: "0.00",
      total_credit: "0.00",
      difference: "0.00",
      is_balanced: true,
      status: null,
      critical_check_count: 0,
    })
  );

  await page.goto("/admin/accounting/trial-balance-check");
  await expect(
    page.locator("#main-content").getByRole("heading", { name: "Trial Balance Check" })
  ).toBeVisible();
  await expect(page.getByText("No posted account rows")).toBeVisible();
  await expect(page.getByText("No action items returned for this period.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/application error|internal server error/i);
});
