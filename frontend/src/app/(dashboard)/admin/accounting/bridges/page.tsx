"use client";

import { useState, type FormEvent } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  AccountingNotice,
  accountingErrorMessage,
  accountingFieldClassName,
} from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { runAccountingBridge, type BridgeRunResponse } from "@/services/accounting";

const today = new Date().toISOString().slice(0, 10);

export default function AccountingBridgesPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<BridgeRunResponse | null>(null);
  const [form, setForm] = useState({
    start_date: today.slice(0, 8) + "01",
    end_date: today,
    dry_run: true,
    payment_collection: true,
  });

  async function handleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const payload = await runAccountingBridge({
        start_date: form.start_date,
        end_date: form.end_date,
        dry_run: form.dry_run,
        purposes: form.payment_collection ? ["PAYMENT_COLLECTION"] : [],
      });
      setResult(payload);
      setError(null);
      setNotice(form.dry_run ? "Bridge dry run completed." : "Bridge run completed.");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to run accounting bridges."));
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalPage
      title="Bridge Runs"
      subtitle="Controlled, idempotent bridge execution from existing operational records into accounting journals. The source EMI and payment history remains untouched."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Bridge Runs" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingItrPack, label: "ITR Export Pack", variant: "secondary" },
        { href: ROUTES.admin.accountingTaxInvoices, label: "GST Docs", variant: "secondary" },
      ]}
      stats={[
        { label: "Purpose", value: "PAYMENT_COLLECTION", tone: "info" },
        { label: "Dry Run", value: form.dry_run ? "Yes" : "No", tone: form.dry_run ? "warning" : "success" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        {notice ? <AccountingNotice message={notice} /> : null}
        {submitting ? <LoadingBlock label="Running accounting bridge..." /> : null}

        {!submitting && error ? (
          <ErrorState title="Unable to run accounting bridge" description={error} />
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <WorkspaceSection
            title="Run payment bridge"
            description="Dry run first to inspect candidate payments and already-posted bridge counts before creating new accounting bridge journals."
          >
            <form className="grid gap-3" onSubmit={handleRun}>
              <label className="text-sm text-muted-foreground">
                Start date
                <input type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} className={accountingFieldClassName()} />
              </label>
              <label className="text-sm text-muted-foreground">
                End date
                <input type="date" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} className={accountingFieldClassName()} />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/75 bg-white/75 px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.payment_collection}
                  onChange={(event) => setForm((current) => ({ ...current, payment_collection: event.target.checked }))}
                />
                PAYMENT_COLLECTION purpose
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/75 bg-white/75 px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.dry_run}
                  onChange={(event) => setForm((current) => ({ ...current, dry_run: event.target.checked }))}
                />
                Dry run only
              </label>
              <button type="submit" className="rounded-xl border border-slate-900/10 bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Run Bridge
              </button>
            </form>
          </WorkspaceSection>

          <WorkspaceSection
            title="Latest bridge result"
            description="The response below comes directly from the bridge run endpoint, including idempotent existing-count tracking."
          >
            {!result ? (
              <div className="rounded-2xl border border-white/75 bg-white/75 px-4 py-4 text-sm text-muted-foreground">
                Run a dry run or live bridge to see the latest result payload here.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/75 bg-white/75 px-4 py-4 text-sm text-muted-foreground">
                  {result.start_date} to {result.end_date} • {result.dry_run ? "Dry run" : "Live run"}
                </div>
                {result.results.map((row) => (
                  <div key={row.purpose} className="rounded-[1.35rem] border border-white/75 bg-white/75 px-4 py-4">
                    <div className="font-semibold text-foreground">{row.purpose}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Candidates: {row.candidates} • Created: {row.created_count} • Existing: {row.existing_count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </WorkspaceSection>
        </div>
      </div>
    </PortalPage>
  );
}
