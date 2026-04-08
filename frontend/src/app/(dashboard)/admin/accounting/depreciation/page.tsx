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
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import type { DepreciationRun } from "@/services/accounting";
import {
  cancelDepreciation,
  createDepreciationRun,
  listDepreciationRuns,
  postDepreciation,
  runDepreciation,
} from "@/services/accounting";

const today = new Date().toISOString().slice(0, 10);

export default function AccountingDepreciationPage() {
  const [rows, setRows] = useState<DepreciationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    period_start: today.slice(0, 8) + "01",
    period_end: today,
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await listDepreciationRuns();
      setRows(payload.results);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load depreciation runs."));
      if (mode === "initial") setRows([]);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreateRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createDepreciationRun(form);
      setNotice("Depreciation run created.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to create the depreciation run."));
    }
  }

  const columns: EnterpriseColumnDef<DepreciationRun>[] = [
    { key: "run_code", header: "Run" },
    { key: "period_start", header: "Start", render: (row) => accountingDate(row.period_start) },
    { key: "period_end", header: "End", render: (row) => accountingDate(row.period_end) },
    { key: "status", header: "Status" },
    { key: "created_by_username", header: "Created By" },
    { key: "lines", header: "Lines", render: (row) => `${row.lines.length}` },
    {
      key: "depreciation_total",
      header: "Depreciation Total",
      render: (row) =>
        accountingMoney(
          row.lines.reduce((total, line) => total + Number(line.depreciation_amount || 0), 0)
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Run"
              title={`Run ${row.run_code}?`}
              description="This calculates the depreciation lines for all eligible active assets."
              onConfirm={async () => {
                await runDepreciation(row.id);
                setNotice(`Depreciation run ${row.run_code} executed.`);
                await loadPage("refresh");
              }}
              variant="secondary"
            />
          ) : null}
          {["DRAFT", "RUNNING"].includes(row.status) ? (
            <ConfirmActionButton
              label="Post"
              title={`Post ${row.run_code}?`}
              description="Posting creates balanced depreciation journals and updates accumulated depreciation."
              onConfirm={async () => {
                await postDepreciation(row.id);
                setNotice(`Depreciation run ${row.run_code} posted.`);
                await loadPage("refresh");
              }}
              variant="primary"
            />
          ) : null}
          {row.status !== "POSTED" && row.status !== "CANCELLED" ? (
            <ConfirmActionButton
              label="Cancel"
              title={`Cancel ${row.run_code}?`}
              description="This cancels the run before posting. Posted runs remain immutable."
              onConfirm={async () => {
                await cancelDepreciation(row.id, "Cancelled from admin depreciation page.");
                setNotice(`Depreciation run ${row.run_code} cancelled.`);
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
      title="Depreciation Runs"
      subtitle="Calculate and post depreciation from the asset register using explicit, admin-controlled run and post steps."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Depreciation" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingAssets, label: "Assets", variant: "secondary" },
        { href: ROUTES.admin.accountingPeriods, label: "Periods", variant: "secondary" },
      ]}
      stats={[
        { label: "Runs", value: String(rows.length), tone: "info" },
        { label: "Posted", value: String(rows.filter((row) => row.status === "POSTED").length), tone: "success" },
        { label: "Running", value: String(rows.filter((row) => row.status === "RUNNING").length), tone: "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton loading={loading} refreshing={refreshing} onClick={() => void loadPage("refresh")} />
        </div>

        {notice ? <AccountingNotice message={notice} /> : null}

        <WorkspaceSection
          title="Create Run"
          description="Create a new depreciation run for a target period. Calculation and posting remain separate steps."
        >
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateRun}>
            <label className="text-sm text-muted-foreground">
              Period start
              <input type="date" className={accountingFieldClassName()} value={form.period_start} onChange={(event) => setForm((current) => ({ ...current, period_start: event.target.value }))} required />
            </label>
            <label className="text-sm text-muted-foreground">
              Period end
              <input type="date" className={accountingFieldClassName()} value={form.period_end} onChange={(event) => setForm((current) => ({ ...current, period_end: event.target.value }))} required />
            </label>
            <button type="submit" className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white md:col-span-2">
              Create Depreciation Run
            </button>
          </form>
        </WorkspaceSection>

        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={() => void loadPage("initial")}
          emptyTitle="No depreciation runs found"
          emptyDescription="Create a depreciation run after assets are registered."
        />
      </div>
    </PortalPage>
  );
}
