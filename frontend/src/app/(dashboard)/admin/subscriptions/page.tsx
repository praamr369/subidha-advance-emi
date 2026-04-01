"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch, toArray } from "@/lib/api";
import { downloadCsv } from "@/lib/export/csv";

type SubscriptionStatus =
  | "ACTIVE"
  | "PENDING"
  | "WON"
  | "COMPLETED"
  | "CANCELLED"
  | "DEFAULTED"
  | "UNKNOWN";

type SubscriptionRow = {
  id: number;
  subscription_number: string;
  customer_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  product_id?: number | null;
  product_name?: string;
  product_code?: string | null;
  batch_id?: number | null;
  batch_code?: string | null;
  lucky_id?: number | null;
  lucky_number?: number | null;
  partner_id?: number | null;
  partner_name?: string;
  plan_type?: string;
  tenure_months?: number | null;
  start_date?: string | null;
  total_amount: string;
  monthly_amount: string;
  status: SubscriptionStatus;
};

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null | undefined {
  if (typeof value === "number") return value;
  if (value === null) return null;
  return undefined;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null | undefined {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
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
  return "Failed to load subscription register.";
}

function parseIdFilter(value: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

function normalizeStatus(raw: Record<string, unknown>): SubscriptionStatus {
  const status = String(raw.status ?? raw.subscription_status ?? "UNKNOWN").toUpperCase();

  if (status === "ACTIVE") return "ACTIVE";
  if (status === "PENDING") return "PENDING";
  if (status === "WON") return "WON";
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "DEFAULTED") return "DEFAULTED";
  return "UNKNOWN";
}

function normalizeSubscriptionRow(raw: Record<string, unknown>): SubscriptionRow {
  const id = toNumber(raw.id);
  const customerId =
    toNullableNumber(raw.customer_id) ?? toNullableNumber(raw.customer) ?? null;
  const productId =
    toNullableNumber(raw.product_id) ?? toNullableNumber(raw.product) ?? null;
  const batchId =
    toNullableNumber(raw.batch_id) ?? toNullableNumber(raw.batch) ?? null;
  const luckyId =
    toNullableNumber(raw.lucky_id) ?? toNullableNumber(raw.lucky) ?? null;
  const partnerId =
    toNullableNumber(raw.partner_id) ?? toNullableNumber(raw.partner) ?? null;
  const luckyNumber =
    toNullableNumber(raw.lucky_number) ?? toNullableNumber(raw.lucky_no) ?? null;

  const subscriptionNumber =
    toStringValue(raw.subscription_number) ||
    toStringValue(raw.subscription_code) ||
    `SUB-${id}`;

  return {
    id,
    subscription_number: subscriptionNumber,
    customer_id: customerId,
    customer_name:
      toStringValue(raw.customer_name) ||
      toStringValue(raw.customer_display_name) ||
      undefined,
    customer_phone:
      toStringValue(raw.customer_phone) ||
      toStringValue(raw.phone) ||
      undefined,
    product_id: productId,
    product_name:
      toStringValue(raw.product_name) ||
      toStringValue(raw.product_title) ||
      undefined,
    product_code:
      toNullableString(raw.product_code) ??
      toNullableString(raw.code),
    batch_id: batchId,
    batch_code:
      toNullableString(raw.batch_code) ??
      toNullableString(raw.batch_number),
    lucky_id: luckyId,
    lucky_number: luckyNumber,
    partner_id: partnerId,
    partner_name:
      toStringValue(raw.partner_name) ||
      toStringValue(raw.partner_username) ||
      undefined,
    plan_type:
      toStringValue(raw.plan_type) ||
      toStringValue(raw.subscription_type) ||
      undefined,
    tenure_months:
      toNullableNumber(raw.tenure_months) ??
      toNullableNumber(raw.tenure) ??
      null,
    start_date:
      toNullableString(raw.start_date) ??
      toNullableString(raw.created_date) ??
      undefined,
    total_amount: toMoneyString(raw.total_amount ?? raw.contract_value ?? raw.amount),
    monthly_amount: toMoneyString(raw.monthly_amount ?? raw.emi_amount ?? raw.installment_amount),
    status: normalizeStatus(raw),
  };
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function statusBadgeClass(status: SubscriptionStatus): string {
  switch (status) {
    case "ACTIVE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "PENDING":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "WON":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "COMPLETED":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "CANCELLED":
    case "DEFAULTED":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

export default function AdminSubscriptionsPage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParamKey = searchParams.toString();

  const initialSearchQuery = (searchParams.get("q") || "").trim();
  const initialStatusFilter = ((searchParams.get("status") || "").trim().toUpperCase() as "" | SubscriptionStatus);
  const initialPlanTypeFilter = (searchParams.get("plan_type") || "").trim();
  const initialCustomerFilter = parseIdFilter(searchParams.get("customer"));
  const initialProductFilter = parseIdFilter(searchParams.get("product"));
  const initialPartnerFilter = parseIdFilter(searchParams.get("partner"));
  const initialBatchFilter = parseIdFilter(searchParams.get("batch"));

  const [allRows, setAllRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState(initialSearchQuery);
  const [statusInput, setStatusInput] = useState<"" | SubscriptionStatus>(initialStatusFilter);
  const [planTypeInput, setPlanTypeInput] = useState(initialPlanTypeFilter);

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery.toLowerCase());
  const [statusFilter, setStatusFilter] = useState<"" | SubscriptionStatus>(initialStatusFilter);
  const [planTypeFilter, setPlanTypeFilter] = useState(initialPlanTypeFilter.toLowerCase());
  const [customerFilter, setCustomerFilter] = useState(initialCustomerFilter);
  const [productFilter, setProductFilter] = useState(initialProductFilter);
  const [partnerFilter, setPartnerFilter] = useState(initialPartnerFilter);
  const [batchFilter, setBatchFilter] = useState(initialBatchFilter);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await apiFetch<unknown>("/admin/subscriptions/");
      const normalized = toArray<Record<string, unknown>>(payload).map(
        normalizeSubscriptionRow
      );

      setAllRows(normalized);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") setAllRows([]);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParamKey);
    const nextSearch = (params.get("q") || "").trim();
    const nextStatus = ((params.get("status") || "").trim().toUpperCase() as "" | SubscriptionStatus);
    const nextPlanType = (params.get("plan_type") || "").trim();

    setSearchInput(nextSearch);
    setStatusInput(nextStatus);
    setPlanTypeInput(nextPlanType);

    setSearchQuery(nextSearch.toLowerCase());
    setStatusFilter(nextStatus);
    setPlanTypeFilter(nextPlanType.toLowerCase());
    setCustomerFilter(parseIdFilter(params.get("customer")));
    setProductFilter(parseIdFilter(params.get("product")));
    setPartnerFilter(parseIdFilter(params.get("partner")));
    setBatchFilter(parseIdFilter(params.get("batch")));
  }, [searchParamKey]);

  function replaceFiltersInUrl(params: URLSearchParams) {
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextSearch = searchInput.trim();
    const nextPlanType = planTypeInput.trim();

    setSearchQuery(nextSearch.toLowerCase());
    setStatusFilter(statusInput);
    setPlanTypeFilter(nextPlanType.toLowerCase());

    const params = new URLSearchParams();
    if (nextSearch) params.set("q", nextSearch);
    if (statusInput) params.set("status", statusInput);
    if (nextPlanType) params.set("plan_type", nextPlanType);
    if (customerFilter) params.set("customer", customerFilter);
    if (productFilter) params.set("product", productFilter);
    if (partnerFilter) params.set("partner", partnerFilter);
    if (batchFilter) params.set("batch", batchFilter);

    replaceFiltersInUrl(params);
  }

  function handleResetFilters() {
    setSearchInput("");
    setStatusInput("");
    setPlanTypeInput("");
    setSearchQuery("");
    setStatusFilter("");
    setPlanTypeFilter("");
    setCustomerFilter("");
    setProductFilter("");
    setPartnerFilter("");
    setBatchFilter("");
    replaceFiltersInUrl(new URLSearchParams());
  }

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      const matchesStatus = statusFilter ? row.status === statusFilter : true;
      if (!matchesStatus) return false;

      const matchesPlanType = planTypeFilter
        ? String(row.plan_type ?? "").toLowerCase().includes(planTypeFilter)
        : true;
      if (!matchesPlanType) return false;

      if (customerFilter && String(row.customer_id ?? "") !== customerFilter) {
        return false;
      }

      if (productFilter && String(row.product_id ?? "") !== productFilter) {
        return false;
      }

      if (partnerFilter && String(row.partner_id ?? "") !== partnerFilter) {
        return false;
      }

      if (batchFilter && String(row.batch_id ?? "") !== batchFilter) {
        return false;
      }

      if (!searchQuery) return true;

      const haystack = [
        row.id,
        row.subscription_number,
        row.customer_name,
        row.customer_phone,
        row.product_name,
        row.product_code,
        row.batch_code,
        row.lucky_number,
        row.partner_name,
        row.plan_type,
        row.status,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return haystack.includes(searchQuery);
    });
  }, [
    allRows,
    batchFilter,
    customerFilter,
    partnerFilter,
    planTypeFilter,
    productFilter,
    searchQuery,
    statusFilter,
  ]);

  const activeCount = useMemo(
    () => rows.filter((row) => row.status === "ACTIVE").length,
    [rows]
  );

  const wonCount = useMemo(
    () => rows.filter((row) => row.status === "WON").length,
    [rows]
  );

  const completedCount = useMemo(
    () => rows.filter((row) => row.status === "COMPLETED").length,
    [rows]
  );

  const visibleContractValue = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
    [rows]
  );

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        subscription_number: row.subscription_number,
        customer_name: row.customer_name ?? "",
        customer_phone: row.customer_phone ?? "",
        product_name: row.product_name ?? "",
        product_code: row.product_code ?? "",
        batch_code: row.batch_code ?? "",
        lucky_number:
          typeof row.lucky_number === "number" ? String(row.lucky_number) : "",
        partner_name: row.partner_name ?? "",
        plan_type: row.plan_type ?? "",
        tenure_months:
          typeof row.tenure_months === "number" ? String(row.tenure_months) : "",
        start_date: row.start_date ?? "",
        total_amount: row.total_amount,
        monthly_amount: row.monthly_amount,
        status: row.status,
      })),
    [rows]
  );

  const createSubscriptionHref = useMemo(() => {
    const params = new URLSearchParams();
    if (customerFilter) params.set("customer", customerFilter);
    if (productFilter) params.set("product", productFilter);
    if (partnerFilter) params.set("partner", partnerFilter);
    if (batchFilter) params.set("batch", batchFilter);

    const queryString = params.toString();
    return queryString
      ? `/admin/subscriptions/create?${queryString}`
      : "/admin/subscriptions/create";
  }, [batchFilter, customerFilter, partnerFilter, productFilter]);

  return (
    <PortalPage
      title="Subscription Register"
      subtitle="Operational contract register for customer subscriptions, EMI plan visibility, and downstream handoff into detail, payments, and customer workflows."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Subscriptions" },
      ]}
      actions={[
        {
          href: createSubscriptionHref,
          label: "Create Subscription",
          variant: "primary",
        },
        {
          href: "/admin/customers",
          label: "Open Customers",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Visible Subscriptions",
          value: String(rows.length),
        },
        {
          label: "Active",
          value: String(activeCount),
          tone: activeCount > 0 ? "success" : undefined,
        },
        {
          label: "Won",
          value: String(wonCount),
          tone: wonCount > 0 ? "info" : undefined,
        },
        {
          label: "Visible Contract Value",
          value: money(visibleContractValue),
          tone: "success",
        },
      ]}
      statusBadge={{
        label: "Contract Operations",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <SectionCard
          title="Filter register"
          description="Search by subscription, customer, phone, product, batch, lucky number, partner, or plan type."
        >
          <form onSubmit={handleApplyFilters} className="grid gap-4 lg:grid-cols-6">
            <div className="lg:col-span-3">
              <label
                htmlFor="subscription-search"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Search
              </label>
              <input
                id="subscription-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Subscription, customer, phone, product, batch"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div>
              <label
                htmlFor="subscription-status"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Status
              </label>
              <select
                id="subscription-status"
                value={statusInput}
                onChange={(event) =>
                  setStatusInput(event.target.value as "" | SubscriptionStatus)
                }
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All</option>
                <option value="ACTIVE">Active</option>
                <option value="PENDING">Pending</option>
                <option value="WON">Won</option>
                <option value="COMPLETED">Completed</option>
                <option value="DEFAULTED">Defaulted</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="subscription-plan-type"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Plan Type
              </label>
              <input
                id="subscription-plan-type"
                type="text"
                value={planTypeInput}
                onChange={(event) => setPlanTypeInput(event.target.value)}
                placeholder="EMI, lucky, etc."
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <button
        type="submit"
        className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
      >
                Apply
              </button>

              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Reset
              </button>
            </div>
          </form>

          {customerFilter || productFilter || partnerFilter || batchFilter ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Context Filters
              </span>
              {customerFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Customer #{customerFilter}
                </span>
              ) : null}
              {productFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Product #{productFilter}
                </span>
              ) : null}
              {partnerFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Partner #{partnerFilter}
                </span>
              ) : null}
              {batchFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Batch #{batchFilter}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              disabled={exportRows.length === 0 || loading}
              onClick={() =>
                downloadCsv(
                  "subscription-register-current-view.csv",
                  [
                    { key: "id", header: "id" },
                    { key: "subscription_number", header: "subscription_number" },
                    { key: "customer_name", header: "customer_name" },
                    { key: "customer_phone", header: "customer_phone" },
                    { key: "product_name", header: "product_name" },
                    { key: "product_code", header: "product_code" },
                    { key: "batch_code", header: "batch_code" },
                    { key: "lucky_number", header: "lucky_number" },
                    { key: "partner_name", header: "partner_name" },
                    { key: "plan_type", header: "plan_type" },
                    { key: "tenure_months", header: "tenure_months" },
                    { key: "start_date", header: "start_date" },
                    { key: "total_amount", header: "total_amount" },
                    { key: "monthly_amount", header: "monthly_amount" },
                    { key: "status", header: "status" },
                  ],
                  exportRows
                )
              }
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export Current View
            </button>
          </div>
        </SectionCard>

        {loading ? <LoadingBlock label="Loading subscription register..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load subscription register"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <SectionCard
              title="Operational note"
              description="Use this register for contract-level visibility. Open subscription detail for lifecycle, EMI schedule, payment history, and audit context."
            >
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Active
                  </div>
                  <div className="mt-2 text-xl font-semibold text-foreground">
                    {String(activeCount)}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Contracts currently running under active collection lifecycle.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Won
                  </div>
                  <div className="mt-2 text-xl font-semibold text-foreground">
                    {String(wonCount)}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Winner subscriptions still requiring contract visibility and audit trace.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Completed
                  </div>
                  <div className="mt-2 text-xl font-semibold text-foreground">
                    {String(completedCount)}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Completed contracts retained for history, audit, and financial traceability.
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Subscription rows"
              description="Review contract context and route into detail, customer, or payment operations."
            >
              {rows.length === 0 ? (
                <EmptyState
                  title="No subscriptions"
                  description="No subscriptions match the current filter set."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Subscription
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Customer
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Product / Plan
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Financials
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Status
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="align-top">
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">{row.subscription_number}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Start {formatDate(row.start_date)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Tenure{" "}
                              {typeof row.tenure_months === "number"
                                ? `${row.tenure_months} months`
                                : "—"}
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
                              {row.partner_name ? `Partner ${row.partner_name}` : "No partner"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.product_name || "Unknown product"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.product_code || "No product code"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.batch_code || "No batch"}
                              {typeof row.lucky_number === "number"
                                ? ` · Lucky #${row.lucky_number}`
                                : ""}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.plan_type || "No plan type"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            <div className="font-semibold">
                              {money(row.total_amount)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              EMI {money(row.monthly_amount)}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <span
                              className={[
                                "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                                statusBadgeClass(row.status),
                              ].join(" ")}
                            >
                              {row.status}
                            </span>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="flex flex-col items-start gap-2">
                              <Link
                                href={`/admin/subscriptions/${row.id}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Open Subscription
                              </Link>

                              {typeof row.customer_id === "number" ? (
                                <Link
                                  href={`/admin/customers/${row.customer_id}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Customer
                                </Link>
                              ) : null}

                              <Link
                                href={`/admin/payments?subscription=${row.id}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Payments Register
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
