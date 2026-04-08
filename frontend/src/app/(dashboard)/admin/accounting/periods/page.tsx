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
} from "@/components/accounting/shared";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import type { AccountingPeriod, PostingLock } from "@/services/accounting";
import {
  closeAccountingPeriod,
  createAccountingPeriod,
  createPostingLock,
  listAccountingPeriods,
  listPostingLocks,
  removePostingLock,
  reopenAccountingPeriod,
} from "@/services/accounting";

export default function AccountingPeriodsPage() {
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [locks, setLocks] = useState<PostingLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [periodForm, setPeriodForm] = useState({
    code: "",
    label: "",
    start_date: "",
    end_date: "",
  });
  const [lockForm, setLockForm] = useState({
    lock_date: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [periodPayload, lockPayload] = await Promise.all([
        listAccountingPeriods(),
        listPostingLocks(),
      ]);
      setPeriods(periodPayload.results);
      setLocks(lockPayload.results);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load accounting periods."));
      if (mode === "initial") {
        setPeriods([]);
        setLocks([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreatePeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createAccountingPeriod(periodForm);
      setNotice("Accounting period created.");
      setPeriodForm({ code: "", label: "", start_date: "", end_date: "" });
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to create the accounting period."));
    }
  }

  async function handleCreateLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createPostingLock(lockForm);
      setNotice("Posting lock created.");
      setLockForm((current) => ({ ...current, reason: "" }));
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to create the posting lock."));
    }
  }

  const periodColumns: EnterpriseColumnDef<AccountingPeriod>[] = [
    { key: "code", header: "Code" },
    { key: "label", header: "Label" },
    { key: "start_date", header: "Start", render: (row) => accountingDate(row.start_date) },
    { key: "end_date", header: "End", render: (row) => accountingDate(row.end_date) },
    {
      key: "is_locked",
      header: "Status",
      render: (row) => (row.is_locked ? `Locked by ${row.locked_by_username || "system"}` : "Open"),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) =>
        row.is_locked ? (
          <ConfirmActionButton
            label="Reopen"
            title={`Reopen ${row.code}?`}
            description="Reopening restores posting into this accounting period. This is audited."
            onConfirm={async () => {
              await reopenAccountingPeriod(row.id, "Reopened from admin periods page.");
              setNotice(`Period ${row.code} reopened.`);
              await loadPage("refresh");
            }}
            variant="destructive"
          />
        ) : (
          <ConfirmActionButton
            label="Close"
            title={`Close ${row.code}?`}
            description="Closing prevents new postings from entering this period until an admin explicitly reopens it."
            onConfirm={async () => {
              await closeAccountingPeriod(row.id, "Closed from admin periods page.");
              setNotice(`Period ${row.code} closed.`);
              await loadPage("refresh");
            }}
            variant="primary"
          />
        ),
    },
  ];

  const lockColumns: EnterpriseColumnDef<PostingLock>[] = [
    { key: "lock_date", header: "Lock Date", render: (row) => accountingDate(row.lock_date) },
    { key: "locked_by_username", header: "Locked By" },
    { key: "reason", header: "Reason" },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <ConfirmActionButton
          label="Remove"
          title={`Remove ${row.lock_date} lock?`}
          description="This removes the exact-date posting lock and restores posting for that day."
          onConfirm={async () => {
            await removePostingLock(row.id);
            setNotice(`Posting lock for ${row.lock_date} removed.`);
            await loadPage("refresh");
          }}
          variant="destructive"
        />
      ),
    },
  ];

  return (
    <PortalPage
      title="Accounting Periods"
      subtitle="Control financial-year periods and exact-date posting locks without altering any historical operational payment or EMI record."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Periods" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingBooks, label: "Books", variant: "secondary" },
        { href: ROUTES.admin.accountingBridges, label: "Bridge Runs", variant: "secondary" },
      ]}
      stats={[
        { label: "Periods", value: String(periods.length), tone: "info" },
        { label: "Closed", value: String(periods.filter((row) => row.is_locked).length), tone: "warning" },
        { label: "Posting Locks", value: String(locks.length), tone: "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton loading={loading} refreshing={refreshing} onClick={() => void loadPage("refresh")} />
        </div>

        {notice ? <AccountingNotice message={notice} /> : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <WorkspaceSection
            title="Create Period"
            description="Use additive periods to formalize future lock and close behavior."
          >
            <form className="grid gap-3" onSubmit={handleCreatePeriod}>
              <label className="text-sm text-muted-foreground">
                Code
                <input className={accountingFieldClassName()} value={periodForm.code} onChange={(event) => setPeriodForm((current) => ({ ...current, code: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Label
                <input className={accountingFieldClassName()} value={periodForm.label} onChange={(event) => setPeriodForm((current) => ({ ...current, label: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Start date
                <input type="date" className={accountingFieldClassName()} value={periodForm.start_date} onChange={(event) => setPeriodForm((current) => ({ ...current, start_date: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                End date
                <input type="date" className={accountingFieldClassName()} value={periodForm.end_date} onChange={(event) => setPeriodForm((current) => ({ ...current, end_date: event.target.value }))} required />
              </label>
              <button type="submit" className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Create Period
              </button>
            </form>
          </WorkspaceSection>

          <WorkspaceSection
            title="Create Posting Lock"
            description="Exact-date locks are additive safety controls for sensitive close days and correction windows."
          >
            <form className="grid gap-3" onSubmit={handleCreateLock}>
              <label className="text-sm text-muted-foreground">
                Lock date
                <input type="date" className={accountingFieldClassName()} value={lockForm.lock_date} onChange={(event) => setLockForm((current) => ({ ...current, lock_date: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Reason
                <textarea className={accountingFieldClassName()} value={lockForm.reason} onChange={(event) => setLockForm((current) => ({ ...current, reason: event.target.value }))} />
              </label>
              <button type="submit" className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Create Lock
              </button>
            </form>
          </WorkspaceSection>
        </div>

        <EnterpriseDataTable
          data={periods}
          columns={periodColumns}
          loading={loading}
          error={error}
          onRetry={() => void loadPage("initial")}
          emptyTitle="No accounting periods configured"
          emptyDescription="Create a period before enforcing close or reopen controls."
        />

        <EnterpriseDataTable
          data={locks}
          columns={lockColumns}
          loading={loading}
          error={error}
          onRetry={() => void loadPage("initial")}
          emptyTitle="No posting locks configured"
          emptyDescription="Create exact-date posting locks for sensitive close dates or controlled correction windows."
        />
      </div>
    </PortalPage>
  );
}
