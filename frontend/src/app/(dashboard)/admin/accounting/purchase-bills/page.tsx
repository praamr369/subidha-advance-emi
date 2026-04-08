"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingMoney,
} from "@/components/accounting/shared";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import type { AccountingPurchaseBill } from "@/services/accounting";
import {
  approvePurchaseBill,
  cancelPurchaseBill,
  listPurchaseBills,
  postPurchaseBill,
} from "@/services/accounting";

export default function AccountingPurchaseBillsPage() {
  const [rows, setRows] = useState<AccountingPurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await listPurchaseBills();
      setRows(payload.results);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load purchase bills."));
      if (mode === "initial") setRows([]);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const columns: EnterpriseColumnDef<AccountingPurchaseBill>[] = [
    { key: "bill_date", header: "Date", render: (row) => accountingDate(row.bill_date) },
    { key: "bill_no", header: "Bill" },
    { key: "vendor_name", header: "Vendor" },
    { key: "tax_mode", header: "Tax Mode" },
    { key: "status", header: "Status" },
    { key: "grand_total", header: "Grand Total", render: (row) => accountingMoney(row.grand_total) },
    { key: "posted_journal_entry_no", header: "Journal" },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Approve"
              title={`Approve ${row.bill_no}?`}
              description="Approval freezes the purchase bill for later inventory and accounting posting."
              onConfirm={async () => {
                await approvePurchaseBill(row.id);
                setNotice(`Purchase bill ${row.bill_no} approved.`);
                await loadPage("refresh");
              }}
              variant="secondary"
            />
          ) : null}
          {row.status === "APPROVED" ? (
            <ConfirmActionButton
              label="Post"
              title={`Post ${row.bill_no}?`}
              description="Posting writes purchase-side stock movement and the accounting journal in one controlled service flow."
              onConfirm={async () => {
                await postPurchaseBill(row.id);
                setNotice(`Purchase bill ${row.bill_no} posted.`);
                await loadPage("refresh");
              }}
              variant="primary"
            />
          ) : null}
          {row.status !== "POSTED" && row.status !== "CANCELLED" ? (
            <ConfirmActionButton
              label="Cancel"
              title={`Cancel ${row.bill_no}?`}
              description="This cancels the draft or approved purchase bill before posting."
              onConfirm={async () => {
                await cancelPurchaseBill(row.id, "Cancelled from accounting purchase bills page.");
                setNotice(`Purchase bill ${row.bill_no} cancelled.`);
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
      title="Purchase Bills"
      subtitle="Purchase-side inventory and accounting controls, kept separate from EMI collections and posted through admin-only services."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Purchase Bills" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingVendorSettlements, label: "Vendor Settlements", variant: "secondary" },
        { href: ROUTES.admin.accountingAssets, label: "Assets", variant: "secondary" },
      ]}
      stats={[
        { label: "Bills", value: String(rows.length), tone: "info" },
        { label: "Approved", value: String(rows.filter((row) => row.status === "APPROVED").length), tone: "warning" },
        { label: "Posted", value: String(rows.filter((row) => row.status === "POSTED").length), tone: "success" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton loading={loading} refreshing={refreshing} onClick={() => void loadPage("refresh")} />
        </div>

        {notice ? <AccountingNotice message={notice} /> : null}

        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={() => void loadPage("initial")}
          emptyTitle="No purchase bills found"
          emptyDescription="Create or sync purchase bills before approving and posting them."
        />
      </div>
    </PortalPage>
  );
}
