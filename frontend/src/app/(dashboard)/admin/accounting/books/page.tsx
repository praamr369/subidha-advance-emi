"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { RegistryPageShell } from "@/components/layout/page-shells";
import PortalPage from "@/components/ui/PortalPage";
import { MetricStrip } from "@/components/ui/operations";
import { WorkspaceSection } from "@/components/ui/workspace";
import { getAccountingBooksReadiness, type AccountingBooksReadiness, type AccountingBooksReadinessAccount } from "@/services/accounting-books";
import {
  buildAdminFinanceAccountStatementPrintRoute,
  buildAdminLedgerStatementPrintRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import {
  createMoneyMovement,
  listMoneyMovements,
  postMoneyMovement,
  type MoneyMovement,
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
  return "Failed to load books and money movements.";
}

function fieldClassName() {
  return "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground";
}

function badgeClass(tone: "green" | "amber" | "red" | "blue" | "slate") {
  const map = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-slate-200 bg-slate-50 text-muted-foreground",
  };
  return `inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${map[tone]}`;
}

export default function AccountingBooksPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<AccountingBooksReadiness | null>(null);
  const [moneyMovements, setMoneyMovements] = useState<MoneyMovement[]>([]);
  const [movementForm, setMovementForm] = useState({
    movement_date: new Date().toISOString().slice(0, 10),
    from_finance_account: "",
    to_finance_account: "",
    amount: "0.00",
    reference_no: "",
    notes: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [readinessPayload, movementPayload] = await Promise.all([
        getAccountingBooksReadiness(),
        listMoneyMovements(),
      ]);
      setReadiness(readinessPayload);
      setMoneyMovements(movementPayload.results);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setReadiness(null);
        setMoneyMovements([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const eligibleAccounts = readiness?.movement_eligible_accounts ?? [];
  const financeAccounts = readiness?.finance_accounts ?? [];
  const selectedFrom = eligibleAccounts.find((account) => String(account.id) === movementForm.from_finance_account) ?? null;
  const selectedTo = eligibleAccounts.find((account) => String(account.id) === movementForm.to_finance_account) ?? null;
  const amountValue = Number(movementForm.amount || 0);
  const formBlocker = useMemo(() => {
    if (eligibleAccounts.length < 2) return "At least two movement-eligible settlement accounts are required.";
    if (!movementForm.from_finance_account || !movementForm.to_finance_account) return "Select source and destination accounts.";
    if (movementForm.from_finance_account === movementForm.to_finance_account) return "Source and destination must be different.";
    if (!Number.isFinite(amountValue) || amountValue <= 0) return "Amount must be greater than zero.";
    return "";
  }, [amountValue, eligibleAccounts.length, movementForm.from_finance_account, movementForm.to_finance_account]);
  const canCreateMovement = !formBlocker;

  async function handleCreateMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateMovement) return;
    try {
      await createMoneyMovement({
        movement_date: movementForm.movement_date,
        from_finance_account: Number(movementForm.from_finance_account),
        to_finance_account: Number(movementForm.to_finance_account),
        amount: movementForm.amount,
        reference_no: movementForm.reference_no.trim(),
        notes: movementForm.notes.trim(),
      });
      setMovementForm({
        movement_date: new Date().toISOString().slice(0, 10),
        from_finance_account: "",
        to_finance_account: "",
        amount: "0.00",
        reference_no: "",
        notes: "",
      });
      setNotice("Money movement draft created. Post explicitly after review.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handlePostMovement(id: number) {
    try {
      await postMoneyMovement(id);
      setNotice("Money movement posted and journal entry created.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  const postedCount = moneyMovements.filter((item) => item.status === "POSTED").length;
  const draftCount = moneyMovements.filter((item) => item.status === "DRAFT").length;
  const hasReadinessBlocker = Boolean(readiness?.blockers?.length);

  return (
    <PortalPage
      title="Books"
      subtitle="Track finance accounts and explicit inter-account transfers inside accounting. This is not the EMI collection register and does not auto-post bridge rows."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Books" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingChartOfAccounts, label: "Chart Setup", variant: "secondary" },
        { href: ROUTES.admin.accountingJournals, label: "Journals", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <RegistryPageShell
        header={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : <div />}
            <button type="button" onClick={() => void loadPage("refresh")} disabled={refreshing || loading} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60">
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        }
        summary={
          <div className="space-y-4">
            {!loading && !error ? (
              <MetricStrip
                items={[
                  { label: "Finance accounts", value: String(readiness?.counts.active_finance_accounts ?? financeAccounts.length) },
                  { label: "Eligible transfers", value: String(readiness?.counts.movement_eligible_accounts ?? eligibleAccounts.length) },
                  { label: "Draft movements", value: String(draftCount) },
                  { label: "Posted movements", value: String(postedCount) },
                ]}
              />
            ) : null}
            {loading ? <LoadingBlock label="Loading books..." /> : null}
            {!loading && error ? <ErrorState title="Unable to load books" description={error} onRetry={() => void loadPage("initial")} /> : null}
          </div>
        }
        register={
          !loading && !error ? (
            <div className="space-y-6">
              <WorkspaceSection title="Books readiness" description="Money movement is available only when settlement accounts are active, real, and mapped to posting-ready ASSET chart accounts.">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border bg-background p-4"><div className="text-xs font-semibold uppercase text-muted-foreground">Status</div><div className="mt-2 text-lg font-semibold text-foreground">{readiness?.status || "NEEDS_SETUP"}</div></div>
                  <div className="rounded-xl border border-border bg-background p-4"><div className="text-xs font-semibold uppercase text-muted-foreground">Cash / Bank / UPI</div><div className="mt-2 text-sm font-semibold text-foreground">{readiness?.counts.cash_accounts ?? 0} / {readiness?.counts.bank_accounts ?? 0} / {readiness?.counts.upi_accounts ?? 0}</div></div>
                  <div className="rounded-xl border border-border bg-background p-4"><div className="text-xs font-semibold uppercase text-muted-foreground">Movement eligible</div><div className="mt-2 text-lg font-semibold text-foreground">{eligibleAccounts.length}</div></div>
                  <div className="rounded-xl border border-border bg-background p-4"><div className="text-xs font-semibold uppercase text-muted-foreground">Posting contract</div><div className="mt-2 text-sm font-semibold text-foreground">Explicit only</div></div>
                </div>
                {readiness?.blockers?.length ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"><div className="font-semibold">Blockers</div><ul className="mt-2 list-disc space-y-1 pl-5">{readiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                {readiness?.warnings?.length ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div className="font-semibold">Warnings</div><ul className="mt-2 list-disc space-y-1 pl-5">{readiness.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                {readiness?.safety_note ? <p className="mt-4 text-sm text-muted-foreground">{readiness.safety_note}</p> : null}
              </WorkspaceSection>

              <WorkspaceSection title="Money movement register" description="Draft transfers stay editable until posted. Posted rows expose the journal number generated by the accounting service.">
                {moneyMovements.length === 0 ? (
                  <EmptyState title="No money movements yet" description="Create a draft transfer only for real cash/bank/UPI movement between finance accounts." />
                ) : (
                  <div className="grid gap-2">
                    {moneyMovements.map((movement) => {
                      const isDraft = movement.status === "DRAFT";
                      const statusCls = isDraft
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800";
                      return (
                        <div key={movement.id} className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:shadow-[0_3px_10px_rgba(0,0,0,0.07)]">
                          <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">{movement.movement_no}</span>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusCls}`}>{movement.status}</span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {movement.from_finance_account_name} → {movement.to_finance_account_name} · {formatDate(movement.movement_date)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold tabular-nums text-foreground">{formatRupee(movement.amount)}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2.5">
                            {isDraft ? (
                              <button type="button" onClick={() => void handlePostMovement(movement.id)}
                                className="inline-flex h-8 items-center rounded-lg bg-foreground px-3 text-xs font-semibold text-background transition hover:opacity-90">
                                Post
                              </button>
                            ) : null}
                            {movement.posted_journal_entry_no ? (
                              <span className="text-xs font-medium text-emerald-700">Journal {movement.posted_journal_entry_no}</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </WorkspaceSection>

              <div className="grid gap-4 xl:grid-cols-2">
                <WorkspaceSection title="Create money movement" description="Transfer value between real settlement finance accounts. Posting remains explicit; this does not create bridge rows or customer payment records.">
                  <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateMovement}>
                    <label className="text-sm text-muted-foreground">Movement date<input className={fieldClassName()} type="date" value={movementForm.movement_date} onChange={(event) => setMovementForm((current) => ({ ...current, movement_date: event.target.value }))} required /></label>
                    <label className="text-sm text-muted-foreground">Amount<input className={fieldClassName()} type="number" min="0.01" step="0.01" value={movementForm.amount} onChange={(event) => setMovementForm((current) => ({ ...current, amount: event.target.value }))} required /></label>
                    <label className="text-sm text-muted-foreground">From account<select className={fieldClassName()} value={movementForm.from_finance_account} onChange={(event) => setMovementForm((current) => ({ ...current, from_finance_account: event.target.value }))} required><option value="">Select source</option>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                    <label className="text-sm text-muted-foreground">To account<select className={fieldClassName()} value={movementForm.to_finance_account} onChange={(event) => setMovementForm((current) => ({ ...current, to_finance_account: event.target.value }))} required><option value="">Select destination</option>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                    <label className="text-sm text-muted-foreground">Reference no<input className={fieldClassName()} value={movementForm.reference_no} onChange={(event) => setMovementForm((current) => ({ ...current, reference_no: event.target.value }))} /></label>
                    <label className="text-sm text-muted-foreground md:col-span-2">Notes<textarea className={fieldClassName()} value={movementForm.notes} onChange={(event) => setMovementForm((current) => ({ ...current, notes: event.target.value }))} rows={3} /></label>
                    {selectedFrom && selectedTo ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 md:col-span-2">Preview: Dr {selectedTo.chart_account_code || selectedTo.name} / Cr {selectedFrom.chart_account_code || selectedFrom.name}. Journal is created only after explicit Post.</div> : null}
                    {formBlocker ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 md:col-span-2">{formBlocker}</div> : null}
                    <div className="md:col-span-2"><button type="submit" disabled={!canCreateMovement || hasReadinessBlocker} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">Create draft movement</button></div>
                  </form>
                </WorkspaceSection>

                <WorkspaceSection title="Finance accounts" description="Operational finance accounts mapped to ASSET chart accounts. These are source/destination controls for movement posting.">
                  {financeAccounts.length === 0 ? <EmptyState title="No finance accounts yet" description="Create finance accounts in chart setup before recording money movements." /> : (
                    <div className="grid gap-2">
                      {financeAccounts.map((account: AccountingBooksReadinessAccount) => (
                        <div key={account.id} className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <div className="flex items-start justify-between gap-3 p-4">
                            <div>
                              <div className="text-sm font-semibold text-foreground">{account.name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{account.kind} · {account.chart_account_code || "No chart code"} · {account.chart_account_name || "No linked chart account"}</div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className={badgeClass(account.movement_eligible ? "green" : "amber")}>{account.movement_eligible ? "Movement eligible" : "Not eligible"}</span>
                                <span className={badgeClass(account.collection_ready ? "green" : "amber")}>{account.collection_ready ? "Collection ready" : "Review"}</span>
                                {account.branch_code ? <span className={badgeClass("blue")}>{account.branch_code}</span> : null}
                              </div>
                              {account.collection_blocker_reason ? <div className="mt-1.5 text-xs text-amber-900">{account.collection_blocker_reason}</div> : null}
                            </div>
                            <div className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatRupee(account.opening_balance)}</div>
                          </div>
                          <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-2.5">
                            <Link href={buildAdminFinanceAccountStatementPrintRoute(account.id)} className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-muted">Finance Statement</Link>
                            {account.chart_account_id ? <Link href={buildAdminLedgerStatementPrintRoute(account.chart_account_id)} className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-muted">Ledger Statement</Link> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </WorkspaceSection>
              </div>
            </div>
          ) : null
        }
      />
    </PortalPage>
  );
}
