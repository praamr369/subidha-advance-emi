"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { ACCOUNTING_REGISTER_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import { AccountingControlShell } from "@/components/layout/page-shells";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { MetricStrip } from "@/components/ui/operations";
import { WorkspaceSection } from "@/components/ui/workspace";
import { buildAdminJournalEntryPrintRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import {
  createManualJournalEntry,
  listChartOfAccounts,
  listJournalEntries,
  postJournalEntry,
  voidJournalEntry,
  type ChartOfAccount,
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
  return "Failed to load journal register.";
}

function fieldClassName() {
  return "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground";
}

export default function AccountingJournalsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccount[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [journalForm, setJournalForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    memo: "",
    description: "",
    amount: "0.00",
    debit_account: "",
    credit_account: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [chartPayload, journalPayload] = await Promise.all([
        listChartOfAccounts(),
        listJournalEntries(),
      ]);
      setChartAccounts(chartPayload.results);
      setJournals(journalPayload.results);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setChartAccounts([]);
        setJournals([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreateJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createManualJournalEntry({
        entry_date: journalForm.entry_date,
        entry_type: "MANUAL",
        memo: journalForm.memo,
        lines: [
          {
            chart_account: Number(journalForm.debit_account),
            description: journalForm.description || journalForm.memo,
            debit_amount: journalForm.amount,
            credit_amount: "0.00",
          },
          {
            chart_account: Number(journalForm.credit_account),
            description: journalForm.description || journalForm.memo,
            debit_amount: "0.00",
            credit_amount: journalForm.amount,
          },
        ],
      });
      setJournalForm({
        entry_date: new Date().toISOString().slice(0, 10),
        memo: "",
        description: "",
        amount: "0.00",
        debit_account: "",
        credit_account: "",
      });
      setNotice("Draft journal created.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handlePostJournal(id: number) {
    try {
      await postJournalEntry(id);
      setNotice("Journal posted.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handleVoidJournal(id: number) {
    const reason = window.prompt("Enter void reason");
    if (!reason) return;

    try {
      await voidJournalEntry(id, reason);
      setNotice("Journal voided.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  const manualPostingAccounts = chartAccounts.filter((account) => account.allow_manual_posting);

  return (
    <ERPPageShell
      eyebrow="Accounting Journal Control"
      title="Journals"
      subtitle="Manual journal entries live in draft until admin posts them, and posted entries can only move to controlled void state with an explicit reason."
      helperNote="Manual journals stay separate from cashier collection and billing execution. Posting and void remain explicit to preserve ledger auditability."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Journals" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingBooks, label: "Books", variant: "secondary" },
        { href: ROUTES.admin.accountingExpenses, label: "Expenses", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <AccountingControlShell
        readinessWarnings={
          <div className="space-y-4">
            <WorkspaceDirectory
              title="Accounting control map"
              description="Use the shared accounting directory to move from manual journals into books, masters, and financial statements."
              groups={ACCOUNTING_REGISTER_DIRECTORY_GROUPS}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {notice ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {notice}
                </div>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={refreshing || loading}
                className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {!loading && !error ? (
              <MetricStrip
                items={[
                  { label: "Chart accounts", value: String(chartAccounts.length) },
                  { label: "Journal entries", value: String(journals.length) },
                  { label: "Draft", value: String(journals.filter((item) => item.status === "DRAFT").length) },
                  { label: "Posted", value: String(journals.filter((item) => item.status === "POSTED").length) },
                ]}
              />
            ) : null}

            {loading ? <LoadingBlock label="Loading journal register..." /> : null}

            {!loading && error ? (
              <ErrorState
                title="Unable to load journal register"
                description={error}
                onRetry={() => void loadPage("initial")}
              />
            ) : null}
          </div>
        }
        primaryRegister={
          !loading && !error ? (
            <WorkspaceSection
              title="Journal register"
              description="Posted journal entries remain immutable except for controlled void with a reason. Draft entries can be reviewed and posted here."
            >
              {journals.length === 0 ? (
                <EmptyState
                  title="No journal entries yet"
                  description="Create the first draft journal in the control panel to start the accounting books."
                />
              ) : (
                <div className="grid gap-2">
                  {journals.map((journal) => {
                    const statusCls =
                      journal.status === "POSTED"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : journal.status === "VOID"
                          ? "border-red-200 bg-red-50 text-red-800"
                          : "border-amber-200 bg-amber-50 text-amber-800";
                    return (
                      <div
                        key={journal.id}
                        className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:shadow-[0_3px_10px_rgba(0,0,0,0.07)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">{journal.entry_no}</span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusCls}`}>{journal.status}</span>
                              {journal.entry_type !== "MANUAL" ? (
                                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{journal.entry_type}</span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDate(journal.entry_date)} · FY {journal.financial_year_code || "pending"} · Period {journal.accounting_period_code || "TBD"}
                              {journal.accounting_period_status ? ` (${journal.accounting_period_status})` : ""}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold tabular-nums text-foreground">
                              {journal.lines.length > 0
                                ? formatRupee(journal.lines[0].debit_amount || journal.lines[0].credit_amount)
                                : formatRupee(0)}
                            </div>
                            {journal.memo ? <div className="mt-0.5 text-xs text-muted-foreground">{journal.memo}</div> : null}
                          </div>
                        </div>

                        {journal.lines.length > 0 ? (
                          <div className="grid gap-1.5 border-t border-border/60 px-4 py-3 sm:grid-cols-2">
                            {journal.lines.map((line, index) => (
                              <div
                                key={`${journal.id}-${index}`}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-medium text-foreground">
                                    {line.chart_account_code} · {line.chart_account_name}
                                  </div>
                                </div>
                                <div className="shrink-0 text-right text-xs text-muted-foreground">
                                  {Number(line.debit_amount) > 0 ? <span className="text-foreground font-medium">Dr {formatRupee(line.debit_amount)}</span> : null}
                                  {Number(line.credit_amount) > 0 ? <span className="text-foreground font-medium">Cr {formatRupee(line.credit_amount)}</span> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2.5">
                          <Link
                            href={buildAdminJournalEntryPrintRoute(journal.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-muted"
                          >
                            PDF / Print
                          </Link>
                          {journal.status === "DRAFT" ? (
                            <button
                              type="button"
                              onClick={() => void handlePostJournal(journal.id)}
                              className="inline-flex h-8 items-center rounded-lg bg-foreground px-3 text-xs font-semibold text-background transition hover:opacity-90"
                            >
                              Post
                            </button>
                          ) : null}
                          {journal.status === "POSTED" ? (
                            <button
                              type="button"
                              onClick={() => void handleVoidJournal(journal.id)}
                              className="inline-flex h-8 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                            >
                              Void
                            </button>
                          ) : null}
                          {journal.void_reason ? (
                            <span className="text-xs text-destructive">Voided: {journal.void_reason}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </WorkspaceSection>
          ) : null
        }
        controlPanel={
          !loading && !error ? (
            <WorkspaceSection
              title="Create manual journal"
              description="This draft form creates a balanced two-line journal. Posting is a separate admin action so no manual entry becomes final by accident."
            >
              <form className="grid gap-3" onSubmit={handleCreateJournal}>
                <label className="text-sm text-muted-foreground">
                  Entry date
                  <input
                    className={fieldClassName()}
                    type="date"
                    value={journalForm.entry_date}
                    onChange={(event) =>
                      setJournalForm((current) => ({
                        ...current,
                        entry_date: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Amount
                  <input
                    className={fieldClassName()}
                    type="number"
                    min="0"
                    step="0.01"
                    value={journalForm.amount}
                    onChange={(event) =>
                      setJournalForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Memo
                  <input
                    className={fieldClassName()}
                    value={journalForm.memo}
                    onChange={(event) =>
                      setJournalForm((current) => ({
                        ...current,
                        memo: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Line description
                  <input
                    className={fieldClassName()}
                    value={journalForm.description}
                    onChange={(event) =>
                      setJournalForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Debit account
                  <select
                    className={fieldClassName()}
                    value={journalForm.debit_account}
                    onChange={(event) =>
                      setJournalForm((current) => ({
                        ...current,
                        debit_account: event.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Select debit account</option>
                    {manualPostingAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} · {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-muted-foreground">
                  Credit account
                  <select
                    className={fieldClassName()}
                    value={journalForm.credit_account}
                    onChange={(event) =>
                      setJournalForm((current) => ({
                        ...current,
                        credit_account: event.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Select credit account</option>
                    {manualPostingAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} · {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90"
                >
                  Create draft journal
                </button>
              </form>
            </WorkspaceSection>
          ) : null
        }
      />
    </ERPPageShell>
  );
}
