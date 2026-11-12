"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import {
  createFinanceTransfer,
  listFinanceTransfers,
  previewFinanceTransfer,
  type CreateFinanceTransferPayload,
  type CreateFinanceTransferResult,
  type FinanceTransferPreview,
  type FinanceTransferRecord,
} from "@/services/finance-operations";

const todayStr = new Date().toISOString().slice(0, 10);

export default function FinanceTransfersPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "new" ? "new" : "register";

  const [activeTab, setActiveTab] = useState<"register" | "new">(initialTab);
  const [transfers, setTransfers] = useState<FinanceTransferRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // New Transfer Form State
  const [form, setForm] = useState<CreateFinanceTransferPayload>({
    movement_date: todayStr,
    from_finance_account_id: 0,
    to_finance_account_id: 0,
    amount: "",
    reference_no: "",
    notes: "",
  });

  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<FinanceTransferPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<CreateFinanceTransferResult | null>(null);

  const loadData = useCallback(async (isRefresh = false, targetPage = page) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [transfersResp, accountsResp] = await Promise.all([
        listFinanceTransfers({
          page: targetPage,
          page_size: 25,
          status: statusFilter || undefined,
          finance_account_id: accountFilter || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
        listFinanceAccounts(),
      ]);
      setTransfers(transfersResp.results || []);
      setTotalCount(transfersResp.count || 0);
      setTotalPages(transfersResp.total_pages || Math.max(1, Math.ceil((transfersResp.count || 0) / 25)));
      setAccounts(Array.isArray(accountsResp) ? accountsResp : (accountsResp as unknown as { results?: FinanceAccount[] })?.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finance transfers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accountFilter, dateFrom, dateTo, page, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Sync tab with URL if changed
  useEffect(() => {
    if (searchParams.get("tab") === "new") {
      setActiveTab("new");
    }
  }, [searchParams]);

  const switchTab = (tab: "register" | "new") => {
    setActiveTab(tab);
    setPostResult(null);
    setPreviewError(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tab === "new") {
        url.searchParams.set("tab", "new");
      } else {
        url.searchParams.delete("tab");
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.from_finance_account_id || !form.to_finance_account_id) {
      setPreviewError("Please select both source and destination finance accounts.");
      return;
    }
    if (form.from_finance_account_id === form.to_finance_account_id) {
      setPreviewError("Source and destination finance accounts must be different.");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setPreviewError("Please enter a valid transfer amount greater than zero.");
      return;
    }

    setPreviewing(true);
    setPreviewError(null);
    setPostResult(null);

    try {
      const preview = await previewFinanceTransfer(form);
      setPreviewData(preview);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to generate transfer preview.");
      setPreviewData(null);
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirmTransfer = async () => {
    if (!previewData || !previewData.can_post) return;

    setPosting(true);
    setPreviewError(null);
    try {
      const result = await createFinanceTransfer(form, previewData.idempotency_key);
      setPostResult(result);
      setPreviewData(null);
      // Reset form
      setForm({
        movement_date: todayStr,
        from_finance_account_id: 0,
        to_finance_account_id: 0,
        amount: "",
        reference_no: "",
        notes: "",
      });
      // Reload transfers list
      void loadData(true, 1);
      setPage(1);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to post finance transfer.");
    } finally {
      setPosting(false);
    }
  };

  const totalTransferred = useMemo(() => {
    return transfers.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
  }, [transfers]);

  return (
    <ERPPageShell
      eyebrow="Finance Operations"
      title="Internal Ledger Transfers"
      subtitle="Strict double-entry treasury transfers between settlement cash desks, bank accounts, and UPI rails."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Finance Control", href: "/admin/finance-control" },
        { label: "Internal Transfers" },
      ]}
      actions={[
        {
          label: refreshing ? "Refreshing..." : "Refresh Data",
          variant: "secondary",
          onClick: () => void loadData(true),
        },
        {
          href: "/admin/finance-control",
          label: "Finance Control Tower",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.accountingJournals,
          label: "General Journals",
          variant: "secondary",
        },
      ]}
      statusBadge={{
        label: `${totalCount} Registered Transfers`,
        tone: "info",
      }}
      stats={[
        {
          label: "Total Transfers",
          value: totalCount,
          tone: "default",
        },
        {
          label: "Volume in View",
          value: formatRupee(totalTransferred),
          tone: "info",
        },
        {
          label: "Active Accounts",
          value: accounts.length,
          tone: "default",
        },
        {
          label: "Double-Entry Rail",
          value: "Balanced & Audited",
          tone: "success",
        },
      ]}
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => switchTab("register")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "register"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Transfers Register
              <span className="ml-1 rounded-full bg-background/20 px-2 py-0.5 text-xs font-mono">
                {totalCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => switchTab("new")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "new"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Plus className="h-4 w-4" />
              New Finance Transfer
            </button>
          </div>

          <Link
            href="/admin/finance-control"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            ← Back to Finance Control Tower
          </Link>
        </div>

        {/* Tab 1: Transfers Register */}
        {activeTab === "register" && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All Statuses</option>
                  <option value="POSTED">Posted</option>
                  <option value="DRAFT">Draft</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>

                <select
                  value={accountFilter}
                  onChange={(e) => {
                    setAccountFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All Finance Accounts</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.kind})
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setPage(1);
                    }}
                    placeholder="From Date"
                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setPage(1);
                    }}
                    placeholder="To Date"
                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {(statusFilter || accountFilter || dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("");
                      setAccountFilter("");
                      setDateFrom("");
                      setDateTo("");
                      setPage(1);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline flex items-center gap-1 ml-auto"
                  >
                    <X className="h-3 w-3" /> Clear Filters
                  </button>
                )}
              </div>
            </div>

            {loading ? <ERPLoadingState label="Loading internal finance transfers..." /> : null}

            {!loading && error ? (
              <ERPErrorState
                title="Failed to Load Transfers"
                description={error}
                onRetry={() => void loadData(true)}
              />
            ) : null}

            {!loading && !error && transfers.length === 0 ? (
              <ERPEmptyState
                title="No Finance Transfers Found"
                description="Use the 'New Finance Transfer' tab to record an internal ledger transfer between settlement desks."
              />
            ) : null}

            {!loading && !error && transfers.length > 0 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border/80 bg-muted/30 text-muted-foreground uppercase tracking-wider font-semibold">
                        <tr>
                          <th className="py-3 px-4">Transfer No</th>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Source (From)</th>
                          <th className="py-3 px-4">Destination (To)</th>
                          <th className="py-3 px-4 text-right">Amount</th>
                          <th className="py-3 px-4">Reference / Notes</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Journal Ref</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {transfers.map((item) => (
                          <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3 px-4 font-bold text-foreground font-mono">
                              {item.movement_no}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {item.movement_date}
                            </td>
                            <td className="py-3 px-4 font-medium text-foreground">
                              {item.from_finance_account_name}
                            </td>
                            <td className="py-3 px-4 font-medium text-foreground">
                              <span className="text-muted-foreground mr-1">→</span>
                              {item.to_finance_account_name}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-foreground tabular-nums text-sm">
                              {formatRupee(item.amount)}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground max-w-xs truncate">
                              {item.reference_no || item.notes || "—"}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  item.status === "POSTED"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {item.posted_journal_entry_id ? (
                                <Link
                                  href={ROUTES.admin.accountingJournals}
                                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                                >
                                  View Journal
                                  <ArrowRight className="h-3 w-3" />
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <div>
                      Showing page <strong className="font-semibold text-foreground">{page}</strong> of <strong className="font-semibold text-foreground">{totalPages}</strong> ({totalCount} total entries)
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={page <= 1 || loading}
                        onClick={() => {
                          const newPage = Math.max(1, page - 1);
                          setPage(newPage);
                          void loadData(false, newPage);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Previous
                      </button>
                      <button
                        type="button"
                        disabled={page >= totalPages || loading}
                        onClick={() => {
                          const newPage = Math.min(totalPages, page + 1);
                          setPage(newPage);
                          void loadData(false, newPage);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
                      >
                        Next <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: New Transfer Form */}
        {activeTab === "new" && (
          <div className="space-y-6">
            <ERPSectionShell
              title="Record New Internal Finance Transfer"
              description="Execute a safe, audited transfer of funds between any two active settlement finance accounts."
            >
              {postResult && (
                <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    Finance Transfer Successfully Posted!
                  </div>
                  <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
                    Voucher <strong>{postResult.movement_no}</strong> for <strong>{formatRupee(postResult.amount)}</strong> has been posted to the General Journal.
                  </p>
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      onClick={() => switchTab("register")}
                      className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700 transition"
                    >
                      View in Register
                    </button>
                    <Link
                      href={ROUTES.admin.accountingJournals}
                      className="rounded-lg border border-emerald-300 bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition"
                    >
                      Inspect General Journals →
                    </Link>
                  </div>
                </div>
              )}

              {previewError && (
                <div className="mb-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                    Transfer Validation Error
                  </div>
                  <p className="mt-1 text-xs text-rose-800 dark:text-rose-300">
                    {previewError}
                  </p>
                </div>
              )}

              <form onSubmit={handlePreview} className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-foreground">
                  Transfer Date
                  <input
                    type="date"
                    required
                    value={form.movement_date}
                    onChange={(e) => setForm({ ...form, movement_date: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>

                <label className="text-sm font-medium text-foreground">
                  Transfer Amount (₹)
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>

                <label className="text-sm font-medium text-foreground">
                  Source Account (Credit / Outgoing)
                  <select
                    required
                    value={form.from_finance_account_id}
                    onChange={(e) => setForm({ ...form, from_finance_account_id: Number(e.target.value) })}
                    className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value={0}>Select Source Finance Account</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.kind}) · {acc.chart_account_name || acc.chart_account_code}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-foreground">
                  Destination Account (Debit / Incoming)
                  <select
                    required
                    value={form.to_finance_account_id}
                    onChange={(e) => setForm({ ...form, to_finance_account_id: Number(e.target.value) })}
                    className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value={0}>Select Destination Finance Account</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.kind}) · {acc.chart_account_name || acc.chart_account_code}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-foreground">
                  Reference No / Cheque No / UTR (Optional)
                  <input
                    type="text"
                    placeholder="e.g., TXN-940212 or UTR-..."
                    value={form.reference_no}
                    onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>

                <label className="text-sm font-medium text-foreground">
                  Transfer Purpose / Notes
                  <input
                    type="text"
                    placeholder="e.g., Cash counter replenishment from bank"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>

                <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={previewing || posting}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/90 transition disabled:opacity-60"
                  >
                    {previewing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Validating & Previewing...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        Preview Double-Entry Postings
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Preview Box */}
              {previewData && (
                <div className="mt-8 rounded-xl border border-border bg-muted/20 p-5 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2">
                      <Scale className="h-5 w-5 text-primary" />
                      <h4 className="font-bold text-foreground text-sm">
                        Transfer Double-Entry Preview
                      </h4>
                    </div>
                    {previewData.already_posted ? (
                      <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        Already Posted ({previewData.existing_movement_no || "IDEMPOTENT"})
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        Ready to Commit
                      </span>
                    )}
                  </div>

                  {previewData.already_posted && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-600" />
                      This exact transfer was previously posted under voucher <strong>{previewData.existing_movement_no}</strong>. Submitting will reconcile to the existing entry without duplicating journal lines.
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-3 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Transfer Amount:</span>
                      <strong className="text-foreground text-base tabular-nums font-bold">
                        {formatRupee(previewData.amount)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Source (Credit):</span>
                      <strong className="text-foreground font-semibold">
                        {(previewData.from_finance_account as unknown as { name?: string })?.name}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Destination (Debit):</span>
                      <strong className="text-foreground font-semibold">
                        {(previewData.to_finance_account as unknown as { name?: string })?.name}
                      </strong>
                    </div>
                  </div>

                  {Array.isArray(previewData.lines) && (
                    <div className="rounded-lg border border-border/80 bg-background overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wider font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">Chart Account</th>
                            <th className="py-2.5 px-3">Description</th>
                            <th className="py-2.5 px-3 text-right">Debit</th>
                            <th className="py-2.5 px-3 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {previewData.lines.map((line, idx: number) => {
                            const chartAcc = (line as { chart_account?: { name?: string; code?: string } }).chart_account;
                            const desc = (line as { description?: string }).description;
                            const debit = (line as { debit_amount?: string }).debit_amount;
                            const credit = (line as { credit_amount?: string }).credit_amount;
                            return (
                              <tr key={idx}>
                                <td className="py-2.5 px-3 font-semibold text-foreground">
                                  {chartAcc?.name || chartAcc?.code || "Account"}
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground">
                                  {desc}
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums font-mono font-medium text-foreground">
                                  {formatRupee(debit || "0")}
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums font-mono font-medium text-foreground">
                                  {formatRupee(credit || "0")}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex justify-end pt-3">
                    <button
                      type="button"
                      disabled={posting || !previewData.can_post}
                      onClick={() => void handleConfirmTransfer()}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-6 py-2.5 text-sm font-bold shadow hover:bg-emerald-700 transition disabled:opacity-60"
                    >
                      {posting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Posting to General Ledger...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Confirm & Post Transfer Now
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </ERPSectionShell>
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
