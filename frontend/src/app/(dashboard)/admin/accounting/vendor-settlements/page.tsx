"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingFieldClassName,
  accountingMoney,
} from "@/components/accounting/shared";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  cancelVendorSettlement,
  createVendorSettlement,
  listFinanceAccounts,
  listPurchaseBills,
  listVendors,
  listVendorSettlements,
  postVendorSettlement,
  type AccountingPurchaseBill,
  type FinanceAccount,
  type Vendor,
  type VendorSettlement,
} from "@/services/accounting";

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM = {
  vendor: "",
  settlement_date: today,
  amount: "",
  finance_account: "",
  reference_no: "",
  purchase_bill: "",
  notes: "",
};

export default function AccountingVendorSettlementsPage() {
  const [rows, setRows] = useState<VendorSettlement[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [purchaseBills, setPurchaseBills] = useState<AccountingPurchaseBill[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const [settlementPayload, vendorPayload, financePayload, purchaseBillPayload] = await Promise.all([
        listVendorSettlements({ page_size: 200 }),
        listVendors({ page_size: 500, is_active: 1 }),
        listFinanceAccounts({ page_size: 500, is_active: 1, for_payment_collection: 1 }),
        listPurchaseBills({ page_size: 500, status: "POSTED" }),
      ]);
      setRows(settlementPayload.results);
      setVendors(vendorPayload.results);
      setFinanceAccounts(financePayload.results.filter((account) => account.is_real_settlement_account !== false));
      setPurchaseBills(purchaseBillPayload.results);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load vendor settlements."));
      if (mode === "initial") {
        setRows([]);
        setVendors([]);
        setFinanceAccounts([]);
        setPurchaseBills([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const eligiblePurchaseBills = useMemo(
    () => purchaseBills.filter((bill) =>
      (!form.vendor || String(bill.vendor) === form.vendor) &&
      bill.status === "POSTED" &&
      Number(bill.outstanding_amount ?? bill.grand_total ?? 0) > 0
    ),
    [form.vendor, purchaseBills]
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.vendor || !form.finance_account || !form.settlement_date || !Number.isFinite(amount) || amount <= 0) {
      setNotice(null);
      setError("Vendor, finance account, settlement date, and an amount greater than zero are required.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createVendorSettlement({
        vendor: Number(form.vendor),
        settlement_date: form.settlement_date,
        amount: form.amount,
        finance_account: Number(form.finance_account),
        reference_no: form.reference_no.trim(),
        purchase_bill: form.purchase_bill ? Number(form.purchase_bill) : undefined,
        notes: form.notes.trim(),
      });
      setNotice(`Vendor settlement ${created.settlement_no} created as a draft.`);
      setForm(EMPTY_FORM);
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to create the vendor settlement."));
    } finally {
      setSaving(false);
    }
  }

  const columns: EnterpriseColumnDef<VendorSettlement>[] = [
    { key: "settlement_date", header: "Date", render: (row) => accountingDate(row.settlement_date) },
    { key: "settlement_no", header: "Settlement" },
    { key: "vendor_name", header: "Vendor" },
    { key: "purchase_bill_no", header: "Purchase Bill", render: (row) => row.purchase_bill_no || "—" },
    { key: "finance_account_name", header: "Finance Account" },
    { key: "amount", header: "Amount", render: (row) => accountingMoney(row.amount) },
    { key: "status", header: "Status", render: (row) => <ERPStatusBadge status={row.status} /> },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Post"
              title={`Post ${row.settlement_no}?`}
              description="Posting clears vendor payable, credits the selected finance account, appends the vendor ledger, and cannot be edited afterward."
              onConfirm={async () => {
                await postVendorSettlement(row.id);
                setNotice(`Vendor settlement ${row.settlement_no} posted.`);
                setError(null);
                await loadPage("refresh");
              }}
              variant="primary"
            />
          ) : null}
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Cancel"
              title={`Cancel ${row.settlement_no}?`}
              description="The draft is retained for audit history and cannot be posted after cancellation."
              onConfirm={async () => {
                await cancelVendorSettlement(row.id, "Cancelled by admin from vendor settlement control room.");
                setNotice(`Vendor settlement ${row.settlement_no} cancelled.`);
                setError(null);
                await loadPage("refresh");
              }}
              variant="destructive"
            />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <ERPPageShell
      eyebrow="Accounting Payables Control"
      title="Vendor Settlements"
      subtitle="Draft, validate, and post vendor payable settlements through controlled accounting services."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Vendor Settlements" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingPurchaseBills, label: "Purchase Bills", variant: "secondary" },
        { href: ROUTES.admin.vendorsOutstanding, label: "Vendor Outstanding", variant: "secondary" },
        { href: ROUTES.admin.purchaseVendorPayables, label: "Vendor Payables", variant: "primary" },
      ]}
      stats={[
        { label: "Settlements", value: rows.length, tone: "info" },
        { label: "Posted", value: rows.filter((row) => row.status === "POSTED").length, tone: "success" },
        { label: "Draft", value: rows.filter((row) => row.status === "DRAFT").length, tone: "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton loading={loading} refreshing={refreshing} onClick={() => void loadPage("refresh")} />
        </div>
        {notice ? <AccountingNotice message={notice} /> : null}
        {error ? <AccountingNotice tone="danger" message={error} /> : null}

        <WorkspaceSection
          title="Create settlement draft"
          description="Only active real finance accounts and posted bills with remaining outstanding amounts are selectable."
        >
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
            <label className="text-sm text-muted-foreground">Vendor<select className={accountingFieldClassName()} value={form.vendor} onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value, purchase_bill: "", amount: "" }))} required><option value="">Select vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
            <label className="text-sm text-muted-foreground">Finance account<select className={accountingFieldClassName()} value={form.finance_account} onChange={(event) => setForm((current) => ({ ...current, finance_account: event.target.value }))} required><option value="">Select cash / bank / UPI account</option>{financeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label className="text-sm text-muted-foreground">Settlement date<input type="date" className={accountingFieldClassName()} value={form.settlement_date} onChange={(event) => setForm((current) => ({ ...current, settlement_date: event.target.value }))} required /></label>
            <label className="text-sm text-muted-foreground">Amount<input type="number" min="0.01" step="0.01" className={accountingFieldClassName()} value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required /></label>
            <label className="text-sm text-muted-foreground">Purchase bill<select className={accountingFieldClassName()} value={form.purchase_bill} onChange={(event) => { const selected = purchaseBills.find((bill) => String(bill.id) === event.target.value); setForm((current) => ({ ...current, purchase_bill: event.target.value, vendor: selected ? String(selected.vendor) : current.vendor, amount: selected?.outstanding_amount ?? current.amount })); }}><option value="">Optional vendor-level settlement</option>{eligiblePurchaseBills.map((bill) => <option key={bill.id} value={bill.id}>{bill.bill_no} • {bill.vendor_name} • Outstanding {accountingMoney(bill.outstanding_amount ?? bill.grand_total)}</option>)}</select></label>
            <label className="text-sm text-muted-foreground">Reference no<input className={accountingFieldClassName()} value={form.reference_no} onChange={(event) => setForm((current) => ({ ...current, reference_no: event.target.value }))} /></label>
            <label className="text-sm text-muted-foreground md:col-span-2">Notes<textarea rows={2} className={accountingFieldClassName()} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            <button type="submit" disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 md:col-span-2">{saving ? "Creating…" : "Create settlement draft"}</button>
          </form>
        </WorkspaceSection>

        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={null}
          onRetry={() => void loadPage("initial")}
          emptyTitle="No vendor settlements found"
          emptyDescription="Create a settlement draft after posting a purchase bill or recording an opening payable."
        />
      </div>
    </ERPPageShell>
  );
}
