import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const rentLeaseNote =
  "Operational source collection and mapping are ready. Accounting bridge posting remains audit-deferred until approval is enabled.";
const staleRentLeaseNote =
  "Operational source collection is enabled. Accounting posting bridge remains audit-deferred until approved.";

const chartAccount = (id: number, code: string, name: string, account_type = "ASSET") => ({
  id,
  code,
  name,
  account_type,
  is_active: true,
  allow_manual_posting: true,
  is_posting_ready: true,
  is_group_control: false,
  allowed_for_collection: true,
});

const cash = chartAccount(1, "CASH-1000-P", "Cash Posting");
const bank = chartAccount(2, "BANK-1010-P", "Bank Posting");
const upi = chartAccount(3, "UPI-1020-P", "UPI Posting");
const rentIncome = chartAccount(4, "RENT-4000", "Rent Income", "INCOME");
const leaseIncome = chartAccount(5, "LEASE-4000", "Lease Income", "INCOME");
const depositLiability = chartAccount(6, "SEC-2300", "Security Deposit Liability", "LIABILITY");

const readinessPayload = {
  finance_accounts: [],
  operational_collection_accounts: [],
  diagnostic_system_accounts: [],
  chart_accounts: [cash, bank, upi, rentIncome, leaseIncome, depositLiability],
  chart_of_accounts_health: {
    group_control_accounts: [],
    posting_leaf_accounts: [cash, bank, upi, rentIncome, leaseIncome, depositLiability],
    missing_posting_leaf_accounts: [],
    inactive_or_non_posting_blockers: [],
    counts: {
      group_control_count: 0,
      posting_leaf_count: 6,
      missing_posting_leaf_count: 0,
      inactive_or_non_posting_count: 0,
    },
  },
  posting_profiles: [],
  posting_profile_readiness: [
    {
      key: "rent_lease_collection",
      label: "Rent / Lease Collection",
      status: "READY",
      collection_ready: true,
      mapping_ready: true,
      posting_bridge_ready: false,
      posting_bridge_approved: false,
      posting_mode: "AUDIT_DEFERRED",
      message: rentLeaseNote,
      operator_action: "Enable bridge posting through approved accounting bridge workflow.",
      required_debit_account: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"],
      required_credit_account: ["RENT_INCOME", "LEASE_INCOME"],
      configured_debit_account: [cash, bank, upi],
      configured_credit_account: [rentIncome, leaseIncome],
      blockers: [],
      recommended_action: rentLeaseNote,
      recommended_actions: [],
      implemented: true,
      operator_note: rentLeaseNote,
    },
    {
      key: "security_deposit",
      label: "Security Deposit",
      status: "READY",
      collection_ready: true,
      mapping_ready: true,
      posting_bridge_ready: false,
      posting_bridge_approved: false,
      posting_mode: "AUDIT_DEFERRED",
      message: rentLeaseNote,
      operator_action: "Enable bridge posting through approved accounting bridge workflow.",
      required_debit_account: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"],
      required_credit_account: ["SECURITY_DEPOSIT_LIABILITY"],
      configured_debit_account: [cash, bank, upi],
      configured_credit_account: [depositLiability],
      blockers: [],
      recommended_action: rentLeaseNote,
      recommended_actions: [],
      implemented: true,
      operator_note: rentLeaseNote,
    },
  ],
  collection_requirements: [],
  operator_copy: {
    rent_lease_source_collection: rentLeaseNote,
  },
  not_exposed_label: "Not exposed",
  summary: {
    cash_accounts_ready_count: 1,
    bank_accounts_ready_count: 1,
    upi_accounts_ready_count: 1,
    blockers_count: 0,
    warnings_count: 0,
    ready_count: 2,
    blocked_count: 0,
    partial_count: 0,
    deferred_count: 0,
  },
};

test.describe("accounting setup rent/lease workflow readiness", () => {
  test.use({ storageState: authStatePath("admin") });

  test("renders rent/lease and security deposit as live workflows without deferred copy", async ({ page }) => {
    await page.route("**/api/v1/admin/accounting/setup-health/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "READY", blockers: [], warnings: [] }),
      });
    });
    await page.route("**/api/v1/admin/accounting/setup/readiness/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(readinessPayload),
      });
    });
    await page.route("**/api/v1/accounting/setup/matrix/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(readinessPayload),
      });
    });
    await page.route("**/api/v1/admin/rent-lease/accounting-bridge/config/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          config: {
            id: 1,
            is_enabled: false,
            enabled_at: null,
            enabled_by_id: null,
            disabled_at: null,
            disabled_by_id: null,
            reason: "",
            last_readiness_snapshot: {},
            created_at: null,
            updated_at: null,
          },
          readiness: {
            status: "READY",
            reason: null,
            source_collection_enabled: true,
            accounting_bridge_enabled: false,
            collection_ready: true,
            mapping_ready: true,
            posting_bridge_ready: false,
            posting_bridge_approved: false,
            posting_mode: "AUDIT_DEFERRED",
            message: rentLeaseNote,
            operator_action:
              "Enable bridge posting through approved accounting bridge workflow.",
            blockers: [],
          },
        }),
      });
    });
    await page.route("**/api/v1/admin/accounting/setup/defaults/preview/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ canonical_accounts: { create: [], claim: [], conflicts: [] } }),
      });
    });
    await page.route("**/api/v1/admin/accounting/mapping-suggestions/repair/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accounts: [], blocked_accounts: [], repairable_accounts: [], summary: {} }),
      });
    });

    await page.goto("/admin/accounting/setup");

    await expect(page.getByRole("heading", { name: "Accounting Setup" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rent / Lease Collection" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Security Deposit" })).toBeVisible();
    await expect(page.getByText(rentLeaseNote).first()).toBeVisible();
    await expect(page.locator("body")).toContainText("Posting mode");
    await expect(page.locator("body")).toContainText("AUDIT_DEFERRED");
    await expect(page.locator("body")).not.toContainText(staleRentLeaseNote);
    await expect(page.locator("body")).not.toContainText(
      "Deferred workflow. Do not create fake collection action."
    );
  });
});
