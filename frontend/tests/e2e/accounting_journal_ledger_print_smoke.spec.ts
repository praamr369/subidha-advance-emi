import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const journalFixture = {
  id: 801,
  entry_no: "JE-PRINT-801",
  entry_date: "2026-05-24",
  entry_type: "MANUAL",
  status: "DRAFT",
  memo: "Manual adjustment retained as draft evidence.",
  voucher_type: "MANUAL",
  source_type: "ADJUSTMENT",
  source_reference: "ADJ-PRINT-801",
  source_model: "accounting.ManualAdjustment",
  source_id: "801",
  approved_by: null,
  approved_by_username: null,
  approved_at: null,
  posted_by: null,
  posted_by_username: null,
  posted_at: null,
  void_reason: "",
  lines: [
    {
      id: 1,
      chart_account: 101,
      chart_account_code: "CASH-001",
      chart_account_name: "Cash in Hand",
      description: "Debit cash adjustment",
      debit_amount: "5000.00",
      credit_amount: "0.00",
      created_at: "2026-05-24T09:00:00+05:30",
      updated_at: "2026-05-24T09:00:00+05:30",
    },
    {
      id: 2,
      chart_account: 202,
      chart_account_code: "ADJ-INC-001",
      chart_account_name: "Adjustment Income",
      description: "Credit adjustment income",
      debit_amount: "0.00",
      credit_amount: "5000.00",
      created_at: "2026-05-24T09:00:00+05:30",
      updated_at: "2026-05-24T09:00:00+05:30",
    },
  ],
  created_at: "2026-05-24T09:00:00+05:30",
  updated_at: "2026-05-24T09:00:00+05:30",
};

const financeAccountFixture = {
  id: 701,
  name: "Main Cash Desk",
  branch: 2,
  branch_code: "ASN",
  branch_name: "Asansol Main Branch",
  kind: "CASH",
  chart_account: 101,
  chart_account_code: "CASH-001",
  chart_account_name: "Cash in Hand",
  opening_balance: "2000.00",
  is_active: true,
  is_real_settlement_account: true,
  bank_last4: "",
  upi_handle: "",
  notes: "Primary cashier desk.",
  created_at: "2026-05-24T09:00:00+05:30",
  updated_at: "2026-05-24T09:00:00+05:30",
};

const ledgerFixture = {
  account: {
    id: 101,
    code: "CASH-001",
    name: "Cash in Hand",
    account_type: "ASSET",
  },
  start_date: "2026-05-01",
  end_date: "2026-05-24",
  rows: [
    {
      journal_entry_id: 801,
      entry_no: "JE-PRINT-801",
      entry_date: "2026-05-24",
      entry_type: "MANUAL",
      voucher_type: "MANUAL",
      source_type: "ADJUSTMENT",
      source_reference: "ADJ-PRINT-801",
      memo: "Manual adjustment retained as draft evidence.",
      source_model: "accounting.ManualAdjustment",
      source_id: "801",
      description: "Debit cash adjustment",
      debit_amount: "5000.00",
      credit_amount: "0.00",
      running_balance: "7000.00",
    },
  ],
  closing_balance: "7000.00",
};

const emptyPage = { count: 0, next: null, previous: null, results: [] };

async function mockAccountingPrintApis(page: Parameters<typeof test>[0]["page"]) {
  await page.route("**/accounting/journal-entries/801/", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(journalFixture) });
  });
  await page.route("**/accounting/journal-entries/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 1, next: null, previous: null, results: [journalFixture] }),
    });
  });
  await page.route("**/accounting/finance-accounts/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 1, next: null, previous: null, results: [financeAccountFixture] }),
    });
  });
  await page.route("**/accounting/money-movements/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPage) });
  });
  await page.route("**/accounting/chart-of-accounts/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 2, next: null, previous: null, results: [] }),
    });
  });
  await page.route("**/accounting/reports/general-ledger/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ledgerFixture) });
  });
}

async function expectNoDashboardChrome(page: Parameters<typeof test>[0]["page"]) {
  await expect(page.getByRole("button", { name: "Open quick actions" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Open command palette/i })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /sidebar navigation/i })).toHaveCount(0);
}

async function expectPrintControlsHiddenDuringPrint(page: Parameters<typeof test>[0]["page"], linkName: string, helperText: string) {
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: linkName })).toBeHidden();
  await expect(page.getByText(helperText)).toBeHidden();
  await page.emulateMedia({ media: "screen" });
}

test("journal entry voucher print route renders branded draft voucher", async ({ page }) => {
  await mockAccountingPrintApis(page);

  await page.goto("/admin/accounting/journals/801/print");

  await expect(page.getByText("Subidha Furniture").first()).toBeVisible();
  await expect(page.getByText("JOURNAL ENTRY VOUCHER")).toBeVisible();
  await expect(page.getByText("JE-PRINT-801").first()).toBeVisible();
  await expect(page.getByText("DRAFT").first()).toBeVisible();
  await expect(page.getByText("This journal entry voucher is DRAFT")).toBeVisible();
  await expect(page.getByText("Cash in Hand")).toBeVisible();
  await expect(page.getByText("Adjustment Income")).toBeVisible();
  await expect(page.getByText("Debit cash adjustment")).toBeVisible();
  await expect(page.getByText("Prepared By Signature")).toBeVisible();
  await expect(page.getByText("Approved By Signature")).toBeVisible();
  await expect(page.getByText("Generated by SUBIDHA CORE")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to journal register" })).toBeVisible();
  await expectNoDashboardChrome(page);
  await expectPrintControlsHiddenDuringPrint(page, "Back to journal register", "Read-only journal entry voucher generated from existing backend payloads.");
});

test("ledger statement print route renders backend general-ledger report", async ({ page }) => {
  await mockAccountingPrintApis(page);

  await page.goto("/admin/accounting/ledger/101/statement/print?start_date=2026-05-01&end_date=2026-05-24");

  await expect(page.getByText("Subidha Furniture").first()).toBeVisible();
  await expect(page.getByText("LEDGER ACCOUNT STATEMENT")).toBeVisible();
  await expect(page.getByText("CASH-001 · Cash in Hand").first()).toBeVisible();
  await expect(page.getByText("Cash in Hand").first()).toBeVisible();
  await expect(page.getByText("ASSET").first()).toBeVisible();
  await expect(page.getByText("Ledger Transactions")).toBeVisible();
  await expect(page.getByText("JE-PRINT-801")).toBeVisible();
  await expect(page.getByText("Closing Balance")).toBeVisible();
  await expect(page.getByText("Prepared By Signature")).toBeVisible();
  await expect(page.getByText("Reviewer Signature")).toBeVisible();
  await expect(page.getByText("Generated by SUBIDHA CORE")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to accounting books" })).toBeVisible();
  await expectNoDashboardChrome(page);
  await expectPrintControlsHiddenDuringPrint(page, "Back to accounting books", "Read-only ledger statement generated from existing backend payloads.");
});

test("journal register exposes journal entry print link", async ({ page }) => {
  await mockAccountingPrintApis(page);

  await page.goto("/admin/accounting/journals");

  await expect(page.getByText("JE-PRINT-801").first()).toBeVisible();
  const printLink = page.getByRole("link", { name: "Journal Entry PDF / Print" }).first();
  await expect(printLink).toBeVisible();
  await expect(printLink).toHaveAttribute("href", "/admin/accounting/journals/801/print");
});

test("accounting books exposes ledger statement print link", async ({ page }) => {
  await mockAccountingPrintApis(page);

  await page.goto("/admin/accounting/books");

  await expect(page.getByText("Main Cash Desk").first()).toBeVisible();
  const printLink = page.getByRole("link", { name: "Ledger Statement PDF / Print" }).first();
  await expect(printLink).toBeVisible();
  await expect(printLink).toHaveAttribute("href", "/admin/accounting/ledger/101/statement/print");
});
