"use client";

import { useEffect, useMemo, useState } from "react";

import { accountingDate, accountingErrorMessage, accountingFieldClassName } from "@/components/accounting/shared";
import { WorkspaceSection } from "@/components/ui/workspace";
import type { FinancialYear } from "@/services/accounting";
import { getYearEndReadiness, runYearEndClose, type YearEndReadiness } from "@/services/year-end-close";

type Props = {
  financialYears: FinancialYear[];
  activeFinancialYear: FinancialYear | null;
  onChanged: () => Promise<void> | void;
};

function metric(label: string, value: number | string) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function issueList(title: string, items: Array<{ code: string; message: string }>, tone: "danger" | "warning") {
  const color = tone === "danger" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-950";
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs opacity-80">No items.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <div key={`${item.code}-${item.message}`} className="rounded-lg border border-current/20 bg-white/50 px-2 py-1 text-xs">
              <span className="font-semibold">{item.code}</span> · {item.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function YearEndClosePanel({ financialYears, activeFinancialYear, onChanged }: Props) {
  const [selectedFinancialYear, setSelectedFinancialYear] = useState<string>("");
  const [readiness, setReadiness] = useState<YearEndReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);

  const selectedValue = useMemo(() => {
    if (selectedFinancialYear) return selectedFinancialYear;
    return activeFinancialYear?.id ? String(activeFinancialYear.id) : "";
  }, [activeFinancialYear?.id, selectedFinancialYear]);

  async function loadReadiness(financialYear = selectedValue) {
    setLoading(true);
    setError(null);
    try {
      const payload = await getYearEndReadiness(financialYear || undefined);
      setReadiness(payload);
      setConfirmationText("");
      setAcknowledgeWarnings(false);
    } catch (err) {
      setReadiness(null);
      setError(accountingErrorMessage(err, "Failed to load year-end readiness."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReadiness(selectedValue);
  }, [selectedValue]);

  const requiredText = readiness?.confirmation_text_required ?? "";
  const canSubmit = Boolean(readiness?.ready_to_close) && confirmationText.trim() === requiredText && (!readiness?.requires_acknowledgement || acknowledgeWarnings);

  async function submitClose() {
    if (!readiness?.financial_year) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await runYearEndClose({
        financial_year: readiness.financial_year.id,
        confirmation_text: confirmationText,
        acknowledge_warnings: acknowledgeWarnings,
      });
      setReadiness(result.readiness);
      setMessage(result.already_closed ? "Financial year was already closed." : `Financial year closed. ${result.closed_period_count ?? 0} period(s) updated.`);
      await onChanged();
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to close the financial year."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <WorkspaceSection title="Year-End Close" description="Controlled admin-only close workflow. It does not renumber historical documents and does not auto-post bridge items.">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm text-muted-foreground">
            Selected financial year
            <select
              className={accountingFieldClassName()}
              value={selectedValue}
              onChange={(event) => setSelectedFinancialYear(event.target.value)}
            >
              <option value="">Active financial year</option>
              {financialYears.map((year) => (
                <option key={year.id} value={year.id}>{year.code} {year.is_active ? "(active)" : ""}</option>
              ))}
            </select>
          </label>
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
            <p className="mt-1 font-semibold text-foreground">{readiness?.financial_year?.status ?? "Not ready"}</p>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Close safety</p>
            <p className={readiness?.ready_to_close ? "mt-1 font-semibold text-emerald-700" : "mt-1 font-semibold text-red-700"}>{readiness?.ready_to_close ? "Ready" : "Blocked"}</p>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div> : null}
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {metric("Open periods", readiness?.open_period_count ?? 0)}
          {metric("Locked periods", readiness?.locked_period_count ?? 0)}
          {metric("Closed periods", readiness?.closed_period_count ?? 0)}
          {metric("Unposted bridge", readiness?.unposted_bridge_item_count ?? 0)}
          {metric("Unreconciled", readiness?.unreconciled_item_count ?? 0)}
          {metric("Exceptions", readiness?.exception_count ?? 0)}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {issueList("Blocking issues", readiness?.blocking_items ?? [], "danger")}
          {issueList("Warning issues", readiness?.warning_items ?? [], "warning")}
        </div>

        <div className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
          Existing invoice, receipt, journal, direct-sale, rent/lease, credit-note, debit-note, and delivery document numbers are preserved. This close workflow only closes eligible accounting periods and records an audit marker.
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-muted-foreground">
            Confirmation text
            <input
              className={accountingFieldClassName()}
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              placeholder={requiredText || "Select a financial year"}
            />
            {requiredText ? <span className="mt-1 block text-xs">Required: {requiredText}</span> : null}
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={acknowledgeWarnings} onChange={(event) => setAcknowledgeWarnings(event.target.checked)} />
            Acknowledge warning items after admin review
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void loadReadiness(selectedValue)}
            disabled={loading}
          >
            Refresh readiness
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void submitClose()}
            disabled={!canSubmit || loading}
          >
            {loading ? "Working..." : "Close year"}
          </button>
        </div>

        {readiness?.periods?.length ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-background">
            <table className="min-w-full divide-y divide-border text-xs">
              <thead className="bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Dates</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Journals</th>
                  <th className="px-3 py-2">Invoices</th>
                  <th className="px-3 py-2">Receipts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {readiness.periods.map((period) => (
                  <tr key={period.id}>
                    <td className="px-3 py-2 font-semibold text-foreground">{period.code}</td>
                    <td className="px-3 py-2 text-muted-foreground">{accountingDate(period.start_date)} – {accountingDate(period.end_date)}</td>
                    <td className="px-3 py-2">{period.status}</td>
                    <td className="px-3 py-2">{period.journal_count} · Dr {period.journal_debit_total} / Cr {period.journal_credit_total}</td>
                    <td className="px-3 py-2">{period.invoice_count} · {period.invoice_total}</td>
                    <td className="px-3 py-2">{period.receipt_count} · {period.receipt_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </WorkspaceSection>
  );
}
