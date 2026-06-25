"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  fixAccountingMappingAuditEvent,
  getAccountingMappingAudit,
  seedAccountingMappingSafeDefaults,
  validateAccountingMappingAudit,
  type AccountingMappingAuditPayload,
  type AccountingMappingAuditRow,
} from "@/services/accounting-mapping-audit";

const FILTERS = ["All", "Blocked", "Unsupported", "Warnings", "Ready"] as const;
type AuditFilter = (typeof FILTERS)[number];

const READY_MAPPING_STATUSES = ["READY", "READY_UNPOSTED", "POSTABLE", "POSTED", "RECONCILED"];

const GROUP_ORDER = [
  "Collection posting mappings",
  "Commission mappings",
  "Payroll mappings",
  "Debit note mappings",
  "Vendor payment mappings",
  "Purchase bill mappings",
  "Inventory / COGS mappings",
  "Inventory / StockLedger mappings",
  "Inventory mappings",
  "Manufacturing mappings",
  "Payments/refunds mappings",
  "Security Deposit Refund mappings",
  "Security Deposit Receipt mappings",
  "Rent/Lease collection settlement mappings",
  "Rent/Lease revenue mappings",
  "Rent/lease monthly mappings",
  "Subscription/EMI mappings",
  "Unsupported/fallback mappings",
  "Other mappings",
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusClass(status: string): string {
  const value = status.toUpperCase();
  if (["READY", "POSTABLE", "POSTED", "RECONCILED"].includes(value)) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (value === "READY_UNPOSTED") return "border-blue-200 bg-blue-50 text-blue-900";
  if (value.includes("UNSUPPORTED") || value.includes("CONFLICT") || value.includes("ERROR")) return "border-red-200 bg-red-50 text-red-900";
  if (value.includes("WARNING") || value.includes("BLOCKED") || value.includes("MISSING") || value.includes("INACTIVE")) return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-900";
}

function MappingStatus({ value }: { value: string }) {
  return <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusClass(value))}>{value}</span>;
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return <div className={cx("rounded-xl border p-4 shadow-sm", tone)}><div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
}

function normalizedStatus(row: AccountingMappingAuditRow): string {
  return String(row.status || row.bridge_status || "UNKNOWN").toUpperCase();
}

function rowSearchText(row: AccountingMappingAuditRow): string {
  return `${row.module ?? ""} ${row.event_key ?? ""} ${row.event_label ?? ""} ${row.source_model ?? ""} ${row.debit_purpose ?? ""} ${row.credit_purpose ?? ""}`.toLowerCase();
}

function isPurchaseBillRow(row: AccountingMappingAuditRow): boolean {
  const text = rowSearchText(row);
  return text.includes("purchasebill") || text.includes("purchase_bill") || text.includes("purchase bill");
}

function isVendorPaymentRow(row: AccountingMappingAuditRow): boolean {
  const text = rowSearchText(row);
  return text.includes("vendorpayment") || text.includes("vendor_payment") || text.includes("vendor payment") || text.includes("supplier_payment") || text.includes("accounts_payable_payment") || (text.includes("vendor_payable") || text.includes("vendor payable")) && text.includes("payment");
}

function isStockLedgerRow(row: AccountingMappingAuditRow): boolean {
  const text = rowSearchText(row);
  return text.includes("stockledger") || text.includes("stock ledger") || text.includes("inventory_purchase_receive") || text.includes("inventory_adjustment") || text.includes("inventory_writeoff") || text.includes("inventory_return") || text.includes("cogs") || text.includes("cost_of_goods_sold");
}

function isCommissionRow(row: AccountingMappingAuditRow): boolean {
  const text = rowSearchText(row);
  return text.includes("commission") || text.includes("commission_expense") || text.includes("commission_payable") || text.includes("partner_commission");
}

function isPayrollRow(row: AccountingMappingAuditRow): boolean {
  const text = rowSearchText(row);
  return text.includes("salarysheet") || text.includes("salarypayment") || text.includes("salary_sheet") || text.includes("salary_payment") || text.includes("salary payment") || text.includes("salary accrual") || text.includes("salary_accrual") || text.includes("payroll_accrual") || text.includes("payroll_payment") || text.includes("staff_salary_accrual") || text.includes("wages_accrual") || text.includes("wages_payment") || text.includes("salary_expense") || text.includes("wages_expense") || text.includes("salary_payable");
}

function isRentLeaseCollectionRow(row: AccountingMappingAuditRow): boolean {
  const text = rowSearchText(row);
  return text.includes("rentleasecollection") || text.includes("rent_lease_collection") || text.includes("rent lease collection") || text.includes("rent_lease_payment_settlement") || text.includes("lease_payment_settlement");
}

function isSecurityDepositReceiptRow(row: AccountingMappingAuditRow): boolean {
  const text = rowSearchText(row);
  return !isSecurityDepositRefundRow(row) && (text.includes("rentleasedeposittransaction") || text.includes("rent_lease_deposit_transaction") || text.includes("security_deposit_receipt") || text.includes("rent_security_deposit_receipt") || text.includes("lease_security_deposit_receipt"));
}

function isSecurityDepositRefundRow(row: AccountingMappingAuditRow): boolean {
  const text = rowSearchText(row);
  return text.includes("security_deposit_refund") || text.includes("rent_security_deposit_refund") || text.includes("lease_security_deposit_refund");
}

function rowHasMappingBlocker(row: AccountingMappingAuditRow): boolean {
  const status = normalizedStatus(row);
  return row.blocker_category === "mapping" || row.blocker_code === "BLOCKED_BY_MAPPING" || status === "BLOCKED_BY_MAPPING" || row.debit_mapping_status !== "READY" || row.credit_mapping_status !== "READY";
}

function groupName(row: AccountingMappingAuditRow): string {
  const text = rowSearchText(row);
  if (isSecurityDepositRefundRow(row)) return "Security Deposit Refund mappings";
  if (isSecurityDepositReceiptRow(row)) return "Security Deposit Receipt mappings";
  if (isRentLeaseCollectionRow(row)) return "Rent/Lease collection settlement mappings";
  if (text.includes("rent_monthly_revenue") || text.includes("lease_monthly_revenue") || text.includes("rentleasebillingdemand")) return "Rent/Lease revenue mappings";
  if (text.includes("collection") || text.includes("cashier")) return "Collection posting mappings";
  if (isCommissionRow(row)) return "Commission mappings";
  if (isPayrollRow(row)) return "Payroll mappings";
  if (text.includes("billingdebitnote") || text.includes("debit_note") || text.includes("debit note")) return "Debit note mappings";
  if (text.includes("cogs") || text.includes("cost_of_goods_sold")) return "Inventory / COGS mappings";
  if (isStockLedgerRow(row)) return "Inventory / StockLedger mappings";
  if (isVendorPaymentRow(row)) return "Vendor payment mappings";
  if (isPurchaseBillRow(row)) return "Purchase bill mappings";
  if (text.includes("inventory") || text.includes("stock") || text.includes("purchase")) return "Inventory mappings";
  if (text.includes("manufacturing") || text.includes("production")) return "Manufacturing mappings";
  if (text.includes("payment") || text.includes("refund") || text.includes("receipt") || text.includes("settlement") || text.includes("bank") || text.includes("reversal") || text.includes("void")) return "Payments/refunds mappings";
  if (text.includes("rent") || text.includes("lease") || text.includes("deposit") || text.includes("damage")) return "Rent/lease monthly mappings";
  if (text.includes("subscription") || text.includes("emi") || text.includes("cancellation")) return "Subscription/EMI mappings";
  if (text.includes("unsupported") || row.supported === false || normalizedStatus(row).includes("UNSUPPORTED")) return "Unsupported/fallback mappings";
  return "Other mappings";
}

function rowMatchesFilter(row: AccountingMappingAuditRow, filter: AuditFilter): boolean {
  const status = normalizedStatus(row);
  if (filter === "All") return true;
  if (filter === "Blocked") return !READY_MAPPING_STATUSES.includes(status) && (status.startsWith("BLOCKED") || status.includes("MISSING") || status.includes("INACTIVE") || row.blocker_code !== null);
  if (filter === "Unsupported") return status.includes("UNSUPPORTED") || row.supported === false;
  if (filter === "Warnings") return status.includes("WARNING") || status.includes("CONFLICT");
  if (filter === "Ready") return READY_MAPPING_STATUSES.includes(status);
  return true;
}

function rowMatchesSearch(row: AccountingMappingAuditRow, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [
    row.event_label,
    row.label,
    row.event_key,
    row.module,
    row.source_model,
    row.status,
    row.bridge_status,
    row.debit_purpose,
    row.credit_purpose,
    row.debit_account_code,
    row.credit_account_code,
  ].filter(Boolean).join(" ").toLowerCase().includes(needle);
}

function rowStats(rows: AccountingMappingAuditRow[]) {
  return {
    total: rows.length,
    ready: rows.filter((row) => READY_MAPPING_STATUSES.includes(normalizedStatus(row))).length,
    blocked: rows.filter((row) => rowMatchesFilter(row, "Blocked")).length,
    warning: rows.filter((row) => rowMatchesFilter(row, "Warnings")).length,
    unsupported: rows.filter((row) => rowMatchesFilter(row, "Unsupported")).length,
  };
}

function missingLabel(row: AccountingMappingAuditRow): string {
  const status = normalizedStatus(row);
  if (isSecurityDepositRefundRow(row) && READY_MAPPING_STATUSES.includes(status)) return "Security deposit refund setup is ready. READY_UNPOSTED means bridge posting is pending, not a mapping failure.";
  if (isSecurityDepositRefundRow(row) && row.finance_account_status !== "READY") return "Missing or inactive RentLeaseDepositTransaction finance account is a finance-account blocker. Open Finance Accounts before refund posting.";
  if (isSecurityDepositRefundRow(row) && row.numbering_readiness !== "READY") return "JOURNAL_ENTRY numbering is required before security deposit refund posting.";
  if (isSecurityDepositRefundRow(row) && row.period_readiness !== "READY") return `Accounting period blocker: ${row.period_blocker_reason || row.period_readiness}.`;
  if (isSecurityDepositRefundRow(row) && rowHasMappingBlocker(row)) return "Security Deposit Liability mapping is required before security deposit refund posting.";
  if (isSecurityDepositReceiptRow(row) && READY_MAPPING_STATUSES.includes(status)) return "Security deposit receipt setup is ready. READY_UNPOSTED means bridge posting is pending, not a mapping failure.";
  if (isSecurityDepositReceiptRow(row) && row.finance_account_status !== "READY") return "Missing or inactive RentLeaseDepositTransaction finance account is a finance-account blocker. Open Finance Accounts before posting.";
  if (isSecurityDepositReceiptRow(row) && row.numbering_readiness !== "READY") return "JOURNAL_ENTRY numbering is required before security deposit receipt posting.";
  if (isSecurityDepositReceiptRow(row) && row.period_readiness !== "READY") return `Accounting period blocker: ${row.period_blocker_reason || row.period_readiness}.`;
  if (isSecurityDepositReceiptRow(row) && rowHasMappingBlocker(row)) return "Security Deposit Liability mapping is required before security deposit receipt posting.";
  if (isRentLeaseCollectionRow(row) && READY_MAPPING_STATUSES.includes(status)) return "Rent/lease collection settlement setup is ready. READY_UNPOSTED means bridge posting is pending, not a mapping failure.";
  if (isRentLeaseCollectionRow(row) && row.finance_account_status !== "READY") return "Missing or inactive RentLeaseCollection finance account mapping is a finance-account blocker. Open Finance Accounts before posting.";
  if (isRentLeaseCollectionRow(row) && row.numbering_readiness !== "READY") return "JOURNAL_ENTRY numbering is required before rent/lease collection settlement posting.";
  if (isRentLeaseCollectionRow(row) && row.period_readiness !== "READY") return `Accounting period blocker: ${row.period_blocker_reason || row.period_readiness}.`;
  if (isRentLeaseCollectionRow(row) && rowHasMappingBlocker(row)) return "Customer Receivable / Rent-Lease Receivable mapping is required before RentLeaseCollection settlement posting.";
  if (READY_MAPPING_STATUSES.includes(status)) return status === "READY_UNPOSTED" ? "Setup is ready. Journal posting is still pending in bridge reconciliation." : "No missing setup reported";
  if (isPayrollRow(row) && status === "READY_UNPOSTED") return "Payroll accrual setup is ready. Bridge posting is pending, not a mapping failure.";
  if (isPayrollRow(row) && row.numbering_readiness !== "READY") return "JOURNAL_ENTRY numbering is required before salary accrual posting.";
  if (isPayrollRow(row) && row.period_readiness !== "READY") return `Accounting period blocker: ${row.period_blocker_reason || row.period_readiness}.`;
  if (isPayrollRow(row)) return "Salary Expense or Wages Expense and Salary Payable mappings are required before salary accrual posting.";
  if (isCommissionRow(row) && status === "READY_UNPOSTED") return "Commission accrual setup is ready. Bridge posting is pending, not a mapping failure.";
  if (isCommissionRow(row) && row.numbering_readiness !== "READY") return "JOURNAL_ENTRY numbering is required before commission accrual posting.";
  if (isCommissionRow(row) && row.period_readiness !== "READY") return `Accounting period blocker: ${row.period_blocker_reason || row.period_readiness}.`;
  if (isCommissionRow(row)) return "Commission Expense and Commission Payable mappings are required before commission accrual posting.";
  if (isStockLedgerRow(row) && status === "UNSUPPORTED_SOURCE") return "Unsupported StockLedger movement or deferred COGS source classification.";
  if (isStockLedgerRow(row) && rowSearchText(row).includes("cogs")) return "Inventory Asset and COGS mappings are required before COGS stock-out posting.";
  const missing = [];
  if (row.debit_mapping_status !== "READY") missing.push(`Debit: ${row.debit_mapping_status}`);
  if (row.credit_mapping_status !== "READY") missing.push(`Credit: ${row.credit_mapping_status}`);
  if (row.finance_account_status !== "READY") missing.push(`Finance account: ${row.finance_account_status}`);
  if (row.numbering_readiness !== "READY") missing.push(`Numbering: ${row.numbering_readiness}`);
  if (row.period_readiness !== "READY") missing.push(`Period: ${row.period_blocker_reason || row.period_readiness}`);
  return missing.join(" · ") || "No missing setup reported";
}

function routeForRow(row: AccountingMappingAuditRow): string {
  const status = normalizedStatus(row);
  if (isSecurityDepositRefundRow(row) && READY_MAPPING_STATUSES.includes(status)) return `${ROUTES.admin.accountingBridgeReconciliation}?source_model=RentLeaseDepositTransaction`;
  if (isSecurityDepositRefundRow(row) && row.finance_account_status !== "READY") return ROUTES.admin.accountingFinanceAccounts;
  if (isSecurityDepositRefundRow(row) && row.period_readiness !== "READY") return ROUTES.admin.accountingPeriods;
  if (isSecurityDepositRefundRow(row) && row.numbering_readiness !== "READY") return ROUTES.admin.settingsBusinessSetupDocumentNumbering;
  if (isSecurityDepositRefundRow(row) && rowHasMappingBlocker(row)) return row.debit_account_code || row.credit_account_code ? ROUTES.admin.accountingSetup : ROUTES.admin.accountingChartOfAccounts;
  if (isSecurityDepositReceiptRow(row) && READY_MAPPING_STATUSES.includes(status)) return `${ROUTES.admin.accountingBridgeReconciliation}?source_model=RentLeaseDepositTransaction`;
  if (isSecurityDepositReceiptRow(row) && row.finance_account_status !== "READY") return ROUTES.admin.accountingFinanceAccounts;
  if (isSecurityDepositReceiptRow(row) && row.period_readiness !== "READY") return ROUTES.admin.accountingPeriods;
  if (isSecurityDepositReceiptRow(row) && row.numbering_readiness !== "READY") return ROUTES.admin.settingsBusinessSetupDocumentNumbering;
  if (isSecurityDepositReceiptRow(row) && rowHasMappingBlocker(row)) return row.credit_account_code ? ROUTES.admin.accountingSetup : ROUTES.admin.accountingChartOfAccounts;
  if (isRentLeaseCollectionRow(row) && READY_MAPPING_STATUSES.includes(status)) return `${ROUTES.admin.accountingBridgeReconciliation}?source_model=RentLeaseCollection`;
  if (isRentLeaseCollectionRow(row) && row.finance_account_status !== "READY") return ROUTES.admin.accountingFinanceAccounts;
  if (isRentLeaseCollectionRow(row) && row.period_readiness !== "READY") return ROUTES.admin.accountingPeriods;
  if (isRentLeaseCollectionRow(row) && row.numbering_readiness !== "READY") return ROUTES.admin.settingsBusinessSetupDocumentNumbering;
  if (isRentLeaseCollectionRow(row) && rowHasMappingBlocker(row)) return row.debit_account_code || row.credit_account_code ? ROUTES.admin.accountingSetup : ROUTES.admin.accountingChartOfAccounts;
  if (rowSearchText(row).includes("rentleasebillingdemand") || rowSearchText(row).includes("rent_monthly_revenue") || rowSearchText(row).includes("lease_monthly_revenue")) return `${ROUTES.admin.accountingBridgeReconciliation}?source_model=RentLeaseBillingDemand`;
  if (isPayrollRow(row) && rowSearchText(row).includes("salarypayment")) return `${ROUTES.admin.accountingBridgeReconciliation}?source_model=SalaryPayment`;
  if (isPayrollRow(row) && rowSearchText(row).includes("salary_payment")) return `${ROUTES.admin.accountingBridgeReconciliation}?source_model=SalaryPayment`;
  if (isPayrollRow(row) && READY_MAPPING_STATUSES.includes(status)) return `${ROUTES.admin.accountingBridgeReconciliation}?source_model=SalarySheet`;
  if (isCommissionRow(row) && READY_MAPPING_STATUSES.includes(status)) return `${ROUTES.admin.accountingBridgeReconciliation}?source_model=Commission`;
  if (isStockLedgerRow(row) && READY_MAPPING_STATUSES.includes(status)) return `${ROUTES.admin.accountingBridgeReconciliation}?source_model=StockLedger`;
  if (isVendorPaymentRow(row) && READY_MAPPING_STATUSES.includes(status)) return `${ROUTES.admin.accountingBridgeReconciliation}?source_model=VendorPayment`;
  if (isPurchaseBillRow(row) && READY_MAPPING_STATUSES.includes(status)) return `${ROUTES.admin.accountingBridgeReconciliation}?source_model=PurchaseBill`;
  if (row.setup_href) return row.setup_href;
  if (row.finance_account_status !== "READY") return ROUTES.admin.accountingFinanceAccounts;
  if (row.period_readiness !== "READY") return ROUTES.admin.accountingPeriods;
  if (row.numbering_readiness !== "READY") return ROUTES.admin.settingsBusinessSetupDocumentNumbering;
  return ROUTES.admin.accountingSetup;
}

export default function AccountingMappingAuditPage() {
  const [payload, setPayload] = useState<AccountingMappingAuditPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<AuditFilter>("All");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setPayload(await getAccountingMappingAudit());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounting mapping audit.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function seedDefaults() {
    setBusy("seed");
    setNotice(null);
    try {
      const result = await seedAccountingMappingSafeDefaults();
      setPayload(result.after);
      setNotice(`Safe defaults seeded. Journals created: ${result.journal_entries_created}; numbering profiles created: ${result.document_sequences_allocated}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed safe defaults.");
    } finally {
      setBusy(null);
    }
  }

  async function validateAll() {
    setBusy("validate");
    setNotice(null);
    try {
      setPayload(await validateAccountingMappingAudit());
      setNotice("Validation completed. No source records, journals, receipts, payments, or document numbers were created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate mapping audit.");
    } finally {
      setBusy(null);
    }
  }

  async function fixEvent(row: AccountingMappingAuditRow) {
    setBusy(row.event_key);
    setNotice(null);
    try {
      const action = row.status === "INACTIVE_MAPPING" ? "reactivate_mapping" : row.can_apply_mapping ? "apply_mapping" : "create_account";
      const result = await fixAccountingMappingAuditEvent({ event_key: row.event_key, action });
      setPayload(result.audit);
      setNotice(`${row.event_label} remediation evaluated. No posting was created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fix mapping event.");
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => payload?.events ?? [], [payload?.events]);
  const visibleRows = useMemo(() => rows.filter((row) => rowMatchesFilter(row, filter) && rowMatchesSearch(row, search)), [rows, filter, search]);
  const grouped = useMemo(() => {
    const map = new Map<string, AccountingMappingAuditRow[]>();
    for (const row of visibleRows) {
      const key = groupName(row);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
  }, [visibleRows]);

  if (loading) return <PortalPage title="Accounting Mapping Audit" subtitle="Full setup verification for accounting mappings."><LoadingBlock label="Loading mapping audit..." /></PortalPage>;

  const summary = payload?.summary ?? { total_events: 0, ready: 0, missing_mapping: 0, conflicts: 0, unsupported: 0, blocked_by_period: 0, blocked_by_numbering: 0 };
  const period = payload?.period_readiness ?? {};

  return (
    <PortalPage
      title="Accounting Mapping Audit"
      subtitle="Operator remediation view for accounting mappings, blockers, unsupported workflows, and setup routes."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Setup", href: ROUTES.admin.accountingSetup }, { label: "Mapping Audit" }]}
      actions={[{ href: ROUTES.admin.accountingSetup, label: "Accounting Setup", variant: "secondary" }, { href: ROUTES.admin.accountingBridges, label: "Bridge Readiness", variant: "secondary" }, { href: ROUTES.admin.accountingPeriods, label: "Periods", variant: "secondary" }]}
      statusBadge={{ label: payload?.year_end_impact === "READY" ? "Year-End Ready" : "Year-End Blocked", tone: payload?.year_end_impact === "READY" ? "success" : "warning" }}
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Mapping audit failed" description={error} onRetry={() => void load()} /> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mapping audit remediation</div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Bridge impact: {payload?.bridge_impact ?? "Not loaded"}</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Validation is read-only. READY_UNPOSTED means mapping setup is ready and posting is pending in bridge reconciliation, not a mapping failure. RentLeaseCollection settlement rows are separate from RentLeaseBillingDemand revenue, ReceiptDocument, customer advance, security deposit, and direct sale receipt rows. Payroll rows require Salary/Wages Expense and Salary Payable mappings plus JOURNAL_ENTRY numbering; payroll, staff, attendance, StaffAdvance, and payment records are not edited by accrual bridge posting.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="primary" onClick={() => void seedDefaults()} disabled={Boolean(busy)}>{busy === "seed" ? "Seeding..." : "Seed Safe Defaults"}</ActionButton>
              <ActionButton variant="secondary" onClick={() => void validateAll()} disabled={Boolean(busy)}>{busy === "validate" ? "Validating..." : "Validate All"}</ActionButton>
              <ActionButton variant="ghost" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</ActionButton>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <SummaryCard label="Total events" value={summary.total_events} tone="border-slate-200 bg-slate-50 text-slate-900" />
            <SummaryCard label="Ready" value={summary.ready} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <SummaryCard label="Missing" value={summary.missing_mapping} tone="border-amber-200 bg-amber-50 text-amber-950" />
            <SummaryCard label="Conflicts" value={summary.conflicts} tone="border-red-200 bg-red-50 text-red-900" />
            <SummaryCard label="Unsupported" value={summary.unsupported} tone="border-red-200 bg-red-50 text-red-900" />
            <SummaryCard label="Period blocked" value={summary.blocked_by_period} tone="border-amber-200 bg-amber-50 text-amber-950" />
            <SummaryCard label="Numbering blocked" value={summary.blocked_by_numbering} tone="border-amber-200 bg-amber-50 text-amber-950" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Link href={ROUTES.admin.accountingFinanceAccounts} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">Open Finance Accounts</Link>
            <Link href={ROUTES.admin.accountingChartOfAccounts} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">Open COA</Link>
            <Link href={ROUTES.admin.settingsBusinessSetupDocumentNumbering} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">Open Document Numbering</Link>
            <Link href={ROUTES.admin.accountingPeriods} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">Open Periods</Link>
          </div>
          <div className="mt-4 rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">Active FY: {String((period.active_financial_year as { code?: string } | undefined)?.code ?? "Missing")} · Current period: {String((period.current_period as { code?: string } | undefined)?.code ?? "Missing")} · Unsupported source is not a mapping problem; implement or enable the source workflow before posting.</div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">{FILTERS.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cx("rounded-full border px-3 py-1.5 text-xs font-semibold", filter === item ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground")}>{item}</button>)}</div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event, source, profile key" className="min-h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground lg:w-96" />
          </div>
        </section>

        {grouped.map(([name, groupRows]) => {
          const stats = rowStats(groupRows);
          return (
            <WorkspaceSection key={name} title={name} description="Blocked rows show missing debit, credit, finance, numbering, period, and the suggested setup route.">
              <div className="mb-3 grid gap-2 sm:grid-cols-5">
                {Object.entries(stats).map(([label, value]) => <div key={`${name}-${label}`} className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold capitalize text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold text-foreground">{value}</div></div>)}
              </div>
              <div className="grid gap-3">
                {groupRows.map((row) => {
                  const status = normalizedStatus(row);
                  const canFix = Boolean(row.supported && !READY_MAPPING_STATUSES.includes(status));
                  return (
                    <article key={row.event_key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-foreground">{row.event_label}</h3><MappingStatus value={row.status} /></div><div className="mt-1 text-xs text-muted-foreground">{row.module} · {row.source_model} · <span className="font-mono">{row.event_key}</span></div></div>
                        <div className="flex flex-wrap gap-2">
                          {canFix ? <button type="button" disabled={busy === row.event_key} onClick={() => void fixEvent(row)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">{busy === row.event_key ? "Fixing..." : "Fix setup event"}</button> : null}
                          <Link href={routeForRow(row)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold">{isRentLeaseCollectionRow(row) && READY_MAPPING_STATUSES.includes(status) ? "Open collection settlement rows" : isPayrollRow(row) && READY_MAPPING_STATUSES.includes(status) ? "Open Payroll bridge rows" : isCommissionRow(row) && READY_MAPPING_STATUSES.includes(status) ? "Open Commission bridge rows" : isVendorPaymentRow(row) && READY_MAPPING_STATUSES.includes(status) ? "Open VendorPayment bridge rows" : isPurchaseBillRow(row) && READY_MAPPING_STATUSES.includes(status) ? "Open PurchaseBill bridge rows" : "Open suggested route"}</Link>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-5">
                        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold">Missing debit</div><p className="mt-1 text-muted-foreground">{row.debit_mapping_status === "READY" ? "No" : row.debit_mapping_status}</p></div>
                        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold">Missing credit</div><p className="mt-1 text-muted-foreground">{row.credit_mapping_status === "READY" ? "No" : row.credit_mapping_status}</p></div>
                        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold">Finance account</div><p className="mt-1 text-muted-foreground">{row.finance_account_status}</p></div>
                        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold">Numbering</div><p className="mt-1 text-muted-foreground">{row.numbering_readiness}</p></div>
                        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold">Period</div><p className="mt-1 text-muted-foreground">{row.period_readiness}</p></div>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">{missingLabel(row)}</p>
                      {row.blocker_reason || row.recommended_action ? <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{row.blocker_reason || row.recommended_action}</p> : null}
                    </article>
                  );
                })}
              </div>
            </WorkspaceSection>
          );
        })}

        <details className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <summary className="cursor-pointer text-base font-semibold text-foreground">Advanced raw mapping evidence</summary>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Debit</th><th className="px-4 py-3">Credit</th><th className="px-4 py-3">Finance</th><th className="px-4 py-3">Numbering</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => <tr key={`raw-${row.event_key}`} className="align-top"><td className="px-4 py-4"><div className="font-semibold text-foreground">{row.event_label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div></td><td className="px-4 py-4 text-xs text-muted-foreground">{row.source_model}</td><td className="px-4 py-4"><MappingStatus value={row.debit_mapping_status} /></td><td className="px-4 py-4"><MappingStatus value={row.credit_mapping_status} /></td><td className="px-4 py-4"><MappingStatus value={row.finance_account_status} /></td><td className="px-4 py-4"><MappingStatus value={row.numbering_readiness} /></td><td className="px-4 py-4"><MappingStatus value={row.period_readiness} /></td><td className="px-4 py-4"><MappingStatus value={row.status} /></td></tr>)}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </PortalPage>
  );
}
