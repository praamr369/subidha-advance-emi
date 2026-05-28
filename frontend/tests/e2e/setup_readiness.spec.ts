import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const readinessPayload = {
  summary: {
    overall_status: "BLOCKED",
    ready_count: 4,
    warning_count: 2,
    blocker_count: 6,
    next_recommended_action: "Configure the active business profile before live billing or customer onboarding.",
    next_target_route: "/admin/settings/business-setup/profile",
  },
  sections: [
    {
      key: "business_profile",
      title: "Business Profile",
      status: "BLOCKED",
      blockers: ["Active business profile is missing."],
      warnings: [],
      recommended_action: "Configure the active business profile before live billing or customer onboarding.",
      target_route: "/admin/settings/business-setup/profile",
      why_this_matters: "Receipts, contracts, invoices, statements, public business data, and audit documents need a reliable business identity.",
      metadata: { configured: false },
    },
    {
      key: "print_branding",
      title: "Print Branding",
      status: "NEEDS_SETUP",
      blockers: [],
      warnings: ["Print branding is using fallback or incomplete display details."],
      recommended_action: "Set print business name, phone/address, logo preference, signature labels, and print density.",
      target_route: "/admin/settings/business-setup/print-branding",
      why_this_matters: "Browser/PDF documents are evidence documents.",
      metadata: { configured: true },
    },
    {
      key: "chart_of_accounts",
      title: "Chart of Accounts",
      status: "READY",
      blockers: [],
      warnings: [],
      recommended_action: "Open Chart of Accounts or Accounting Setup and create/repair required system ledger accounts.",
      target_route: "/admin/accounting/chart-of-accounts",
      why_this_matters: "Financial workflows need stable ledger accounts before payments can be posted safely.",
      metadata: { active_count: 12 },
    },
    {
      key: "finance_accounts",
      title: "Finance Accounts",
      status: "BLOCKED",
      blockers: ["One or more finance accounts are not posting-ready for collection."],
      warnings: [],
      recommended_action: "Map every active cash, bank, and UPI finance account to an active posting-enabled ASSET chart account.",
      target_route: "/admin/accounting/setup",
      why_this_matters: "Collections must resolve to real settlement accounts and posting-ready chart accounts.",
      metadata: { counts: { blocked: 1 } },
    },
    {
      key: "branch_cash_counter",
      title: "Branch / Cash Counter",
      status: "READY",
      blockers: [],
      warnings: [],
      recommended_action: "Create an active primary branch and at least one active cash counter mapped to a finance account.",
      target_route: "/admin/settings/business-setup/cash-desks",
      why_this_matters: "Daily collections, settlement, and day-close need branch and counter context.",
      metadata: {},
    },
    {
      key: "staff_roles",
      title: "Staff / Roles",
      status: "NEEDS_SETUP",
      blockers: [],
      warnings: ["At least one active admin and cashier should exist before daily operations."],
      recommended_action: "Review internal users, roles, cashier users, and permission assignments.",
      target_route: "/admin/settings/business-setup/staff",
      why_this_matters: "Role separation protects payment collection, setup changes, and audit review.",
      metadata: {},
    },
    {
      key: "product_catalog",
      title: "Product Catalog",
      status: "READY",
      blockers: [],
      warnings: [],
      recommended_action: "Create active products with correct base price and plan eligibility.",
      target_route: "/admin/products",
      why_this_matters: "Product base price is contract price.",
      metadata: {},
    },
    {
      key: "batch_lucky_ids",
      title: "Batch / Lucky IDs",
      status: "BLOCKED",
      blockers: ["Lucky Plan needs at least one batch with generated Lucky IDs."],
      warnings: [],
      recommended_action: "Create a batch and confirm Lucky IDs are generated before Advance EMI onboarding.",
      target_route: "/admin/batches",
      why_this_matters: "Lucky Plan contracts require batch and Lucky ID scope.",
      metadata: {},
    },
    {
      key: "payment_collection",
      title: "Payment Collection Readiness",
      status: "BLOCKED",
      blockers: ["Collection cannot run safely until at least one posting-ready finance account and collection mapping exist."],
      warnings: [],
      recommended_action: "Review finance accounts, cash/bank/UPI mappings, and collection counters before accepting payment.",
      target_route: "/admin/finance/collect",
      why_this_matters: "Payment collection must preserve receipt, ledger, settlement, and reconciliation evidence.",
      metadata: {},
    },
    {
      key: "document_templates",
      title: "Document Templates / Numbering",
      status: "BLOCKED",
      blockers: ["Invoice/receipt/direct-sale document numbering is not fully ready."],
      warnings: ["Document terms/templates are not fully customized; fallback copy may be used."],
      recommended_action: "Configure document numbering and document print terms for receipts, contracts, delivery challans, and statements.",
      target_route: "/admin/settings/business-setup/document-numbering",
      why_this_matters: "Operational documents must carry correct sequence controls and clear customer-facing terms.",
      metadata: {},
    },
    {
      key: "accounting_reconciliation",
      title: "Accounting / Reconciliation",
      status: "READY",
      blockers: [],
      warnings: [],
      recommended_action: "Resolve missing COA codes, posting profiles, and finance-account mappings before financial workflows go live.",
      target_route: "/admin/accounting/setup",
      why_this_matters: "Accounting and reconciliation gates protect payment integrity, day close, recontract execution, reversal, and settlement evidence.",
      metadata: {},
    },
    {
      key: "amendment_recontract",
      title: "Amendment / Recontract Readiness",
      status: "BLOCKED",
      blockers: ["Product recontract needs accounting, reconciliation, and document evidence readiness before live execution."],
      warnings: [],
      recommended_action: "Verify contract amendment, product recontract, addendum print, accounting, and reconciliation readiness before approving live recontracts.",
      target_route: "/admin/contract-amendments",
      why_this_matters: "Product recontract changes future contract terms only after evidence gates.",
      metadata: {},
    },
  ],
  finance_accounts: [
    {
      id: 1,
      name: "Main Cash Desk",
      kind: "CASH",
      branch: "Main Branch",
      mapped_chart_account: {
        id: 10,
        code: "CASH-GRP",
        name: "Cash in Hand",
        account_type: "ASSET",
        allow_manual_posting: false,
        is_active: true,
      },
      posting_ready: false,
      collection_ready: false,
      blocker_reason: "Mapped chart account is a group/control account, not a posting account.",
      recommended_action: "Choose a posting-enabled leaf ASSET chart account in Accounting Setup.",
    },
  ],
  launch_checklist: [
    { key: "can_create_customer", label: "Can create customer", ready: false, source_section: "business_profile" },
    { key: "can_create_product", label: "Can create product", ready: true, source_section: "product_catalog" },
    { key: "can_create_batch_lucky_ids", label: "Can create batch / Lucky IDs", ready: false, source_section: "batch_lucky_ids" },
    { key: "can_collect_payment", label: "Can collect payment", ready: false, source_section: "payment_collection" },
    { key: "can_issue_receipt", label: "Can issue receipt", ready: false, source_section: "document_templates" },
    { key: "can_print_documents", label: "Can print documents", ready: true, source_section: "print_branding" },
    { key: "can_reconcile", label: "Can reconcile", ready: true, source_section: "accounting_reconciliation" },
    { key: "can_day_close", label: "Can day-close", ready: false, source_section: "branch_cash_counter" },
    { key: "can_handle_amendment_recontract", label: "Can handle amendment/recontract", ready: false, source_section: "amendment_recontract" },
  ],
  read_only: true,
  mutation_policy: "Read-only readiness check. No auto-fix, silent remap, payment posting, reconciliation, or historical record mutation is performed.",
};

async function mockReadiness(page: Page, payload: unknown = readinessPayload, status = 200) {
  await page.route("**/api/v1/admin/setup/readiness/**", async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

test.describe("admin setup readiness center", () => {
  test.use({ storageState: authStatePath("admin") });

  test("loads readiness sections, finance blockers, checklist, and real route links", async ({ page }) => {
    await mockReadiness(page);
    await page.goto("/admin/setup/readiness");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "Setup Readiness" })).toBeVisible();
    await expect(main.getByText("Overall readiness")).toBeVisible();
    await expect(main.getByText("BLOCKED").first()).toBeVisible();
    await expect(main.getByText("Ready")).toBeVisible();
    await expect(main.getByText("Warnings")).toBeVisible();
    await expect(main.getByText("Blockers")).toBeVisible();

    await expect(main.getByRole("heading", { name: "Business Profile" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Finance Accounts" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Batch / Lucky IDs" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Amendment / Recontract Readiness" })).toBeVisible();

    await expect(main.getByText("Main Cash Desk")).toBeVisible();
    await expect(main.getByText("Mapped chart account is a group/control account")).toBeVisible();
    await expect(main.getByText("Launch Checklist")).toBeVisible();
    await expect(main.getByText("Can collect payment")).toBeVisible();

    await expect(main.getByRole("link", { name: "Open next setup action" })).toHaveAttribute(
      "href",
      "/admin/settings/business-setup/profile",
    );
    await expect(main.getByRole("link", { name: "Open Accounting Setup" })).toHaveAttribute("href", "/admin/accounting/setup");
    await expect(main.getByRole("button", { name: /auto|fix|repair|remap|post|reconcile/i })).toHaveCount(0);
    await expect(main.getByRole("link", { name: /auto fix|silent remap|post now|reconcile now/i })).toHaveCount(0);
  });

  test("renders error state", async ({ page }) => {
    await mockReadiness(page, { detail: "Readiness unavailable" }, 500);
    await page.goto("/admin/setup/readiness");
    await expect(page.getByText("Unable to load setup readiness")).toBeVisible();
  });

  test("admin navigation exposes setup readiness", async ({ page }) => {
    await mockReadiness(page);
    await page.goto("/admin/setup/readiness");
    await expect(page.getByRole("complementary").getByRole("link", { name: "Setup Readiness", exact: true }).first()).toBeVisible();
  });
});

test.describe("customer setup readiness navigation", () => {
  test.use({ storageState: authStatePath("customer") });

  test("does not expose Setup Readiness", async ({ page }) => {
    await page.goto("/customer");
    await expect(page.getByRole("link", { name: "Setup Readiness", exact: true })).toHaveCount(0);
  });
});

test.describe("partner setup readiness navigation", () => {
  test.use({ storageState: authStatePath("partner") });

  test("does not expose Setup Readiness", async ({ page }) => {
    await page.goto("/partner");
    await expect(page.getByRole("link", { name: "Setup Readiness", exact: true })).toHaveCount(0);
  });
});

test.describe("cashier setup readiness navigation", () => {
  test.use({ storageState: authStatePath("cashier") });

  test("does not expose Setup Readiness", async ({ page }) => {
    await page.goto("/cashier");
    await expect(page.getByRole("link", { name: "Setup Readiness", exact: true })).toHaveCount(0);
  });
});
