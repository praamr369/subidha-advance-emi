"use client";

import { useEffect, useState, type FormEvent } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  AccountingNotice,
  accountingErrorMessage,
  accountingFieldClassName,
} from "@/components/accounting/shared";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  listAccountingBridgePostings,
  runAccountingBridge,
  runCommissionSettlementBridge,
  runEmiPaymentBridge,
  runEmiSubscriptionBridge,
  runEmiWaiverBridge,
  runInventoryPostingBridge,
  runPayoutBatchBridge,
  runRetailSaleBridge,
  type AccountingBridgePosting,
  type BridgeRunResponse,
  type Phase3BridgeRunResponse,
} from "@/services/accounting";

const today = new Date().toISOString().slice(0, 10);

export default function AccountingBridgesPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<BridgeRunResponse | null>(null);
  const [phase3Results, setPhase3Results] = useState<Phase3BridgeRunResponse[]>([]);
  const [bridgeRows, setBridgeRows] = useState<AccountingBridgePosting[]>([]);
  const [form, setForm] = useState({
    start_date: today.slice(0, 8) + "01",
    end_date: today,
    dry_run: true,
    payment_collection: true,
    payment_reversal: true,
  });

  async function loadBridgePostings() {
    try {
      const payload = await listAccountingBridgePostings();
      setBridgeRows(payload.results.slice(0, 8));
    } catch {
      setBridgeRows([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadInitialBridgePostings() {
      try {
        const payload = await listAccountingBridgePostings();
        if (!cancelled) setBridgeRows(payload.results.slice(0, 8));
      } catch {
        if (!cancelled) setBridgeRows([]);
      }
    }
    void loadInitialBridgePostings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedPurposes = [
      ...(form.payment_collection ? ["PAYMENT_COLLECTION"] : []),
      ...(form.payment_reversal ? ["PAYMENT_REVERSAL"] : []),
    ];
    if (selectedPurposes.length === 0) {
      setNotice(null);
      setResult(null);
      setError("Select at least one legacy bridge purpose before running the bridge.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = await runAccountingBridge({
        start_date: form.start_date,
        end_date: form.end_date,
        dry_run: form.dry_run,
        purposes: selectedPurposes,
      });
      setResult(payload);
      await loadBridgePostings();
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

  async function handlePhase3Run(
    label: string,
    runner: (payload: {
      start_date: string;
      end_date: string;
      dry_run?: boolean;
    }) => Promise<Phase3BridgeRunResponse>
  ) {
    setSubmitting(true);
    try {
      const payload = await runner({
        start_date: form.start_date,
        end_date: form.end_date,
        dry_run: form.dry_run,
      });
      setPhase3Results((current) => [payload, ...current.filter((item) => item.purpose !== payload.purpose)]);
      await loadBridgePostings();
      setError(null);
      setNotice(`${label} ${form.dry_run ? "dry run" : "live run"} completed.`);
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, `Failed to run ${label.toLowerCase()}.`));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalPage
      title="Bridge Runs"
      subtitle="Controlled, idempotent bridge execution from approved operational records into accounting journals. Payment, billing, waiver, commission, payout, and inventory truth remain in their own source modules."
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
        { label: "Legacy Purposes", value: "Collection + Reversal", tone: "info" },
        { label: "Phase-3 Runners", value: String(phase3Results.length), tone: "info" },
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
            description="Dry run first to inspect payment collection and payment reversal candidates before creating bridge journals."
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
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground shadow-sm">
                <input
                  type="checkbox"
                  checked={form.payment_collection}
                  onChange={(event) => setForm((current) => ({ ...current, payment_collection: event.target.checked }))}
                />
                PAYMENT_COLLECTION purpose
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground shadow-sm">
                <input
                  type="checkbox"
                  checked={form.payment_reversal}
                  onChange={(event) => setForm((current) => ({ ...current, payment_reversal: event.target.checked }))}
                />
                PAYMENT_REVERSAL purpose
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground shadow-sm">
                <input
                  type="checkbox"
                  checked={form.dry_run}
                  onChange={(event) => setForm((current) => ({ ...current, dry_run: event.target.checked }))}
                />
                Dry run only
              </label>
              <button
                type="submit"
                className="rounded-xl border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-[0_18px_38px_-24px_rgba(15,23,42,0.9)] transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                disabled={
                  submitting || (!form.payment_collection && !form.payment_reversal)
                }
              >
                Run Bridge
              </button>
            </form>
          </WorkspaceSection>

          <WorkspaceSection
            title="Latest bridge result"
            description="The response below comes directly from the bridge run endpoint, including idempotent existing-count tracking."
          >
            {!result ? (
              <div className="rounded-2xl border border-border bg-background px-4 py-4 text-sm text-muted-foreground shadow-sm">
                Run a dry run or live bridge to see the latest result payload here.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-border bg-background px-4 py-4 text-sm text-muted-foreground shadow-sm">
                  {result.start_date} to {result.end_date} • {result.dry_run ? "Dry run" : "Live run"}
                </div>
                {result.results.map((row) => (
                  <div key={row.purpose} className="rounded-[1.35rem] border border-border bg-background px-4 py-4 shadow-sm">
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

        <WorkspaceSection
          title="Phase-3 Bridge Runners"
          description="Run the newer additive bridges separately so retail billing, inventory, EMI waiver, commission settlement, payout, and EMI receipt posting stay explicit and auditable."
          contentClassName="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
          <ActionButton
            variant="primary"
            loading={submitting}
            onClick={() => void handlePhase3Run("Retail sale bridge", runRetailSaleBridge)}
          >
            Run retail sale
          </ActionButton>
          <ActionButton
            variant="secondary"
            loading={submitting}
            onClick={() => void handlePhase3Run("Inventory bridge", runInventoryPostingBridge)}
          >
            Run inventory posting
          </ActionButton>
          <ActionButton
            variant="secondary"
            loading={submitting}
            onClick={() => void handlePhase3Run("EMI subscription bridge", runEmiSubscriptionBridge)}
          >
            Run EMI subscription
          </ActionButton>
          <ActionButton
            variant="secondary"
            loading={submitting}
            onClick={() => void handlePhase3Run("EMI payment bridge", runEmiPaymentBridge)}
          >
            Run EMI payment receipts
          </ActionButton>
          <ActionButton
            variant="secondary"
            loading={submitting}
            onClick={() => void handlePhase3Run("EMI waiver bridge", runEmiWaiverBridge)}
          >
            Run EMI waiver
          </ActionButton>
          <ActionButton
            variant="secondary"
            loading={submitting}
            onClick={() => void handlePhase3Run("Commission settlement bridge", runCommissionSettlementBridge)}
          >
            Run commission settlement
          </ActionButton>
          <ActionButton
            variant="secondary"
            loading={submitting}
            onClick={() => void handlePhase3Run("Payout batch bridge", runPayoutBatchBridge)}
          >
            Run payout batches
          </ActionButton>
        </WorkspaceSection>

        <WorkspaceSection
          title="Phase-3 Results"
          description="Each result reflects the real bridge endpoint response, including skips where accounting recognition is intentionally deferred for safety."
        >
          {phase3Results.length === 0 ? (
            <div className="rounded-2xl border border-border bg-background px-4 py-4 text-sm text-muted-foreground shadow-sm">
              Run one of the Phase-3 bridge actions to inspect its latest payload here.
            </div>
          ) : (
            <div className="grid gap-3">
              {phase3Results.map((row) => (
                <div key={row.purpose} className="rounded-[1.35rem] border border-border bg-background px-4 py-4 shadow-sm">
                  <div className="font-semibold text-foreground">{row.purpose}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {row.start_date} to {row.end_date} • {row.dry_run ? "Dry run" : "Live run"}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Candidates: {row.candidates ?? 0} • Created: {row.created_count ?? 0} • Existing: {row.existing_count ?? 0}
                  </div>
                  {row.settlement_created_count || row.settlement_existing_count ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Settlement bridges: Created {row.settlement_created_count ?? 0} • Existing {row.settlement_existing_count ?? 0}
                    </div>
                  ) : null}
                  {row.skipped && row.skipped.length > 0 ? (
                    <div className="mt-2 text-xs text-amber-700">
                      Skipped: {row.skipped.length} rows
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection
          title="Recent bridge provenance"
          description="Read-only bridge posting register showing which source event already produced a controlled journal entry."
        >
          {bridgeRows.length === 0 ? (
            <div className="rounded-2xl border border-border bg-background px-4 py-4 text-sm text-muted-foreground shadow-sm">
              No bridge postings recorded yet.
            </div>
          ) : (
            <div className="grid gap-3">
              {bridgeRows.map((row) => (
                <div key={row.id} className="rounded-[1.35rem] border border-border bg-background px-4 py-4 shadow-sm">
                  <div className="font-semibold text-foreground">
                    {row.purpose} • {row.source_type || row.source_model} #{row.source_reference || row.source_id}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {row.voucher_type || "SYSTEM_BRIDGE"} • Journal {row.journal_entry_no || row.journal_entry} • {row.journal_entry_status || "UNKNOWN"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.source_event_date || row.journal_entry_date || "—"} • {row.source_document_no || row.journal_entry_memo || "No document reference"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>
      </div>
    </PortalPage>
  );
}
