"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingFieldClassName,
  accountingMoney,
} from "@/components/accounting/shared";
import { ACCOUNTING_REGISTER_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import type {
  AccountingPurchaseBill,
  FinanceAccount,
  Vendor,
  VendorSettlement,
} from "@/services/accounting";
import {
  cancelVendorSettlement,
  createVendorSettlement,
  listFinanceAccounts,
  listPurchaseBills,
  listVendors,
  listVendorSettlements,
  postVendorSettlement,
} from "@/services/accounting";

const today = new Date().toISOString().slice(0, 10);

export default function AccountingVendorSettlementsPage() {
  const [rows, setRows] = useState<VendorSettlement[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [purchaseBills, setPurchaseBills] = useState<AccountingPurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    vendor: "",
    settlement_date: today,
    amount: "0.00",
    finance_account: "",
    reference_no: "",
    purchase_bill: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [settlementPayload, vendorPayload, financePayload, purchaseBillPayload] = await Promise.all([
        listVendorSettlements(),
        listVendors(),
        listFinanceAccounts(),
        listPurchaseBills(),
      ]);
      setRows(settlementPayload.results);
      setVendors(vendorPayload.results);
      setFinanceAccounts(financePayload.results);
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
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createVendorSettlement({
        vendor: Number(form.vendor),
        settlement_date: form.settlement_date,
        amount: form.amount,
        finance_account: Number(form.finance_account),
        reference_no: form.reference_no,
        purchase_bill: form.purchase_bill ? Number(form.purchase_bill) : undefined,
      });
      setNotice("Vendor settlement created.");
      setForm({
        vendor: "",
        settlement_date: today,
        amount: "0.00",
        finance_account: "",
        reference_no: "",
        purchase_bill: "",
      });
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to create the vendor settlement."));
    }
  }

  const columns: EnterpriseColumnDef<VendorSettlement>[] = [
    { key: "settlement_date", header: "Date", render: (row) => accountingDate(row.settlement_date) },
    { key: "settlement_no", header: "Settlement" },
    { key: "vendor_name", header: "Vendor" },
    { key: "purchase_bill_no", header: "Purchase Bill" },
    { key: "finance_account_name", header: "Finance Account" },
    { key: "amount", header: "Amount", render: (row) => accountingMoney(row.amount) },
    { key: "status", header: "Status" },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Post"
              title={`Post ${row.settlement_no}?`}
              description="Posting settles the payable with a balanced journal using the selected finance account."
              onConfirm={async () => {
                await postVendorSettlement(row.id);
                setNotice(`Vendor settlement ${row.settlement_no} posted.`);
                await loadPage("refresh");
              }}
              variant="primary"
            />
          ) : null}
          {row.status !== "POSTED" && row.status !== "CANCELLED" ? (
            <ConfirmActionButton
              label="Cancel"
              title={`Cancel ${row.settlement_no}?`}
              description="This cancels the settlement before posting while preserving the audit trail."
              onConfirm={async () => {
                await cancelVendorSettlement(row.id, "Cancelled from vendor settlements page.");
                setNotice(`Vendor settlement ${row.settlement_no} cancelled.`);
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
    <PortalPage
      eyebrow="Accounting Payables Control"
      title="Vendor Settlements"
      subtitle="Admin-only payable settlements from finance accounts into vendor balances, posted through the separate accounting subsystem."
      helperNote="Vendor settlement drafts, posting, and cancellation remain explicit accounting actions with audit-safe payable clearing."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Vendor Settlements" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingPurchaseBills, label: "Purchase Bills", variant: "secondary" },
        { href: ROUTES.admin.accountingBooksCash, label: "Cash Book", variant: "secondary" },
      ]}
      stats={[
        { label: "Settlements", value: String(rows.length), tone: "info" },
        { label: "Posted", value: String(rows.filter((row) => row.status === "POSTED").length), tone: "success" },
        { label: "Draft", value: String(rows.filter((row) => row.status === "DRAFT").length), tone: "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton loading={loading} refreshing={refreshing} onClick={() => void loadPage("refresh")} />
        </div>

        {notice ? <AccountingNotice message={notice} /> : null}
        <WorkspaceDirectory
          title="Accounting control map"
          description="Use the shared accounting directory to move between vendors, purchase bills, settlements, books, and statements."
          groups={ACCOUNTING_REGISTER_DIRECTORY_GROUPS}
        />

        <WorkspaceSection
          title="Create Settlement"
          description="Record a vendor settlement draft before posting the payable-clearing journal."
        >
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
            <label className="text-sm text-muted-foreground">
              Vendor
              <select className={accountingFieldClassName()} value={form.vendor} onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))} required>
                <option value="">Select vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-muted-foreground">
              Finance account
              <select className={accountingFieldClassName()} value={form.finance_account} onChange={(event) => setForm((current) => ({ ...current, finance_account: event.target.value }))} required>
                <option value="">Select finance account</option>
                {financeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-muted-foreground">
              Settlement date
              <input type="date" className={accountingFieldClassName()} value={form.settlement_date} onChange={(event) => setForm((current) => ({ ...current, settlement_date: event.target.value }))} required />
            </label>
            <label className="text-sm text-muted-foreground">
              Amount
              <input className={accountingFieldClassName()} value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required />
            </label>
            <label className="text-sm text-muted-foreground">
              Reference no
              <input className={accountingFieldClassName()} value={form.reference_no} onChange={(event) => setForm((current) => ({ ...current, reference_no: event.target.value }))} />
            </label>
            <label className="text-sm text-muted-foreground">
              Purchase bill
              <select className={accountingFieldClassName()} value={form.purchase_bill} onChange={(event) => setForm((current) => ({ ...current, purchase_bill: event.target.value }))}>
                <option value="">Optional purchase bill</option>
                {purchaseBills.map((bill) => (
                  <option key={bill.id} value={bill.id}>
                    {bill.bill_no} • {bill.vendor_name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white md:col-span-2">
              Create Settlement
            </button>
          </form>
        </WorkspaceSection>

        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={() => void loadPage("initial")}
          emptyTitle="No vendor settlements found"
          emptyDescription="Create a settlement draft after recording and approving purchase bills."
        />
      </div>
    </PortalPage>
  );
}
