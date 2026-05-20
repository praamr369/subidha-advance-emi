"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import Phase7Guidance from "@/components/admin/workflow/Phase7Guidance";
import PaginationControls from "@/components/ui/PaginationControls";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { CustomerIntelligenceTrigger } from "@/components/customer-intelligence/CustomerIntelligenceTrigger";
import { DataTableShell, DetailPanel, FormSection, WorkflowCard } from "@/components/ui/operations";
import { RegistryPageShell } from "@/components/layout/page-shells";
import { useWorkflowLauncher } from "@/components/workflows/WorkflowProvider";
import { apiFetch } from "@/lib/api";
import { downloadCsv } from "@/lib/export/csv";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

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

type SubscriptionListPayload = {
  count: number;
  results: SubscriptionRow[];
  page: number;
  page_size: number;
  num_pages: number;
  has_next: boolean;
  has_previous: boolean;
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

function normalizeSubscriptionListPayload(payload: unknown): SubscriptionListPayload {
  const root = (payload ?? {}) as Record<string, unknown>;
  return {
    count: toNumber(root.count),
    results: Array.isArray(root.results)
      ? (root.results as Record<string, unknown>[]).map(normalizeSubscriptionRow)
      : [],
    page: Math.max(toNumber(root.page) || 1, 1),
    page_size: Math.max(toNumber(root.page_size) || PAGE_SIZE, 1),
    num_pages: Math.max(toNumber(root.num_pages), 0),
    has_next: root.has_next === true,
    has_previous: root.has_previous === true,
  };
}

function SubscriptionWorkflowLanding() {
  return (
    <ERPPageShell
      title="Subscriptions"
      subtitle="Canonical contract workflow entry point for Advance EMI, rent, lease, and partner Advance EMI operations."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Subscriptions" },
      ]}
      actions={[
        { href: ROUTES.admin.subscriptionsAdvanceEmiCreate, label: "Create EMI", variant: "primary" },
        { href: ROUTES.admin.subscriptionsRentCreate, label: "Create Rent", variant: "secondary" },
        { href: ROUTES.admin.subscriptionsLeaseCreate, label: "Create Lease", variant: "secondary" },
        { href: ROUTES.admin.subscriptionRequests, label: "Subscription Requests", variant: "secondary" },
      ]}
      statusBadge={{ label: "Workflow Landing", tone: "info" }}
    >
      <div className="space-y-5">
        <Phase7Guidance
          items={[
            {
              label: "Create EMI",
              href: ROUTES.admin.subscriptionsAdvanceEmiCreate,
              note: "Start Lucky Plan contract creation with batch and Lucky ID checks.",
              warning: "Assign Lucky ID only inside the Advance EMI workflow.",
            },
            {
              label: "Collect first EMI",
              href: ROUTES.admin.financeCollect,
              note: "Post the first collection through the canonical finance collection route.",
              warning: "Payments remain backend-allocated and reconciliation-safe.",
            },
            {
              label: "Schedule delivery",
              href: ROUTES.admin.deliveryCreate,
              note: "Create delivery only after stock/source readiness is confirmed.",
              warning: "Stock unavailable deliveries stay blocked by delivery controls.",
            },
          ]}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <WorkflowCard
            title="Advance EMI"
            description="Lucky Plan EMI contracts, batches, lucky IDs, EMI register, payments, draws, winners, waivers, and delivery requests. Primary action: Create Advance EMI contract. Queue: Pending requests and overdue EMI appear in the sidebar badges. Recent activity: Use the register for current subscription rows and detail drill-down."
            action={
              <Link
                href={`${ROUTES.admin.subscriptions}?plan_type=EMI`}
                className="inline-flex text-sm font-semibold text-primary hover:underline"
              >
                Open subscription register →
              </Link>
            }
          />
          <WorkflowCard
            title="Rent"
            description="Rent contracts, monthly demands, rent payments, security deposits, possession, handover, and return inspections. Primary action: Create rent contract. Queue: Rent queues are contract, demand, payment, deposit, and return oriented. Recent activity: Rent does not expose Lucky ID or Lucky Draw workflows."
            action={
              <Link
                href={`${ROUTES.admin.subscriptions}?plan_type=RENT`}
                className="inline-flex text-sm font-semibold text-primary hover:underline"
              >
                Open subscription register →
              </Link>
            }
          />
          <WorkflowCard
            title="Lease"
            description="Lease contracts, monthly demands, lease payments, security deposits, possession, handover, and return inspections. Primary action: Create lease contract. Queue: Lease queues are contract, demand, payment, deposit, and return oriented. Recent activity: Lease does not expose Lucky ID or Lucky Draw workflows."
            action={
              <Link
                href={`${ROUTES.admin.subscriptions}?plan_type=LEASE`}
                className="inline-flex text-sm font-semibold text-primary hover:underline"
              >
                Open subscription register →
              </Link>
            }
          />
          <WorkflowCard
            title="Partner Operations"
            description="Partner register, partner customers, subscription requests, payment requests, collections, commissions, payouts, and performance. Primary action: Review partner payment requests. Queue: Partner payment and collection badges stay under this workflow. Recent activity: Partner operations remain tied to Advance EMI workflows."
            action={
              <Link
                href={ROUTES.admin.partnersWorkspace}
                className="inline-flex text-sm font-semibold text-primary hover:underline"
              >
                Open partner workspace →
              </Link>
            }
          />
        </div>
      </div>
    </ERPPageShell>
  );
}

export default function AdminSubscriptionsPage() {
  const { openWorkflow } = useWorkflowLauncher();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const currentSearchQuery = (searchParams.get("q") || "").trim();
  const currentStatusFilter = ((searchParams.get("status") || "").trim().toUpperCase() as "" | SubscriptionStatus);
  const currentPlanTypeFilter = (searchParams.get("plan_type") || "").trim();
  const currentCustomerFilter = parseIdFilter(searchParams.get("customer"));
  const currentProductFilter = parseIdFilter(searchParams.get("product"));
  const currentPartnerFilter = parseIdFilter(searchParams.get("partner"));
  const currentBatchFilter = parseIdFilter(searchParams.get("batch"));
  const currentPage = Math.max(Number(searchParams.get("page") || 1), 1);
  const isWorkflowLanding = searchParams.toString().trim().length === 0;

  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(currentPage);
  const [numPages, setNumPages] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState(currentSearchQuery);
  const [statusInput, setStatusInput] = useState<"" | SubscriptionStatus>(currentStatusFilter);
  const [planTypeInput, setPlanTypeInput] = useState(currentPlanTypeFilter);

  useEffect(() => {
    setSearchInput(currentSearchQuery);
    setStatusInput(currentStatusFilter);
    setPlanTypeInput(currentPlanTypeFilter);
    setPage(currentPage);
  }, [currentBatchFilter, currentCustomerFilter, currentPage, currentPartnerFilter, currentPlanTypeFilter, currentProductFilter, currentSearchQuery, currentStatusFilter]);

  function buildListPath(overrides?: Record<string, string>) {
    const params = new URLSearchParams();
    if (currentSearchQuery) params.set("q", currentSearchQuery);
    if (currentStatusFilter) params.set("status", currentStatusFilter);
    if (currentPlanTypeFilter) params.set("plan_type", currentPlanTypeFilter);
    if (currentCustomerFilter) params.set("customer", currentCustomerFilter);
    if (currentProductFilter) params.set("product", currentProductFilter);
    if (currentPartnerFilter) params.set("partner", currentPartnerFilter);
    if (currentBatchFilter) params.set("batch", currentBatchFilter);

    Object.entries(overrides || {}).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });

    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }

  const listQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (currentSearchQuery) params.set("q", currentSearchQuery);
    if (currentStatusFilter) params.set("status", currentStatusFilter);
    if (currentPlanTypeFilter) params.set("plan_type", currentPlanTypeFilter);
    if (currentCustomerFilter) params.set("customer", currentCustomerFilter);
    if (currentProductFilter) params.set("product", currentProductFilter);
    if (currentPartnerFilter) params.set("partner", currentPartnerFilter);
    if (currentBatchFilter) params.set("batch", currentBatchFilter);
    params.set("page", String(currentPage));
    params.set("page_size", String(PAGE_SIZE));
    return params.toString();
  }, [
    currentBatchFilter,
    currentCustomerFilter,
    currentPage,
    currentPartnerFilter,
    currentPlanTypeFilter,
    currentProductFilter,
    currentSearchQuery,
    currentStatusFilter,
  ]);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (isWorkflowLanding) {
      setLoading(false);
      return;
    }
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await apiFetch<unknown>(`/admin/subscriptions/?${listQueryString}`);
      const normalized = normalizeSubscriptionListPayload(payload);

      setRows(normalized.results);
      setCount(normalized.count);
      setPage(normalized.page);
      setNumPages(normalized.num_pages);
      setHasNext(normalized.has_next);
      setHasPrevious(normalized.has_previous);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setRows([]);
        setCount(0);
        setNumPages(0);
        setHasNext(false);
        setHasPrevious(false);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [isWorkflowLanding, listQueryString]);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const next = new URLSearchParams();
    const nextSearch = searchInput.trim();
    const nextPlanType = planTypeInput.trim();

    if (nextSearch) next.set("q", nextSearch);
    if (statusInput) next.set("status", statusInput);
    if (nextPlanType) next.set("plan_type", nextPlanType);
    if (currentCustomerFilter) next.set("customer", currentCustomerFilter);
    if (currentProductFilter) next.set("product", currentProductFilter);
    if (currentPartnerFilter) next.set("partner", currentPartnerFilter);
    if (currentBatchFilter) next.set("batch", currentBatchFilter);

    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function handleResetFilters() {
    setSearchInput("");
    setStatusInput("");
    setPlanTypeInput("");
    const params = new URLSearchParams();
    if (currentCustomerFilter) params.set("customer", currentCustomerFilter);
    if (currentProductFilter) params.set("product", currentProductFilter);
    if (currentPartnerFilter) params.set("partner", currentPartnerFilter);
    if (currentBatchFilter) params.set("batch", currentBatchFilter);
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function replacePage(targetPage: number) {
    router.replace(buildListPath(targetPage > 1 ? { page: String(targetPage) } : { page: "" }));
  }

  const pageActiveCount = useMemo(
    () => rows.filter((row) => row.status === "ACTIVE").length,
    [rows]
  );

  const pageWonCount = useMemo(
    () => rows.filter((row) => row.status === "WON").length,
    [rows]
  );

  const pageContractValue = useMemo(
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
    if (currentCustomerFilter) params.set("customer", currentCustomerFilter);
    if (currentProductFilter) params.set("product", currentProductFilter);
    if (currentPartnerFilter) params.set("partner", currentPartnerFilter);
    if (currentBatchFilter) params.set("batch", currentBatchFilter);

    const queryString = params.toString();
    return queryString
      ? `/admin/subscriptions/advance-emi/create?${queryString}`
      : "/admin/subscriptions/advance-emi/create";
  }, [currentBatchFilter, currentCustomerFilter, currentPartnerFilter, currentProductFilter]);

  if (isWorkflowLanding) {
    return <SubscriptionWorkflowLanding />;
  }

  return (
    <ERPPageShell
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
      statusBadge={{
        label: "Contract Operations",
        tone: "info",
      }}
    >
      <RegistryPageShell
        summary={
          !loading && !error ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:text-sm">
              <span className="font-semibold text-foreground">Filtered register</span>
              {": "}
              {count} matching · This page: {pageActiveCount} active, {pageWonCount} won · Page contract total{" "}
              <span className="tabular-nums text-foreground">{money(pageContractValue)}</span>
            </div>
          ) : null
        }
        filters={
          <>
        <nav aria-label="Subscription lifecycle" className="flex flex-wrap gap-2">
          {(
            [
              { label: "All", status: "" as const },
              { label: "Active", status: "ACTIVE" as const },
              { label: "Pending", status: "PENDING" as const },
              { label: "Won", status: "WON" as const },
              { label: "Completed", status: "COMPLETED" as const },
              { label: "Defaulted", status: "DEFAULTED" as const },
              { label: "Cancelled / history", status: "CANCELLED" as const },
            ] as const
          ).map((tab) => {
            const active =
              tab.status === "" ? !currentStatusFilter : currentStatusFilter === tab.status;
            return (
              <Link
                key={tab.label}
                href={buildListPath({
                  ...(tab.status ? { status: tab.status } : { status: "" }),
                  page: "",
                })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <FormSection
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

          {currentCustomerFilter || currentProductFilter || currentPartnerFilter || currentBatchFilter ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Context Filters
              </span>
              {currentCustomerFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Customer #{currentCustomerFilter}
                </span>
              ) : null}
              {currentProductFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Product #{currentProductFilter}
                </span>
              ) : null}
              {currentPartnerFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Partner #{currentPartnerFilter}
                </span>
              ) : null}
              {currentBatchFilter ? (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Batch #{currentBatchFilter}
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
                  `subscription-register-page-${page}.csv`,
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
              Export Current Page CSV
            </button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            This export includes only the rows visible on the current page. Use the matching count and page controls below to move through the filtered register, then export another page if needed.
          </p>
        </FormSection>
          </>
        }
        register={
          <>
        {loading ? <ERPLoadingState label="Loading subscription register..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load subscription register"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <DetailPanel
              title="Subscription rows"
              description="Review contract context and route into detail, customer, or payment operations."
            >
              {count === 0 ? (
                <ERPEmptyState
                  title="No subscriptions"
                  description="No subscriptions match the current filter set."
                />
              ) : rows.length === 0 ? (
                <ERPEmptyState
                  title="No rows on this page"
                  description="The current page has no results. Move to a previous page or change the filters."
                />
              ) : (
                <DataTableShell>
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
                              Tenure {typeof row.tenure_months === "number" ? `${row.tenure_months} months` : "—"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              <CustomerIntelligenceTrigger
                                customerId={row.customer_id}
                                customerName={row.customer_name || "Unknown customer"}
                                scope="admin"
                              />
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
                              {typeof row.lucky_number === "number" ? ` · Lucky #${row.lucky_number}` : ""}
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
                            <ERPStatusBadge status={row.status} hideIcon />
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="flex flex-col items-start gap-2">
                              <Link
                                href={`/admin/subscriptions/${row.id}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Open Subscription
                              </Link>

                              <button
                                type="button"
                                onClick={() =>
                                  openWorkflow("admin.collectPayment", {
                                    query: { subscription: row.id },
                                  })
                                }
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Quick Collect
                              </button>

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

                              <Link
                                href={`/admin/deliveries?subscription=${row.id}&portfolio=${
                                  String(row.plan_type || "").toUpperCase() === "RENT"
                                    ? "RENT"
                                    : String(row.plan_type || "").toUpperCase() === "LEASE"
                                      ? "LEASE"
                                      : "ADVANCE_EMI"
                                }`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Create Delivery
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                </DataTableShell>
              )}

              {count > 0 ? (
                <PaginationControls
                  count={count}
                  page={page}
                  pageSize={PAGE_SIZE}
                  numPages={numPages}
                  hasNext={hasNext}
                  hasPrevious={hasPrevious}
                  disabled={loading || refreshing}
                  onPrevious={() => replacePage(Math.max(page - 1, 1))}
                  onNext={() => replacePage(page + 1)}
                />
              ) : null}
            </DetailPanel>
          </>
        ) : null}
          </>
        }
      />
    </ERPPageShell>
  );
}
