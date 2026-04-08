"use client";

import { useEffect, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  AccountingNotice,
  accountingDate,
  accountingErrorMessage,
  accountingFieldClassName,
} from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  createGstExportPack,
  listGstExportPacks,
  listItrExportPacks,
  type ExportPackJob,
} from "@/services/accounting";

const today = new Date().toISOString().slice(0, 10);

export default function AccountingExportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [itrJobs, setItrJobs] = useState<ExportPackJob[]>([]);
  const [gstJobs, setGstJobs] = useState<ExportPackJob[]>([]);
  const [form, setForm] = useState({
    financial_year: "",
    start_date: today.slice(0, 5) + "04-01",
    end_date: today,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      try {
        const [itrPayload, gstPayload] = await Promise.all([
          listItrExportPacks(),
          listGstExportPacks(),
        ]);
        if (cancelled) return;
        setItrJobs(itrPayload);
        setGstJobs(gstPayload);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(accountingErrorMessage(err, "Failed to load export jobs."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateGstPack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const job = await createGstExportPack(form);
      setNotice(`GST export pack ${job.id} generated.`);
      setGstJobs((current) => [job, ...current]);
      setError(null);
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to generate GST export pack."));
    }
  }

  return (
    <PortalPage
      title="Accounting Exports"
      subtitle="Generate finance handoff packs from posted accounting data. Export jobs stay additive and do not alter source records."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Exports" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingItrPack, label: "ITR Pack", variant: "primary" },
        { href: ROUTES.admin.accountingGst, label: "GST Docs", variant: "secondary" },
      ]}
      stats={[
        { label: "ITR Jobs", value: String(itrJobs.length), tone: "info" },
        { label: "GST Jobs", value: String(gstJobs.length), tone: "warning" },
        { label: "Done", value: String([...itrJobs, ...gstJobs].filter((job) => job.status === "DONE").length), tone: "success" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      {notice ? <AccountingNotice message={notice} /> : null}
      {loading ? <LoadingBlock label="Loading export jobs..." /> : null}
      {!loading && error ? <ErrorState title="Export controls unavailable" description={error} /> : null}
      {!loading && !error ? (
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <WorkspaceSection
            title="Generate GST Pack"
            description="This creates a GST document handoff pack from existing posted tax invoices and notes."
          >
            <form className="grid gap-3" onSubmit={handleCreateGstPack}>
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
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))}
                  className={accountingFieldClassName()}
                />
              </label>
              <label className="text-sm text-muted-foreground">
                End date
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))}
                  className={accountingFieldClassName()}
                />
              </label>
              <button type="submit" className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Generate GST Pack
              </button>
            </form>
          </WorkspaceSection>

          <WorkspaceSection
            title="Export Job History"
            description="ITR and GST jobs are listed separately below using real backend export-pack endpoints."
          >
            {itrJobs.length === 0 && gstJobs.length === 0 ? (
              <EmptyState
                title="No export jobs yet"
                description="Generate an ITR or GST pack to start the export history."
              />
            ) : (
              <div className="space-y-3">
                {[...itrJobs, ...gstJobs]
                  .sort((left, right) => (right.created_at || "").localeCompare(left.created_at || ""))
                  .map((job) => (
                    <div key={`${job.pack_type}-${job.id}`} className="rounded-[1.35rem] border border-border bg-background px-4 py-4">
                      <div className="font-semibold text-foreground">
                        {job.pack_type === "GST_HANDOFF" ? "GST Pack" : "ITR Pack"} #{job.id}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        FY {job.financial_year || "Derived"} • {accountingDate(job.created_at)} • {job.status}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </WorkspaceSection>
        </div>
      ) : null}
    </PortalPage>
  );
}
