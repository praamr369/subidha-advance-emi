"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { buildAdminJournalEntryPrintRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { apiFetch } from "@/lib/api";
import {
  postJournalEntry,
  voidJournalEntry,
  type JournalEntry,
} from "@/services/accounting";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load journal entry.";
}

function statusTone(status?: string): string {
  if (status === "POSTED") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "DRAFT") return "border-amber-200 bg-amber-50 text-amber-950";
  if (status === "VOID") return "border-red-200 bg-red-50 text-red-900";
  return "border-border bg-muted text-muted-foreground";
}

function portalStatusTone(status?: string): "success" | "warning" | "danger" {
  if (status === "POSTED") return "success";
  if (status === "VOID") return "danger";
  return "warning";
}

export default function AccountingJournalDetailPage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => Number(params.id), [params.id]);
  const [journal, setJournal] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!Number.isFinite(id) || id <= 0) {
        setError("Invalid journal entry id.");
        setLoading(false);
        return;
      }
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        const payload = await apiFetch<JournalEntry>(`/accounting/journal-entries/${id}/`);
        setJournal(payload);
        setError(null);
      } catch (err) {
        setJournal(null);
        setError(toErrorMessage(err));
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [id]
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  async function handlePost() {
    if (!journal) return;
    try {
      await postJournalEntry(journal.id);
      setNotice("Journal posted.");
      await load("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handleVoid() {
    if (!journal) return;
    const reason = window.prompt("Enter void reason");
    if (!reason?.trim()) return;
    try {
      await voidJournalEntry(journal.id, reason.trim());
      setNotice("Journal voided.");
      await load("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  const pageActions = journal
    ? [
        { href: ROUTES.admin.accountingJournals, label: "Journal register", variant: "secondary" as const },
        { href: buildAdminJournalEntryPrintRoute(journal.id), label: "Print / PDF", variant: "primary" as const },
      ]
    : [{ href: ROUTES.admin.accountingJournals, label: "Journal register", variant: "secondary" as const }];

  return (
    <PortalPage
      eyebrow="Accounting Journal Control"
      title={journal?.entry_no ? `Journal ${journal.entry_no}` : "Journal detail"}
      subtitle="Journal evidence, debit/credit lines, posting state, period state, and controlled actions. This page does not create or auto-post entries."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Journals", href: ROUTES.admin.accountingJournals },
        { label: journal?.entry_no || String(id) },
      ]}
      actions={pageActions}
      statusBadge={{ label: journal?.status || "Loading", tone: portalStatusTone(journal?.status) }}
    >
      <div className="space-y-5">
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
        {loading ? <LoadingBlock label="Loading journal entry..." /> : null}
        {!loading && error ? <ErrorState title="Unable to load journal entry" description={error} onRetry={() => void load("initial")} /> : null}
        {!loading && !error && !journal ? <EmptyState title="Journal entry not found" description="This journal entry does not exist or is not accessible." /> : null}

        {!loading && !error && journal ? (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Entry no</div>
                <div className="mt-2 text-lg font-semibold">{journal.entry_no}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Date</div>
                <div className="mt-2 text-lg font-semibold">{formatDate(journal.entry_date)}</div>
              </div>
              <div className={`rounded-xl border p-4 ${statusTone(journal.status)}`}>
                <div className="text-xs font-semibold uppercase opacity-75">Status</div>
                <div className="mt-2 text-lg font-semibold">{journal.status}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs font-semibold uppercase text-muted-foreground">FY</div>
                <div className="mt-2 text-lg font-semibold">{journal.financial_year_code || "Pending"}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Period</div>
                <div className="mt-2 text-lg font-semibold">{journal.accounting_period_code || "Resolved on posting"}</div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Journal evidence</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{journal.memo || "No memo supplied."}</p>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                    <div>Entry type: {journal.entry_type}</div>
                    <div>Voucher type: {journal.voucher_type || "—"}</div>
                    <div>Source type: {journal.source_type || journal.source_model || "Manual"}</div>
                    <div>Source reference: {journal.source_reference || journal.source_id || "—"}</div>
                    <div>Posted by: {journal.posted_by_username || "—"}</div>
                    <div>Posted at: {journal.posted_at ? formatDate(journal.posted_at) : "—"}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void load("refresh")} disabled={refreshing} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60">
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </button>
                  {journal.status === "DRAFT" ? <button type="button" onClick={() => void handlePost()} className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90">Post</button> : null}
                  {journal.status === "POSTED" ? <button type="button" onClick={() => void handleVoid()} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">Void</button> : null}
                  <Link href={buildAdminJournalEntryPrintRoute(journal.id)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Print / PDF</Link>
                </div>
              </div>
              {journal.void_reason ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">Void reason: {journal.void_reason}</div> : null}
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">Debit / credit lines</h2>
              <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3 text-right">Debit</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {journal.lines.map((line, index) => (
                      <tr key={line.id ?? index}>
                        <td className="px-4 py-3 font-medium">{line.chart_account_code} · {line.chart_account_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{line.description || "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatRupee(line.debit_amount)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatRupee(line.credit_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
