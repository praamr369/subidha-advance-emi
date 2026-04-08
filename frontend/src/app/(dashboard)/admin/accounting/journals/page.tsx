"use client";

import { useEffect, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  createManualJournalEntry,
  listChartOfAccounts,
  listJournalEntries,
  postJournalEntry,
  voidJournalEntry,
  type ChartOfAccount,
  type JournalEntry,
} from "@/services/accounting";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

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
    <PortalPage
      title="Journals"
      subtitle="Manual journal entries live in draft until admin posts them, and posted entries can only move to controlled void state with an explicit reason."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Journals" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingBooks, label: "Books", variant: "secondary" },
        { href: ROUTES.admin.accountingExpenses, label: "Expenses", variant: "secondary" },
      ]}
      stats={[
        { label: "Chart Accounts", value: String(chartAccounts.length), tone: "info" },
        { label: "Journal Entries", value: String(journals.length) },
        {
          label: "Draft",
          value: String(journals.filter((item) => item.status === "DRAFT").length),
          tone: journals.some((item) => item.status === "DRAFT") ? "warning" : "success",
        },
        {
          label: "Posted",
          value: String(journals.filter((item) => item.status === "POSTED").length),
          tone: "success",
        },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {notice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        {loading ? <LoadingBlock label="Loading journal register..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load journal register"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <WorkspaceSection
              title="Create manual journal"
              description="This draft form creates a balanced two-line journal. Posting is a separate admin action so no manual entry becomes final by accident."
            >
              <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateJournal}>
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
                <label className="text-sm text-muted-foreground md:col-span-2">
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
                <label className="text-sm text-muted-foreground md:col-span-2">
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
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Create draft journal
                  </button>
                </div>
              </form>
            </WorkspaceSection>

            <WorkspaceSection
              title="Journal register"
              description="Posted journal entries remain immutable except for controlled void with a reason. Draft entries can be reviewed and posted here."
            >
              {journals.length === 0 ? (
                <EmptyState
                  title="No journal entries yet"
                  description="Create the first draft journal above to start the accounting books."
                />
              ) : (
                <div className="grid gap-3">
                  {journals.map((journal) => (
                    <div
                      key={journal.id}
                      className="rounded-[1.4rem] border border-white/80 bg-white/75 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {journal.entry_no}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {journal.entry_type} • {journal.status} • {formatDate(journal.entry_date)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-foreground">
                            {journal.lines.length > 0
                              ? money(journal.lines[0].debit_amount || journal.lines[0].credit_amount)
                              : money(0)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {journal.memo || "No memo"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {journal.lines.map((line, index) => (
                          <div
                            key={`${journal.id}-${index}`}
                            className="rounded-xl border border-white/70 bg-white px-3 py-3 text-sm text-foreground"
                          >
                            <div className="font-medium">
                              {line.chart_account_code} · {line.chart_account_name}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Dr {money(line.debit_amount)} • Cr {money(line.credit_amount)}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {journal.status === "DRAFT" ? (
                          <button
                            type="button"
                            onClick={() => void handlePostJournal(journal.id)}
                            className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                          >
                            Post
                          </button>
                        ) : null}
                        {journal.status === "POSTED" ? (
                          <button
                            type="button"
                            onClick={() => void handleVoidJournal(journal.id)}
                            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
                          >
                            Void
                          </button>
                        ) : null}
                        {journal.void_reason ? (
                          <span className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            Void reason: {journal.void_reason}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
