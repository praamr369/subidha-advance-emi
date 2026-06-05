"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingFieldClassName,
} from "@/components/accounting/shared";
import { AccountingControlShell } from "@/components/layout/page-shells";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { MetricStrip } from "@/components/ui/operations";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import type {
  AccountingPeriod,
  AccountingPeriodReadiness,
  AccountingPeriodStatus,
  FinancialYear,
  PostingLock,
} from "@/services/accounting";
import {
  activateFinancialYear,
  closeAccountingPeriod,
  createFinancialYear,
  createPostingLock,
  generateAccountingPeriods,
  getAccountingPeriodsReadiness,
  listAccountingPeriods,
  listFinancialYears,
  listPostingLocks,
  lockAccountingPeriod,
  removePostingLock,
  reopenAccountingPeriod,
} from "@/services/accounting";

const STATUS_LABEL: Record<AccountingPeriodStatus, string> = {
  OPEN: "Open",
  LOCKED: "Locked",
  CLOSED: "Closed",
};

function statusForPeriod(period: AccountingPeriod): AccountingPeriodStatus {
  if (period.status) return period.status;
  return period.is_locked ? "LOCKED" : "OPEN";
}

function readinessItems(readiness: AccountingPeriodReadiness | null) {
  if (!readiness) return [];
  return [
    {
      label: "Active financial year",
      ok: Boolean(readiness.active_financial_year),
      detail: readiness.active_financial_year?.code || "Not configured",
    },
    {
      label: "Current period",
      ok: Boolean(readiness.current_period),
      detail: readiness.current_period?.code || "No period covers today",
    },
    {
      label: "Posting lock",
      ok: !readiness.posting_lock,
      detail: readiness.posting_lock ? `Locked on ${readiness.posting_lock.lock_date}` : "No exact-date lock today",
    },
    {
      label: "Posting readiness",
      ok: readiness.is_ready,
      detail: readiness.is_ready ? "Ready" : "Blocked",
    },
  ];
}

export default function AccountingPeriodsPage() {
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [locks, setLocks] = useState<PostingLock[]>([]);
  const [readiness, setReadiness] = useState<AccountingPeriodReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fyForm, setFyForm] = useState({
    code: "",
    name: "",
    start_date: "",
    end_date: "",
    notes: "",
  });
  const [lockForm, setLockForm] = useState({
    lock_date: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  const activeFinancialYear = useMemo(
    () => readiness?.active_financial_year || financialYears.find((year) => year.is_active) || null,
    [financialYears, readiness]
  );

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [fyPayload, periodPayload, lockPayload, readinessPayload] = await Promise.all([
        listFinancialYears(),
        listAccountingPeriods(),
        listPostingLocks(),
        getAccountingPeriodsReadiness(),
      ]);
      setFinancialYears(fyPayload.results);
      setPeriods(periodPayload.results);
      setLocks(lockPayload.results);
      setReadiness(readinessPayload);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load accounting period controls."));
      if (mode === "initial") {
        setFinancialYears([]);
        setPeriods([]);
        setLocks([]);
        setReadiness(null);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreateFinancialYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createFinancialYear(fyForm);
      setNotice("Financial year created.");
      setFyForm({ code: "", name: "", start_date: "", end_date: "", notes: "" });
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to create the financial year."));
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

  async function changePeriodStatus(period: AccountingPeriod, status: AccountingPeriodStatus) {
    const reason = `${STATUS_LABEL[status]} from admin accounting period cockpit.`;
    if (status === "OPEN") await reopenAccountingPeriod(period.id, reason);
    else if (status === "LOCKED") await lockAccountingPeriod(period.id, reason);
    else await closeAccountingPeriod(period.id, reason);
    setNotice(`Period ${period.code} moved to ${STATUS_LABEL[status]}.`);
    await loadPage("refresh");
  }

  const periodColumns: EnterpriseColumnDef<AccountingPeriod>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name", render: (row) => row.name || row.label },
    { key: "financial_year_code", header: "FY", render: (row) => row.financial_year_code || "-" },
    { key: "start_date", header: "Start", render: (row) => accountingDate(row.start_date) },
    { key: "end_date", header: "End", render: (row) => accountingDate(row.end_date) },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const status = statusForPeriod(row);
        const byline = row.locked_by_username ? ` by ${row.locked_by_username}` : "";
        return status === "OPEN" ? "Open" : `${STATUS_LABEL[status]}${byline}`;
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => {
        const status = statusForPeriod(row);
        return (
          <div className="flex flex-wrap gap-2">
            {status !== "OPEN" ? (
              <ConfirmActionButton
                label="Open"
                title={`Open ${row.code}?`}
                description="Opening restores posting into this accounting period. This is audited."
                onConfirm={() => changePeriodStatus(row, "OPEN")}
                variant="primary"
              />
            ) : null}
            {status !== "LOCKED" ? (
              <ConfirmActionButton
                label="Lock"
                title={`Lock ${row.code}?`}
                description="Locking blocks accounting postings until an admin opens the period."
                onConfirm={() => changePeriodStatus(row, "LOCKED")}
                variant="secondary"
              />
            ) : null}
            {status !== "CLOSED" ? (
              <ConfirmActionButton
                label="Close"
                title={`Close ${row.code}?`}
                description="Closing blocks accounting postings and marks the period as closed."
                onConfirm={() => changePeriodStatus(row, "CLOSED")}
                variant="destructive"
              />
            ) : null}
          </div>
        );
      },
    },
  ];

  const fyColumns: EnterpriseColumnDef<FinancialYear>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    { key: "start_date", header: "Start", render: (row) => accountingDate(row.start_date) },
    { key: "end_date", header: "End", render: (row) => accountingDate(row.end_date) },
    { key: "is_active", header: "Status", render: (row) => (row.is_active ? "Active" : "Inactive") },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {!row.is_active ? (
            <ConfirmActionButton
              label="Activate"
              title={`Activate ${row.code}?`}
              description="This financial year becomes the source of truth for accounting posting validation."
              onConfirm={async () => {
                await activateFinancialYear(row.id);
                setNotice(`${row.code} activated.`);
                await loadPage("refresh");
              }}
              variant="primary"
            />
          ) : null}
          <ConfirmActionButton
            label="Generate"
            title={`Generate monthly periods for ${row.code}?`}
            description="Only missing compatible monthly accounting periods are created or linked."
            onConfirm={async () => {
              const result = await generateAccountingPeriods(row.id);
              setNotice(`${result.created_count || 0} period(s) created for ${row.code}.`);
              await loadPage("refresh");
            }}
            variant="secondary"
          />
        </div>
      ),
    },
  ];

  const lockColumns: EnterpriseColumnDef<PostingLock>[] = [
    { key: "lock_date", header: "Lock Date", render: (row) => accountingDate(row.lock_date) },
    { key: "locked_by_username", header: "Locked By", render: (row) => row.locked_by_username || "-" },
    { key: "reason", header: "Reason", render: (row) => row.reason || "-" },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <ConfirmActionButton
          label="Remove"
          title={`Remove ${row.lock_date} lock?`}
          description="This removes the exact-date posting lock and restores posting for that day if the period is open."
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
      title="Accounting Period Cockpit"
      subtitle="Control the active financial year, monthly accounting periods, and exact-date posting locks."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Periods" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingBooks, label: "Books", variant: "secondary" },
        { href: ROUTES.admin.accountingBridges, label: "Bridge Runs", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <AccountingControlShell
        readinessWarnings={
          <div className="space-y-4">
            <div className="flex justify-end">
              <AccountingRefreshButton
                loading={loading}
                refreshing={refreshing}
                onClick={() => void loadPage("refresh")}
              />
            </div>
            {notice ? <AccountingNotice message={notice} /> : null}
            {!loading ? (
              <MetricStrip
                items={[
                  { label: "Financial years", value: String(financialYears.length) },
                  { label: "Periods", value: String(periods.length) },
                  { label: "Posting locks", value: String(locks.length) },
                ]}
              />
            ) : null}
            <WorkspaceSection title="Active Financial Year" description="Posting validation resolves against this year.">
              {activeFinancialYear ? (
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Code</p>
                    <p className="font-medium text-foreground">{activeFinancialYear.code}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Current period</p>
                    <p className="font-medium text-foreground">
                      {readiness?.current_period?.code || "No current period"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Start</p>
                    <p className="font-medium text-foreground">{accountingDate(activeFinancialYear.start_date)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">End</p>
                    <p className="font-medium text-foreground">{accountingDate(activeFinancialYear.end_date)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active financial year is configured.</p>
              )}
            </WorkspaceSection>
            <WorkspaceSection title="Readiness" description="These controls determine whether accounting posting can proceed today.">
              <div className="grid gap-2">
                {readinessItems(readiness).map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span className={item.ok ? "text-emerald-700" : "text-destructive"}>{item.detail}</span>
                  </div>
                ))}
                {readiness?.errors.map((item) => (
                  <p key={item} className="text-sm text-destructive">
                    {item}
                  </p>
                ))}
                {readiness?.warnings.map((item) => (
                  <p key={item} className="text-sm text-amber-700">
                    {item}
                  </p>
                ))}
              </div>
            </WorkspaceSection>
          </div>
        }
        primaryRegister={
          <div className="space-y-6">
            <EnterpriseDataTable
              data={periods}
              columns={periodColumns}
              loading={loading}
              error={error}
              onRetry={() => void loadPage("initial")}
              emptyTitle="No accounting periods configured"
              emptyDescription="Create a financial year and generate monthly periods before accounting posting can proceed."
            />

            <WorkspaceSection title="Posting Locks" description="Exact-date locks remain available as a secondary posting control.">
              <EnterpriseDataTable
                data={locks}
                columns={lockColumns}
                loading={loading}
                error={error}
                onRetry={() => void loadPage("initial")}
                emptyTitle="No posting locks configured"
                emptyDescription="Create exact-date posting locks for sensitive close dates or controlled correction windows."
              />
            </WorkspaceSection>
          </div>
        }
        controlPanel={
          <div className="space-y-4">
            <WorkspaceSection title="Create Financial Year" description="Financial years are inactive until an admin activates one.">
              <form className="grid gap-3" onSubmit={handleCreateFinancialYear}>
                <label className="text-sm text-muted-foreground">
                  Code
                  <input
                    className={accountingFieldClassName()}
                    value={fyForm.code}
                    onChange={(event) => setFyForm((current) => ({ ...current, code: event.target.value }))}
                    required
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Name
                  <input
                    className={accountingFieldClassName()}
                    value={fyForm.name}
                    onChange={(event) => setFyForm((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Start date
                  <input
                    type="date"
                    className={accountingFieldClassName()}
                    value={fyForm.start_date}
                    onChange={(event) => setFyForm((current) => ({ ...current, start_date: event.target.value }))}
                    required
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  End date
                  <input
                    type="date"
                    className={accountingFieldClassName()}
                    value={fyForm.end_date}
                    onChange={(event) => setFyForm((current) => ({ ...current, end_date: event.target.value }))}
                    required
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Notes
                  <textarea
                    className={accountingFieldClassName()}
                    value={fyForm.notes}
                    onChange={(event) => setFyForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90"
                >
                  Create Financial Year
                </button>
              </form>
            </WorkspaceSection>

            <WorkspaceSection title="Financial Years" description="Activate one financial year and generate monthly periods.">
              <EnterpriseDataTable
                data={financialYears}
                columns={fyColumns}
                loading={loading}
                error={error}
                onRetry={() => void loadPage("initial")}
                emptyTitle="No financial years configured"
                emptyDescription="Create a financial year before generating periods."
              />
            </WorkspaceSection>

            <WorkspaceSection title="Create Posting Lock" description="Exact-date locks block posting for one specific date.">
              <form className="grid gap-3" onSubmit={handleCreateLock}>
                <label className="text-sm text-muted-foreground">
                  Lock date
                  <input
                    type="date"
                    className={accountingFieldClassName()}
                    value={lockForm.lock_date}
                    onChange={(event) => setLockForm((current) => ({ ...current, lock_date: event.target.value }))}
                    required
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Reason
                  <textarea
                    className={accountingFieldClassName()}
                    value={lockForm.reason}
                    onChange={(event) => setLockForm((current) => ({ ...current, reason: event.target.value }))}
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90"
                >
                  Create Lock
                </button>
              </form>
            </WorkspaceSection>
          </div>
        }
      />
    </PortalPage>
  );
}
