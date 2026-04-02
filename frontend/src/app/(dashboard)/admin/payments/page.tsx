// frontend/src/app/(dashboard)/admin/payments/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Download,
  RefreshCw,
  Search,
  X,
  Filter,
  Calendar,
  CreditCard,
  Wallet,
  TrendingUp,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/status-badge";
import { WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import { downloadCsv } from "@/lib/export/csv";
import {
  getAdminPaymentRegister,
  type PaymentRegisterRow,
  type PaymentRegisterSummary,
} from "@/services/payments";

const EMPTY_SUMMARY: PaymentRegisterSummary = {
  visible_payments: 0,
  gross_amount: "0.00",
  active_payments: 0,
  active_amount: "0.00",
  reversed_payments: 0,
  reversed_amount: "0.00",
  net_collected_amount: "0.00",
};

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load payment register.";
}

function parseIdFilter(value: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

function PaymentsTable({ rows }: { rows: PaymentRegisterRow[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof PaymentRegisterRow>("payment_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (row) =>
        (row.customer_name?.toLowerCase() || "").includes(term) ||
        (row.customer_phone || "").includes(term) ||
        (row.subscription_number || "").toLowerCase().includes(term) ||
        (row.reference_no || "").toLowerCase().includes(term) ||
        row.id.toString().includes(term)
    );
  }, [rows, searchTerm]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (aVal == null) aVal = "";
      if (bVal == null) bVal = "";

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal === bVal) return 0;
      const direction = sortDirection === "asc" ? 1 : -1;
      return (aVal < bVal ? -1 : 1) * direction;
    });
  }, [filteredRows, sortField, sortDirection]);

  const handleSort = (field: keyof PaymentRegisterRow) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: keyof PaymentRegisterRow) => {
    if (field !== sortField) return null;
    return sortDirection === "asc" ? "↑" : "↓";
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No payment rows"
        description="No payment records match the current register filters."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex-1 sm:max-w-xs">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Quick table search (screen only)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Quick search changes only the on-screen table below. CSV export uses the main register filters above.
          </p>
        </div>
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="inline-flex items-center gap-1 pt-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left">
              <th
                onClick={() => handleSort("id")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Payment {getSortIcon("id")}
              </th>
              <th
                onClick={() => handleSort("customer_name")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Customer {getSortIcon("customer_name")}
              </th>
              <th
                onClick={() => handleSort("subscription_number")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Contract {getSortIcon("subscription_number")}
              </th>
              <th
                onClick={() => handleSort("method")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Method {getSortIcon("method")}
              </th>
              <th
                onClick={() => handleSort("amount")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right hover:text-foreground"
              >
                Amount {getSortIcon("amount")}
              </th>
              <th
                onClick={() => handleSort("is_reversed")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                State {getSortIcon("is_reversed")}
              </th>
              <th
                onClick={() => handleSort("payment_date")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Posted {getSortIcon("payment_date")}
              </th>
              <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-muted/30 transition">
                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  <div className="font-medium">#{row.id}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.reference_no || "No reference"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatDate(row.payment_date)}
                  </div>
                </td>

                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  <div className="font-medium">
                    {row.customer_name || "Unknown customer"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.customer_phone || "No phone"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Collected by {row.collected_by_username || "—"}
                  </div>
                </td>

                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  <div className="font-medium">
                    {row.subscription_number || "—"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.batch_code || "No batch"}
                    {typeof row.lucky_number === "number"
                      ? ` · Lucky #${row.lucky_number}`
                      : ""}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    EMI {row.emi ?? "—"}
                  </div>
                </td>

                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                    {row.method || "—"}
                  </span>
                </td>

                <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                  {money(row.amount)}
                </td>

                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  <StatusBadge
                    status={row.is_reversed ? "REVERSED" : "ACTIVE"}
                    label={row.is_reversed ? "Reversed" : "Active"}
                  />
                  <div className="mt-2 text-xs text-muted-foreground">
                    Verified by {row.verified_by_username || "—"}
                  </div>
                </td>

                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  {formatDate(row.payment_date)}
                </td>

                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  <div className="flex flex-col items-start gap-2">
                    <Link
                      href={`/admin/payments/${row.id}`}
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    >
                      View Payment
                    </Link>

                    {typeof row.subscription === "number" ? (
                      <Link
                        href={`/admin/subscriptions/${row.subscription}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Subscription
                      </Link>
                    ) : null}

                    <Link
                      href={
                        typeof row.subscription === "number"
                          ? `/admin/payments/reconciliation?payment=${row.id}&subscription=${row.subscription}`
                          : `/admin/payments/reconciliation?payment=${row.id}`
                      }
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    >
                      Reconciliation
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminPaymentsPage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParamKey = searchParams.toString();

  const initialQuery = (searchParams.get("q") || "").trim();
  const initialMethod = (searchParams.get("method") || "").trim().toUpperCase();
  const initialReversalState = (searchParams.get("reversal_state") || "").trim().toLowerCase();
  const initialDateFrom = (searchParams.get("date_from") || "").trim();
  const initialDateTo = (searchParams.get("date_to") || "").trim();
  const initialSubscriptionFilter = parseIdFilter(searchParams.get("subscription"));
  const initialCustomerFilter = parseIdFilter(searchParams.get("customer"));
  const initialBatchFilter = parseIdFilter(searchParams.get("batch"));
  const initialPartnerFilter = parseIdFilter(searchParams.get("partner"));
  const initialEmiFilter = parseIdFilter(searchParams.get("emi"));

  const [rows, setRows] = useState<PaymentRegisterRow[]>([]);
  const [summary, setSummary] = useState<PaymentRegisterSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState(initialQuery);
  const [methodInput, setMethodInput] = useState(initialMethod);
  const [reversalStateInput, setReversalStateInput] = useState(initialReversalState);
  const [dateFromInput, setDateFromInput] = useState(initialDateFrom);
  const [dateToInput, setDateToInput] = useState(initialDateTo);

  const [query, setQuery] = useState(initialQuery);
  const [method, setMethod] = useState(initialMethod);
  const [reversalState, setReversalState] = useState(initialReversalState);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [subscriptionFilter, setSubscriptionFilter] = useState(initialSubscriptionFilter);
  const [customerFilter, setCustomerFilter] = useState(initialCustomerFilter);
  const [batchFilter, setBatchFilter] = useState(initialBatchFilter);
  const [partnerFilter, setPartnerFilter] = useState(initialPartnerFilter);
  const [emiFilter, setEmiFilter] = useState(initialEmiFilter);

  const loadPayments = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await getAdminPaymentRegister({
          q: query,
          method,
          reversalState,
          dateFrom,
          dateTo,
          subscription: subscriptionFilter || undefined,
          customer: customerFilter || undefined,
          batch: batchFilter || undefined,
          partner: partnerFilter || undefined,
          emi: emiFilter || undefined,
        });

        setRows(payload.results);
        setSummary(payload.summary);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setRows([]);
          setSummary(EMPTY_SUMMARY);
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [query, method, reversalState, dateFrom, dateTo, subscriptionFilter, customerFilter, batchFilter, partnerFilter, emiFilter]
  );

  useEffect(() => {
    void loadPayments("initial");
  }, [loadPayments]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamKey);
    const nextQuery = (params.get("q") || "").trim();
    const nextMethod = (params.get("method") || "").trim().toUpperCase();
    const nextReversalState = (params.get("reversal_state") || "").trim().toLowerCase();
    const nextDateFrom = (params.get("date_from") || "").trim();
    const nextDateTo = (params.get("date_to") || "").trim();

    setSearchInput(nextQuery);
    setMethodInput(nextMethod);
    setReversalStateInput(nextReversalState);
    setDateFromInput(nextDateFrom);
    setDateToInput(nextDateTo);

    setQuery(nextQuery);
    setMethod(nextMethod);
    setReversalState(nextReversalState);
    setDateFrom(nextDateFrom);
    setDateTo(nextDateTo);
    setSubscriptionFilter(parseIdFilter(params.get("subscription")));
    setCustomerFilter(parseIdFilter(params.get("customer")));
    setBatchFilter(parseIdFilter(params.get("batch")));
    setPartnerFilter(parseIdFilter(params.get("partner")));
    setEmiFilter(parseIdFilter(params.get("emi")));
  }, [searchParamKey]);

  function replaceFiltersInUrl(params: URLSearchParams) {
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextQuery = searchInput.trim();

    setQuery(nextQuery);
    setMethod(methodInput);
    setReversalState(reversalStateInput);
    setDateFrom(dateFromInput);
    setDateTo(dateToInput);

    const params = new URLSearchParams();
    if (nextQuery) params.set("q", nextQuery);
    if (methodInput) params.set("method", methodInput);
    if (reversalStateInput) params.set("reversal_state", reversalStateInput);
    if (dateFromInput) params.set("date_from", dateFromInput);
    if (dateToInput) params.set("date_to", dateToInput);
    if (subscriptionFilter) params.set("subscription", subscriptionFilter);
    if (customerFilter) params.set("customer", customerFilter);
    if (batchFilter) params.set("batch", batchFilter);
    if (partnerFilter) params.set("partner", partnerFilter);
    if (emiFilter) params.set("emi", emiFilter);

    replaceFiltersInUrl(params);
  }

  function handleResetFilters() {
    setSearchInput("");
    setMethodInput("");
    setReversalStateInput("");
    setDateFromInput("");
    setDateToInput("");

    setQuery("");
    setMethod("");
    setReversalState("");
    setDateFrom("");
    setDateTo("");
    setSubscriptionFilter("");
    setCustomerFilter("");
    setBatchFilter("");
    setPartnerFilter("");
    setEmiFilter("");
    replaceFiltersInUrl(new URLSearchParams());
  }

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        customer_name: row.customer_name ?? "",
        customer_phone: row.customer_phone ?? "",
        subscription_number: row.subscription_number ?? "",
        batch_code: row.batch_code ?? "",
        lucky_number:
          typeof row.lucky_number === "number" ? String(row.lucky_number) : "",
        emi_id: row.emi ?? "",
        amount: row.amount,
        method: row.method ?? "",
        reference_no: row.reference_no ?? "",
        payment_date: row.payment_date ?? "",
        collected_by_username: row.collected_by_username ?? "",
        verified_by_username: row.verified_by_username ?? "",
        is_reversed: row.is_reversed ? "YES" : "NO",
      })),
    [rows]
  );

  const adminCollectionHref = useMemo(() => {
    const params = new URLSearchParams();
    if (subscriptionFilter) params.set("subscription", subscriptionFilter);
    if (emiFilter) params.set("emi", emiFilter);

    const queryString = params.toString();
    return queryString
      ? `/admin/payments/create?${queryString}`
      : "/admin/payments/create";
  }, [emiFilter, subscriptionFilter]);

  const activeRate = summary.visible_payments > 0
    ? ((summary.active_payments / summary.visible_payments) * 100).toFixed(1)
    : "0";

  return (
    <PortalPage
      title="Payments Register"
      subtitle="Operational payment register for admin review, verification, reversal visibility, and reconciliation handoff."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Payments" },
      ]}
      actions={[
        {
          href: adminCollectionHref,
          label: "Admin Collection",
          variant: "primary",
        },
        {
          href: "/admin/payments/reconciliation",
          label: "Payment Reconciliation",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Visible Payments",
          value: String(summary.visible_payments),
        },
        {
          label: "Net Collected",
          value: money(summary.net_collected_amount),
          tone: "success",
        },
        {
          label: "Active Payments",
          value: String(summary.active_payments),
        },
        {
          label: "Reversed Payments",
          value: String(summary.reversed_payments),
          tone: summary.reversed_payments > 0 ? "warning" : undefined,
        },
      ]}
      statusBadge={{
        label: "Payment Register",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Visible Payments"
            value={String(summary.visible_payments)}
            icon={<CreditCard className="h-4 w-4" />}
            tone="default"
          />
          <StatCard
            label="Net Collected"
            value={money(summary.net_collected_amount)}
            icon={<Wallet className="h-4 w-4" />}
            tone="success"
          />
          <StatCard
            label="Active Rate"
            value={`${activeRate}%`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            trend={Number(activeRate) > 80 ? "up" : "down"}
            trendValue={Number(activeRate) > 80 ? "Healthy" : "Needs review"}
            tone="default"
            subtext={`${summary.active_payments} active of ${summary.visible_payments} visible`}
          />
          <StatCard
            label="Reversed Amount"
            value={money(summary.reversed_amount)}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="warning"
            subtext={`${summary.reversed_payments} reversed payment row(s)`}
          />
        </div>

        <SectionCard
          title="Filter Register"
          description="Search by customer, phone, reference, payment id, subscription id, or batch context. Narrow by method, reversal state, and posting date."
        >
          <form
            onSubmit={handleApplyFilters}
            className="grid gap-4 lg:grid-cols-6"
          >
            <div className="lg:col-span-2">
              <label
                htmlFor="payments-q"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="payments-q"
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Customer, phone, reference, payment id"
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="payments-method"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Method
              </label>
              <select
                id="payments-method"
                value={methodInput}
                onChange={(event) => setMethodInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK">Bank</option>
                <option value="CARD">Card</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="payments-reversal"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Reversal State
              </label>
              <select
                id="payments-reversal"
                value={reversalStateInput}
                onChange={(event) => setReversalStateInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="reversed">Reversed</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="payments-date-from"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Date From
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="payments-date-from"
                  type="date"
                  value={dateFromInput}
                  onChange={(event) => setDateFromInput(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="payments-date-to"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Date To
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="payments-date-to"
                  type="date"
                  value={dateToInput}
                  onChange={(event) => setDateToInput(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2 lg:col-span-6">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              >
                <Filter className="h-4 w-4" />
                Apply Filters
              </button>

              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Reset Filters
              </button>

              <button
                type="button"
                onClick={() => void loadPayments("refresh")}
                disabled={refreshing || loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>

              <button
                type="button"
                disabled={exportRows.length === 0 || loading}
                onClick={() =>
                  downloadCsv(
                    "payments-register-filtered-rows.csv",
                    [
                      { key: "id", header: "id" },
                      { key: "customer_name", header: "customer_name" },
                      { key: "customer_phone", header: "customer_phone" },
                      { key: "subscription_number", header: "subscription_number" },
                      { key: "batch_code", header: "batch_code" },
                      { key: "lucky_number", header: "lucky_number" },
                      { key: "emi_id", header: "emi_id" },
                      { key: "amount", header: "amount" },
                      { key: "method", header: "method" },
                      { key: "reference_no", header: "reference_no" },
                      { key: "payment_date", header: "payment_date" },
                      { key: "collected_by_username", header: "collected_by_username" },
                      { key: "verified_by_username", header: "verified_by_username" },
                      { key: "is_reversed", header: "is_reversed" },
                    ],
                    exportRows
                  )
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                Export Filtered Register CSV
              </button>
            </div>
          </form>

          <p className="mt-3 text-xs text-muted-foreground">
            This CSV exports the payment rows returned by the main register filters above. The quick search inside the payment table is for on-screen review only and does not change the download.
          </p>

          {subscriptionFilter || customerFilter || batchFilter || partnerFilter || emiFilter ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Context Filters
              </span>
              {subscriptionFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Subscription #{subscriptionFilter}
                </span>
              ) : null}
              {customerFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Customer #{customerFilter}
                </span>
              ) : null}
              {batchFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Batch #{batchFilter}
                </span>
              ) : null}
              {partnerFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Partner #{partnerFilter}
                </span>
              ) : null}
              {emiFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  EMI #{emiFilter}
                </span>
              ) : null}
            </div>
          ) : null}
        </SectionCard>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-background px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Gross Amount
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {money(summary.gross_amount)}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Reversed Amount
            </div>
            <div className="mt-1 text-lg font-semibold text-amber-800">
              {money(summary.reversed_amount)}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Net Collected
            </div>
            <div className="mt-1 text-lg font-semibold text-emerald-800">
              {money(summary.net_collected_amount)}
            </div>
          </div>
        </div>

        {loading ? <LoadingBlock label="Loading payment register..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load payment register"
            description={error}
            onRetry={() => void loadPayments("initial")}
          />
        ) : null}

        {!loading && !error && (
          <SectionCard
            title="Payment Rows"
            description="Review payments, confirm reversal visibility, and hand off to payment detail, subscription detail, or payment-level reconciliation."
          >
            <PaymentsTable rows={rows} />
          </SectionCard>
        )}
      </div>
    </PortalPage>
  );
}
