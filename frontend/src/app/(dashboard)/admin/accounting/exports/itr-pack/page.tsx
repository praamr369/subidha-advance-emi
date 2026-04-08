"use client";

import { useEffect, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingFieldClassName,
} from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  createItrExportPack,
  downloadItrExportPack,
  listItrExportPacks,
  type ExportPackJob,
} from "@/services/accounting";

const today = new Date().toISOString().slice(0, 10);

export default function AccountingItrPackPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ExportPackJob[]>([]);
  const [form, setForm] = useState({
    financial_year: "",
    start_date: today.slice(0, 5) + "04-01",
    end_date: today,
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const payload = await listItrExportPacks();
      setJobs(payload);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load ITR export packs."));
      if (mode === "initial") setJobs([]);
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
      const job = await createItrExportPack({
        financial_year: form.financial_year,
        start_date: form.start_date,
        end_date: form.end_date,
      });
      setNotice(`ITR export pack ${job.id} generated.`);
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to generate the ITR export pack."));
    }
  }

  async function handleDownload(id: number) {
    try {
      await downloadItrExportPack(id);
      setNotice(`ITR export pack ${id} downloaded.`);
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to download the ITR export pack."));
    }
  }

  return (
    <PortalPage
      title="ITR Export Pack"
      subtitle="Generate an additive accounting handoff pack containing trial balance, profit and loss, and balance sheet JSON extracts for tax and finance workflows."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "ITR Export Pack" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingTrialBalance, label: "Reports", variant: "secondary" },
        { href: ROUTES.admin.accountingBridges, label: "Bridge Runs", variant: "secondary" },
      ]}
      stats={[
        { label: "Jobs", value: String(jobs.length), tone: "info" },
        { label: "Done", value: String(jobs.filter((job) => job.status === "DONE").length), tone: "success" },
        { label: "Failed", value: String(jobs.filter((job) => job.status === "FAILED").length), tone: "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton
            loading={loading}
            refreshing={refreshing}
            onClick={() => void loadPage("refresh")}
          />
        </div>

        {notice ? <AccountingNotice message={notice} /> : null}
        {loading ? <LoadingBlock label="Loading ITR export packs..." /> : null}

        {!loading && error ? (
          <ErrorState title="Unable to load ITR export packs" description={error} onRetry={() => void loadPage("initial")} />
        ) : null}

        {!loading && !error ? (
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <WorkspaceSection title="Generate export pack" description="The pack is built from the posted accounting books only, without mutating any source entries.">
              <form className="grid gap-3" onSubmit={handleCreate}>
                <label className="text-sm text-muted-foreground">
                  Financial year
                  <input
                    value={form.financial_year}
                    onChange={(event) => setForm((current) => ({ ...current, financial_year: event.target.value }))}
                    placeholder="2026-27"
                    className={accountingFieldClassName()}
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Start date
                  <input type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} className={accountingFieldClassName()} />
                </label>
                <label className="text-sm text-muted-foreground">
                  End date
                  <input type="date" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} className={accountingFieldClassName()} />
                </label>
                <button type="submit" className="rounded-xl border border-slate-900/10 bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                  Generate ITR Pack
                </button>
              </form>
            </WorkspaceSection>

            <WorkspaceSection title="Export history" description="Completed packs can be downloaded again without regenerating accounting entries.">
              {jobs.length === 0 ? (
                <EmptyState title="No export packs yet" description="Run the generator to create the first ITR handoff pack." />
              ) : (
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <div key={job.id} className="rounded-[1.35rem] border border-white/75 bg-white/75 px-4 py-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <div className="font-semibold text-foreground">ITR Pack #{job.id}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            FY {job.financial_year || "Derived"} • {accountingDate(job.created_at)} • {job.created_by_username || "System"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {job.start_date || "—"} to {job.end_date || "—"} • {job.status}
                          </div>
                          {job.error_message ? (
                            <div className="mt-1 text-xs text-red-700">{job.error_message}</div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {job.status === "DONE" ? (
                            <button
                              type="button"
                              onClick={() => void handleDownload(job.id)}
                              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900"
                            >
                              Download
                            </button>
                          ) : null}
                          <span className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground">
                            {job.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WorkspaceSection>
          </div>
        ) : null}
      </div>
    </PortalPage>
  );
}
