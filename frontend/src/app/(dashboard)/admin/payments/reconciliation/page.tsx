"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalPage from "@/components/ui/portal-page";
import { apiFetch } from "@/lib/api";

/**
 * Enterprise-grade Payment Reconciliation page
 * Route:
 *   src/app/dashboard/admin/payments/reconciliation/page.tsx
 *
 * Notes:
 * - Designed for real retail operations in SUBIDHA CORE
 * - Works even when backend response shape is partially inconsistent
 * - Keeps all logic additive and safe for later rental/lease extension
 * - Avoids destructive actions in UI; uses review / reconcile / flag patterns
 */

/* =========================
   Types
========================= */

type ReconciliationStatus =
  | "MATCHED"
  | "PARTIAL"
  | "OVERPAID"
  | "UNLINKED"
  | "MISSING_PAYMENT"
  | "DUPLICATE"
  | "FLAGGED"
  | "REVERSED"
  | "PENDING_REVIEW";

type PaymentMethod = "CASH" | "UPI" | "BANK" | "CARD" | "CHEQUE" | "UNKNOWN";

type ReconciliationRecord = {
  id: number;
  payment_id: number | null;
  emi_id: number | null;
  subscription_id: number | null;
  subscription_code: string;
  batch_id: number | null;
  batch_code: string | null;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string;
  partner_id: number | null;
  partner_name: string | null;
  lucky_number: number | null;

  transaction_date: string | null;
  payment_date: string | null;
  due_date: string | null;

  emi_month_no: number | null;
  expected_amount: string;
  paid_amount: string;
  outstanding_amount: string;
  excess_amount: string;

  payment_method: PaymentMethod;
  payment_reference: string | null;
  collected_by: string | null;

  status: ReconciliationStatus;
  is_locked: boolean;
  is_flagged: boolean;
  notes: string | null;
  issue_code: string | null;

  created_at: string | null;
  updated_at: string | null;
};

type SummaryCardData = {
  total_records: number;
  total_expected_amount: string;
  total_paid_amount: string;
  matched_count: number;
  mismatch_count: number;
  unlinked_count: number;
  duplicate_count: number;
  flagged_count: number;
  locked_count: number;
};

type BatchOption = {
  id: number;
  batch_code: string;
};

type PartnerOption = {
  id: number;
  username: string;
  full_name?: string | null;
};

type FiltersState = {
  search: string;
  status: string;
  payment_method: string;
  batch_id: string;
  partner_id: string;
  date_from: string;
  date_to: string;
  amount_min: string;
  amount_max: string;
  only_flagged: boolean;
  only_unlocked: boolean;
};

type ApiPayload = {
  summary?: Partial<SummaryCardData>;
  results?: unknown[];
  records?: unknown[];
  items?: unknown[];

  batches?: BatchOption[];
  partners?: PartnerOption[];

  pagination?: {
    page?: number;
    page_size?: number;
    total_pages?: number;
    total_items?: number;
  };
  count?: number;
  next?: string | null;
  previous?: string | null;
};

type ToastState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

/* =========================
   Constants
========================= */

const DEFAULT_FILTERS: FiltersState = {
  search: "",
  status: "",
  payment_method: "",
  batch_id: "",
  partner_id: "",
  date_from: "",
  date_to: "",
  amount_min: "",
  amount_max: "",
  only_flagged: false,
  only_unlocked: false,
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "MATCHED", label: "Matched" },
  { value: "PARTIAL", label: "Partial" },
  { value: "OVERPAID", label: "Overpaid" },
  { value: "UNLINKED", label: "Unlinked" },
  { value: "MISSING_PAYMENT", label: "Missing Payment" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "FLAGGED", label: "Flagged" },
  { value: "REVERSED", label: "Reversed" },
  { value: "PENDING_REVIEW", label: "Pending Review" },
];

const METHOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All methods" },
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK", label: "Bank" },
  { value: "CARD", label: "Card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "UNKNOWN", label: "Unknown" },
];

/* =========================
   Utilities
========================= */

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") return "0.00";
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return "0.00";
  return asNumber.toFixed(2);
}

function formatCurrency(value: string | number | null | undefined): string {
  const num = Number(value ?? 0);
  const safeNum = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(safeNum);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, rawValue]) => {
    if (
      rawValue === undefined ||
      rawValue === null ||
      rawValue === "" ||
      rawValue === false
    ) {
      return;
    }
    searchParams.set(key, String(rawValue));
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

function normalizeRecord(item: any): ReconciliationRecord {
  const record: ReconciliationRecord = {
    id: toNumber(item?.id),
    payment_id: item?.payment_id ?? item?.payment ?? null,
    emi_id: item?.emi_id ?? item?.emi ?? null,
    subscription_id: item?.subscription_id ?? item?.subscription ?? null,
    subscription_code:
      item?.subscription_code ??
      item?.subscription_label ??
      item?.subscription_number ??
      (item?.subscription_id ? `SUB-${item.subscription_id}` : "—"),
    batch_id: item?.batch_id ?? item?.batch ?? null,
    batch_code: item?.batch_code ?? null,
    customer_id: item?.customer_id ?? item?.customer ?? null,
    customer_name: item?.customer_name ?? item?.customer_label ?? "Unknown Customer",
    customer_phone: item?.customer_phone ?? item?.phone ?? "—",
    partner_id: item?.partner_id ?? item?.partner ?? null,
    partner_name: item?.partner_name ?? item?.partner_label ?? null,
    lucky_number:
      item?.lucky_number !== null && item?.lucky_number !== undefined
        ? Number(item.lucky_number)
        : null,

    transaction_date: item?.transaction_date ?? item?.payment_date ?? null,
    payment_date: item?.payment_date ?? item?.transaction_date ?? null,
    due_date: item?.due_date ?? null,

    emi_month_no:
      item?.emi_month_no !== null && item?.emi_month_no !== undefined
        ? Number(item.emi_month_no)
        : item?.month_no !== null && item?.month_no !== undefined
        ? Number(item.month_no)
        : null,
    expected_amount: toMoney(item?.expected_amount ?? item?.emi_amount ?? 0),
    paid_amount: toMoney(item?.paid_amount ?? item?.amount ?? 0),
    outstanding_amount: toMoney(item?.outstanding_amount ?? item?.balance_amount ?? 0),
    excess_amount: toMoney(item?.excess_amount ?? 0),

    payment_method: (item?.payment_method ?? item?.method ?? "UNKNOWN") as PaymentMethod,
    payment_reference: item?.payment_reference ?? item?.reference ?? null,
    collected_by: item?.collected_by ?? item?.created_by_name ?? null,

    status: (item?.status ?? "PENDING_REVIEW") as ReconciliationStatus,
    is_locked: Boolean(item?.is_locked ?? item?.locked ?? false),
    is_flagged: Boolean(item?.is_flagged ?? false),
    notes: item?.notes ?? null,
    issue_code: item?.issue_code ?? null,

    created_at: item?.created_at ?? null,
    updated_at: item?.updated_at ?? null,
  };

  return record;
}

function normalizeSummary(
  payload: ApiPayload,
  normalizedRecords: ReconciliationRecord[]
): SummaryCardData {
  const summary = payload.summary ?? {};

  if (Object.keys(summary).length > 0) {
    return {
      total_records:
        toNumber(summary.total_records, normalizedRecords.length) ||
        normalizedRecords.length,
      total_expected_amount: toMoney(summary.total_expected_amount ?? 0),
      total_paid_amount: toMoney(summary.total_paid_amount ?? 0),
      matched_count: toNumber(summary.matched_count),
      mismatch_count: toNumber(summary.mismatch_count),
      unlinked_count: toNumber(summary.unlinked_count),
      duplicate_count: toNumber(summary.duplicate_count),
      flagged_count: toNumber(summary.flagged_count),
      locked_count: toNumber(summary.locked_count),
    };
  }

  const aggregate = normalizedRecords.reduce(
    (acc, row) => {
      acc.total_records += 1;
      acc.total_expected_amount += Number(row.expected_amount);
      acc.total_paid_amount += Number(row.paid_amount);

      if (row.status === "MATCHED") acc.matched_count += 1;
      if (
        row.status === "PARTIAL" ||
        row.status === "OVERPAID" ||
        row.status === "MISSING_PAYMENT"
      ) {
        acc.mismatch_count += 1;
      }
      if (row.status === "UNLINKED") acc.unlinked_count += 1;
      if (row.status === "DUPLICATE") acc.duplicate_count += 1;
      if (row.is_flagged || row.status === "FLAGGED") acc.flagged_count += 1;
      if (row.is_locked) acc.locked_count += 1;

      return acc;
    },
    {
      total_records: 0,
      total_expected_amount: 0,
      total_paid_amount: 0,
      matched_count: 0,
      mismatch_count: 0,
      unlinked_count: 0,
      duplicate_count: 0,
      flagged_count: 0,
      locked_count: 0,
    }
  );

  return {
    total_records: aggregate.total_records,
    total_expected_amount: toMoney(aggregate.total_expected_amount),
    total_paid_amount: toMoney(aggregate.total_paid_amount),
    matched_count: aggregate.matched_count,
    mismatch_count: aggregate.mismatch_count,
    unlinked_count: aggregate.unlinked_count,
    duplicate_count: aggregate.duplicate_count,
    flagged_count: aggregate.flagged_count,
    locked_count: aggregate.locked_count,
  };
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

/* =========================
   Component
========================= */

export default function AdminPaymentReconciliationPage() {
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(DEFAULT_FILTERS);

  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [summary, setSummary] = useState<SummaryCardData>({
    total_records: 0,
    total_expected_amount: "0.00",
    total_paid_amount: "0.00",
    matched_count: 0,
    mismatch_count: 0,
    unlinked_count: 0,
    duplicate_count: 0,
    flagged_count: 0,
    locked_count: 0,
  });

  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const [selectedRecord, setSelectedRecord] = useState<ReconciliationRecord | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  const baseEndpoint = "/admin/payments/reconciliation/";

  const loadPage = useCallback(
    async (currentFilters: FiltersState, currentPage: number, silent = false) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const query = buildQuery({
          page: currentPage,
          page_size: pageSize,
          search: currentFilters.search,
          status: currentFilters.status,
          payment_method: currentFilters.payment_method,
          batch_id: currentFilters.batch_id,
          partner_id: currentFilters.partner_id,
          date_from: currentFilters.date_from,
          date_to: currentFilters.date_to,
          amount_min: currentFilters.amount_min,
          amount_max: currentFilters.amount_max,
          only_flagged: currentFilters.only_flagged,
          only_unlocked: currentFilters.only_unlocked,
        });

        const payload = (await apiFetch(`${baseEndpoint}${query}`)) as ApiPayload;

        const rawRows = Array.isArray(payload.results)
          ? payload.results
          : Array.isArray(payload.records)
          ? payload.records
          : Array.isArray(payload.items)
          ? payload.items
          : [];

        const normalizedRecords = rawRows.map(normalizeRecord);
        const normalizedSummary = normalizeSummary(payload, normalizedRecords);

        setRecords(normalizedRecords);
        setSummary(normalizedSummary);

        setBatches(Array.isArray(payload.batches) ? payload.batches : []);
        setPartners(Array.isArray(payload.partners) ? payload.partners : []);

        const paginationTotal =
          payload.pagination?.total_items ??
          payload.count ??
          normalizedRecords.length;

        setTotalItems(toNumber(paginationTotal));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load reconciliation data.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    loadPage(appliedFilters, page);
  }, [appliedFilters, page, loadPage]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const totalPages = useMemo(() => {
    const pages = Math.ceil(totalItems / pageSize);
    return pages > 0 ? pages : 1;
  }, [pageSize, totalItems]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of records) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return counts;
  }, [records]);

  const exportCurrentRows = useCallback(() => {
    const header = [
      "Date",
      "Payment Date",
      "Customer",
      "Phone",
      "Subscription",
      "Batch",
      "Lucky Number",
      "EMI Month",
      "Due Date",
      "Expected Amount",
      "Paid Amount",
      "Outstanding",
      "Excess",
      "Method",
      "Reference",
      "Partner",
      "Collected By",
      "Status",
      "Locked",
      "Flagged",
      "Issue Code",
      "Notes",
    ];

    const rows = records.map((row) => [
      formatDate(row.transaction_date),
      formatDate(row.payment_date),
      row.customer_name,
      row.customer_phone,
      row.subscription_code,
      row.batch_code ?? "—",
      String(row.lucky_number ?? "—"),
      String(row.emi_month_no ?? "—"),
      formatDate(row.due_date),
      row.expected_amount,
      row.paid_amount,
      row.outstanding_amount,
      row.excess_amount,
      row.payment_method,
      row.payment_reference ?? "—",
      row.partner_name ?? "—",
      row.collected_by ?? "—",
      row.status,
      row.is_locked ? "YES" : "NO",
      row.is_flagged ? "YES" : "NO",
      row.issue_code ?? "—",
      row.notes ?? "—",
    ]);

    downloadCsv(`payment-reconciliation-page-${Date.now()}.csv`, [header, ...rows]);
  }, [records]);

  const applyFilters = useCallback(() => {
    setPage(1);
    setAppliedFilters(filters);
  }, [filters]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const refresh = useCallback(() => {
    loadPage(appliedFilters, page, true);
  }, [appliedFilters, page, loadPage]);

  async function performRowAction(
    row: ReconciliationRecord,
    action: "mark_reconciled" | "flag_issue" | "lock_record"
  ) {
    try {
      setSubmittingAction(row.id);

      await apiFetch(`${baseEndpoint}${row.id}/${action}/`, {
        method: "POST",
      });

      const successMessage =
        action === "mark_reconciled"
          ? "Record marked as reconciled."
          : action === "flag_issue"
          ? "Record flagged for review."
          : "Record locked successfully.";

      setToast({ type: "success", message: successMessage });
      await loadPage(appliedFilters, page, true);
    } catch (err) {
      setToast({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to perform reconciliation action.",
      });
    } finally {
      setSubmittingAction(null);
    }
  }

  const pageSubtitle = useMemo(() => {
    return "Review payment-to-EMI mapping, detect mismatches, and complete daily reconciliation safely.";
  }, []);

  return (
    <PortalPage title="Payment Reconciliation" subtitle={pageSubtitle}>
      <div className="space-y-6">
        {toast && (
          <div
            className={cx(
              "rounded-xl border px-4 py-3 text-sm",
              toast.type === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
              toast.type === "error" && "border-red-500/30 bg-red-500/10 text-red-300",
              toast.type === "info" && "border-blue-500/30 bg-blue-500/10 text-blue-300"
            )}
          >
            {toast.message}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Summary */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Total Records"
            value={summary.total_records.toLocaleString("en-IN")}
            hint="Rows in current result set"
          />
          <SummaryCard
            title="Expected Amount"
            value={formatCurrency(summary.total_expected_amount)}
            hint="EMI value expected to reconcile"
          />
          <SummaryCard
            title="Paid Amount"
            value={formatCurrency(summary.total_paid_amount)}
            hint="Collected payment value"
          />
          <SummaryCard
            title="Matched Records"
            value={summary.matched_count.toLocaleString("en-IN")}
            hint="Fully reconciled entries"
          />
          <SummaryCard
            title="Mismatch Cases"
            value={summary.mismatch_count.toLocaleString("en-IN")}
            hint="Partial / overpaid / missing"
          />
          <SummaryCard
            title="Unlinked Payments"
            value={summary.unlinked_count.toLocaleString("en-IN")}
            hint="Payment exists without EMI link"
          />
          <SummaryCard
            title="Duplicate Cases"
            value={summary.duplicate_count.toLocaleString("en-IN")}
            hint="Potential double entry risk"
          />
          <SummaryCard
            title="Flagged / Locked"
            value={`${summary.flagged_count} / ${summary.locked_count}`}
            hint="Operational control markers"
          />
        </section>

        {/* Filters */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Filters</h2>
              <p className="text-sm text-white/60">
                Narrow down collections by period, method, batch, partner, or exception type.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={refresh}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10"
                disabled={refreshing}
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>

              <button
                type="button"
                onClick={exportCurrentRows}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10"
              >
                Export CSV
              </button>

              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10"
              >
                Reset
              </button>

              <button
                type="button"
                onClick={applyFilters}
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition hover:opacity-90"
              >
                Apply Filters
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Search">
              <input
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, search: e.target.value }))
                }
                placeholder="Customer / phone / subscription / reference"
                className={inputClassName}
              />
            </Field>

            <Field label="Status">
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, status: e.target.value }))
                }
                className={inputClassName}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Payment Method">
              <select
                value={filters.payment_method}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, payment_method: e.target.value }))
                }
                className={inputClassName}
              >
                {METHOD_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Batch">
              <select
                value={filters.batch_id}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, batch_id: e.target.value }))
                }
                className={inputClassName}
              >
                <option value="">All batches</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.batch_code}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Partner">
              <select
                value={filters.partner_id}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, partner_id: e.target.value }))
                }
                className={inputClassName}
              >
                <option value="">All partners</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.full_name?.trim() || partner.username}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Date From">
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, date_from: e.target.value }))
                }
                className={inputClassName}
              />
            </Field>

            <Field label="Date To">
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, date_to: e.target.value }))
                }
                className={inputClassName}
              />
            </Field>

            <Field label="Min Amount">
              <input
                type="number"
                min="0"
                step="0.01"
                value={filters.amount_min}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, amount_min: e.target.value }))
                }
                placeholder="0.00"
                className={inputClassName}
              />
            </Field>

            <Field label="Max Amount">
              <input
                type="number"
                min="0"
                step="0.01"
                value={filters.amount_max}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, amount_max: e.target.value }))
                }
                placeholder="0.00"
                className={inputClassName}
              />
            </Field>

            <Field label="Operational Flags">
              <div className="flex h-[42px] items-center gap-6 rounded-xl border border-white/10 bg-black/20 px-3">
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={filters.only_flagged}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        only_flagged: e.target.checked,
                      }))
                    }
                  />
                  Flagged only
                </label>

                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={filters.only_unlocked}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        only_unlocked: e.target.checked,
                      }))
                    }
                  />
                  Unlocked only
                </label>
              </div>
            </Field>
          </div>
        </section>

        {/* Status breakdown */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-white">Status Breakdown</h2>
            <p className="text-sm text-white/60">
              Quick anomaly visibility for daily finance operations.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.filter((item) => item.value).map((item) => (
              <span
                key={item.value}
                className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/80"
              >
                {item.label}: {statusBreakdown[item.value] ?? 0}
              </span>
            ))}
          </div>
        </section>

        {/* Table */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 md:px-5">
            <div>
              <h2 className="text-base font-semibold text-white">Reconciliation Queue</h2>
              <p className="text-sm text-white/60">
                Review records before locking the accounting trail.
              </p>
            </div>

            <div className="text-sm text-white/60">
              Page {page} of {totalPages}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1500px] w-full text-left">
              <thead className="bg-black/30 text-xs uppercase tracking-wide text-white/60">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Subscription</th>
                  <th className="px-4 py-3">Batch / Lucky</th>
                  <th className="px-4 py-3">EMI</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Outstanding</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Partner</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Controls</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-sm text-white/60">
                      Loading reconciliation data...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-sm text-white/60">
                      No reconciliation records found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  records.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-white/5 text-sm text-white/85 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 align-top">
                        <div>{formatDate(row.transaction_date)}</div>
                        <div className="mt-1 text-xs text-white/50">
                          Updated {formatDate(row.updated_at)}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-white">{row.customer_name}</div>
                        <div className="mt-1 text-xs text-white/60">{row.customer_phone}</div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="font-medium">{row.subscription_code}</div>
                        <div className="mt-1 text-xs text-white/60">
                          Ref: {row.payment_reference ?? "—"}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div>{row.batch_code ?? "—"}</div>
                        <div className="mt-1 text-xs text-white/60">
                          Lucky #{row.lucky_number ?? "—"}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div>Month {row.emi_month_no ?? "—"}</div>
                        <div className="mt-1 text-xs text-white/60">
                          Due {formatDate(row.due_date)}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">{formatCurrency(row.expected_amount)}</td>
                      <td className="px-4 py-3 align-top">{formatCurrency(row.paid_amount)}</td>
                      <td className="px-4 py-3 align-top">
                        <div>{formatCurrency(row.outstanding_amount)}</div>
                        {Number(row.excess_amount) > 0 && (
                          <div className="mt-1 text-xs text-amber-300">
                            Excess {formatCurrency(row.excess_amount)}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div>{row.payment_method}</div>
                        <div className="mt-1 text-xs text-white/60">
                          {row.collected_by ?? "—"}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">{row.partner_name ?? "—"}</td>

                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={row.status} />
                          {row.is_flagged && <MiniBadge label="Flagged" tone="warning" />}
                          {row.is_locked && <MiniBadge label="Locked" tone="neutral" />}
                        </div>
                        {row.issue_code && (
                          <div className="mt-1 text-xs text-white/50">{row.issue_code}</div>
                        )}
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedRecord(row)}
                            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/85 transition hover:bg-white/10"
                          >
                            View
                          </button>

                          {!row.is_locked && row.status !== "MATCHED" && (
                            <button
                              type="button"
                              onClick={() => performRowAction(row, "mark_reconciled")}
                              disabled={submittingAction === row.id}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-60"
                            >
                              {submittingAction === row.id ? "Working..." : "Mark Reconciled"}
                            </button>
                          )}

                          {!row.is_flagged && (
                            <button
                              type="button"
                              onClick={() => performRowAction(row, "flag_issue")}
                              disabled={submittingAction === row.id}
                              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60"
                            >
                              Flag
                            </button>
                          )}

                          {!row.is_locked && (
                            <button
                              type="button"
                              onClick={() => performRowAction(row, "lock_record")}
                              disabled={submittingAction === row.id}
                              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/85 transition hover:bg-white/10 disabled:opacity-60"
                            >
                              Lock
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
            <div className="text-sm text-white/60">
              Showing {records.length} row{records.length === 1 ? "" : "s"} on this page.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              <span className="px-2 text-sm text-white/70">
                {page} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        {/* Detail drawer */}
        {selectedRecord && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Reconciliation Detail — #{selectedRecord.id}
                </h2>
                <p className="text-sm text-white/60">
                  Full audit context for review before any finance lock action.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/85 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <DetailItem label="Customer" value={selectedRecord.customer_name} />
              <DetailItem label="Phone" value={selectedRecord.customer_phone} />
              <DetailItem label="Subscription" value={selectedRecord.subscription_code} />
              <DetailItem label="Batch" value={selectedRecord.batch_code ?? "—"} />
              <DetailItem
                label="Lucky Number"
                value={selectedRecord.lucky_number ?? "—"}
              />
              <DetailItem
                label="EMI Month"
                value={selectedRecord.emi_month_no ?? "—"}
              />
              <DetailItem label="Due Date" value={formatDate(selectedRecord.due_date)} />
              <DetailItem
                label="Payment Date"
                value={formatDate(selectedRecord.payment_date)}
              />
              <DetailItem
                label="Transaction Date"
                value={formatDate(selectedRecord.transaction_date)}
              />
              <DetailItem
                label="Expected Amount"
                value={formatCurrency(selectedRecord.expected_amount)}
              />
              <DetailItem
                label="Paid Amount"
                value={formatCurrency(selectedRecord.paid_amount)}
              />
              <DetailItem
                label="Outstanding Amount"
                value={formatCurrency(selectedRecord.outstanding_amount)}
              />
              <DetailItem
                label="Excess Amount"
                value={formatCurrency(selectedRecord.excess_amount)}
              />
              <DetailItem label="Method" value={selectedRecord.payment_method} />
              <DetailItem
                label="Payment Reference"
                value={selectedRecord.payment_reference ?? "—"}
              />
              <DetailItem label="Partner" value={selectedRecord.partner_name ?? "—"} />
              <DetailItem label="Collected By" value={selectedRecord.collected_by ?? "—"} />
              <DetailItem label="Status" value={selectedRecord.status} />
              <DetailItem
                label="Locked / Flagged"
                value={`${selectedRecord.is_locked ? "Yes" : "No"} / ${
                  selectedRecord.is_flagged ? "Yes" : "No"
                }`}
              />
              <DetailItem label="Issue Code" value={selectedRecord.issue_code ?? "—"} />
              <DetailItem
                label="Created At"
                value={formatDateTime(selectedRecord.created_at)}
              />
              <DetailItem
                label="Updated At"
                value={formatDateTime(selectedRecord.updated_at)}
              />
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 text-sm font-medium text-white">Operational Notes</div>
              <p className="text-sm leading-6 text-white/70">
                {selectedRecord.notes?.trim() || "No notes available for this record."}
              </p>
            </div>
          </section>
        )}
      </div>
    </PortalPage>
  );
}

/* =========================
   Small Components
========================= */

function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-sm text-white/60">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs text-white/45">{hint}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-white/80">{label}</div>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: ReconciliationStatus }) {
  const tone =
    status === "MATCHED"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : status === "PARTIAL" || status === "OVERPAID"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : status === "UNLINKED" || status === "MISSING_PAYMENT" || status === "DUPLICATE"
      ? "border-red-500/30 bg-red-500/10 text-red-300"
      : status === "FLAGGED"
      ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
      : status === "REVERSED"
      ? "border-white/15 bg-white/5 text-white/70"
      : "border-blue-500/30 bg-blue-500/10 text-blue-300";

  return (
    <span className={cx("rounded-full border px-2.5 py-1 text-xs font-medium", tone)}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function MiniBadge({
  label,
  tone,
}: {
  label: string;
  tone: "warning" | "neutral";
}) {
  const className =
    tone === "warning"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : "border-white/15 bg-white/5 text-white/70";

  return <span className={cx("rounded-full border px-2 py-1 text-xs", className)}>{label}</span>;
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-2 text-sm text-white/90">{value}</div>
    </div>
  );
}

/* =========================
   Styles
========================= */

const inputClassName =
  "h-[42px] w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-white/20";