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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { RegistryPageShell } from "@/components/layout/page-shells";
import { InfoIcon, CalendarClock, CheckCircle2, AlertCircle } from "lucide-react";
import { useWorkflowLauncher } from "@/components/workflows/WorkflowProvider";
import { apiFetch } from "@/lib/api";
import { downloadCsv } from "@/lib/export/csv";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
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
  partner_phone?: string;
  plan_type?: string;
  tenure_months?: number | null;
  start_date?: string | null;
  total_amount: string;
  monthly_amount: string;
  status: SubscriptionStatus;
  financial_summary?: {
    emi_total: string;
    paid_amount: string;
    waived_amount: string;
    pending_amount: string;
    outstanding_amount: string;
  };
  deposit_status?: string;
  emi_count?: number;
  paid_emi_count?: number;
  pending_emi_count?: number;
  waived_emi_count?: number;
  overdue_emi_count?: number;
  total_paid_amount?: string;
  outstanding_amount?: string;
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

type SubscriptionKpis = {
  total_subscriptions: number;
  active_subscriptions: number;
  won_subscriptions: number;
  completed_subscriptions: number;
  defaulted_subscriptions: number;
  emi_count: number;
  rent_count: number;
  lease_count: number;
  total_contract_value: string;
  total_monthly_value: string;
  total_waived_value: string;
  pending_emis: number;
  overdue_emis: number;
  today_collection: string;
  total_outstanding: string;
};

type BatchBreakdownRow = {
  batch_id: number | null;
  batch_code: string | null;
  subscriber_count: number;
  contract_value: string;
  monthly_value: string;
  collected_value: string;
  waived_value: string;
  outstanding_value: string;
};

type BatchBreakdownPayload = {
  count: number;
  batch_count: number;
  results: BatchBreakdownRow[];
};

function normalizeKpis(payload: unknown): SubscriptionKpis {
  const raw = (payload ?? {}) as Record<string, unknown>;
  return {
    total_subscriptions: toNumber(raw.total_subscriptions),
    active_subscriptions: toNumber(raw.active_subscriptions),
    won_subscriptions: toNumber(raw.won_subscriptions),
    completed_subscriptions: toNumber(raw.completed_subscriptions),
    defaulted_subscriptions: toNumber(raw.defaulted_subscriptions),
    emi_count: toNumber(raw.emi_count),
    rent_count: toNumber(raw.rent_count),
    lease_count: toNumber(raw.lease_count),
    total_contract_value: toMoneyString(raw.total_contract_value),
    total_monthly_value: toMoneyString(raw.total_monthly_value),
    total_waived_value: toMoneyString(raw.total_waived_value),
    pending_emis: toNumber(raw.pending_emis),
    overdue_emis: toNumber(raw.overdue_emis),
    today_collection: toMoneyString(raw.today_collection),
    total_outstanding: toMoneyString(raw.total_outstanding),
  };
}

function normalizeBatchBreakdown(payload: unknown): BatchBreakdownPayload {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const results = Array.isArray(raw.results)
    ? (raw.results as Record<string, unknown>[]).map((row) => ({
        batch_id: toNullableNumber(row.batch_id) ?? null,
        batch_code: toNullableString(row.batch_code) ?? null,
        subscriber_count: toNumber(row.subscriber_count),
        contract_value: toMoneyString(row.contract_value),
        monthly_value: toMoneyString(row.monthly_value),
        collected_value: toMoneyString(row.collected_value),
        waived_value: toMoneyString(row.waived_value),
        outstanding_value: toMoneyString(row.outstanding_value),
      }))
    : [];
  return {
    count: toNumber(raw.count) || results.length,
    batch_count: toNumber(raw.batch_count),
    results,
  };
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
    partner_phone:
      toStringValue(raw.partner_phone) ||
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
    financial_summary: raw.financial_summary ? {
      emi_total: toMoneyString((raw.financial_summary as any).emi_total),
      paid_amount: toMoneyString((raw.financial_summary as any).paid_amount),
      waived_amount: toMoneyString((raw.financial_summary as any).waived_amount),
      pending_amount: toMoneyString((raw.financial_summary as any).pending_amount),
      outstanding_amount: toMoneyString((raw.financial_summary as any).outstanding_amount),
    } : undefined,
    emi_count: toNumber(raw.emi_count),
    paid_emi_count: toNumber(raw.paid_emi_count),
    pending_emi_count: toNumber(raw.pending_emi_count),
    waived_emi_count: toNumber(raw.waived_emi_count),
    overdue_emi_count: toNumber(raw.overdue_emi_count),
    total_paid_amount: toNullableString(raw.total_paid_amount) ?? undefined,
    outstanding_amount: toNullableString(raw.outstanding_amount) ?? undefined,
  };
}

function normalizeSubscriptionListPayload(
  payload: unknown,
  requestedPage = 1,
): SubscriptionListPayload {
  // Accepts both response shapes:
  //  - DRF PageNumberPagination: { count, next, previous, results }
  //  - build_paginated_payload:  { count, page, num_pages, has_next, has_previous, results }
  //  - bare array (legacy / unpaginated fallback)
  const root = Array.isArray(payload)
    ? ({ results: payload, count: payload.length } as Record<string, unknown>)
    : ((payload ?? {}) as Record<string, unknown>);

  const results = Array.isArray(root.results)
    ? (root.results as Record<string, unknown>[]).map(normalizeSubscriptionRow)
    : [];
  const count = toNumber(root.count) || results.length;
  const pageSize = Math.max(toNumber(root.page_size) || PAGE_SIZE, 1);
  const page = Math.max(toNumber(root.page) || requestedPage || 1, 1);
  const numPages =
    Math.max(toNumber(root.num_pages), 0) ||
    (count > 0 ? Math.ceil(count / pageSize) : 0);
  // Prefer explicit booleans; otherwise derive from DRF next/previous URLs,
  // and finally fall back to page arithmetic.
  const hasNext =
    root.has_next === true || Boolean(root.next) || page < numPages;
  const hasPrevious =
    root.has_previous === true || Boolean(root.previous) || page > 1;

  return {
    count,
    results,
    page,
    page_size: pageSize,
    num_pages: numPages,
    has_next: hasNext,
    has_previous: hasPrevious,
  };
}

function SubscriptionWorkflowLanding() {
  return (
    <ERPPageShell
      eyebrow="Sales & Contracts"
      title="Subscriptions"
      subtitle="Contract source workflow — Advance EMI, Rent, and Lease contracts. Each plan type has distinct context, Lucky Plan assignment rules, and downstream module ownership."
      helperNote="Contract creation lives here. Payment and receipt collection belongs to Collections & Cashier. Accounting bridge and reconciliation belong to Accounting & Reconciliation. Delivery and handover belong to Delivery & Service. Winner waiver (Advance EMI only) applies to future EMI instalments only — past collected EMIs are not reversed."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Subscriptions" },
      ]}
      actions={[
        { href: ROUTES.admin.subscriptionsAdvanceEmiCreate, label: "Create Advance EMI", variant: "primary" },
        { href: ROUTES.admin.subscriptionsRentCreate, label: "Create Rent", variant: "secondary" },
        { href: ROUTES.admin.subscriptionsLeaseCreate, label: "Create Lease", variant: "secondary" },
        { href: ROUTES.admin.subscriptionRequests, label: "Product Requests", variant: "secondary" },
      ]}
      statusBadge={{ label: "Contract Source Workflow", tone: "info" }}
    >
      <div className="space-y-5">
        <Phase7Guidance
          items={[
            {
              label: "Create Advance EMI contract",
              href: ROUTES.admin.subscriptionsAdvanceEmiCreate,
              note: "Start Lucky Plan contract. Assigns a Lucky ID from a batch — Lucky ID and batch context are Advance EMI only.",
              warning: "Assign Lucky ID only inside the Advance EMI workflow. Rent and Lease contracts do not use Lucky IDs or Lucky Draws.",
            },
            {
              label: "Collect first instalment",
              href: ROUTES.admin.financeCollect,
              note: "Post the first collection through Collections & Cashier. Payment and receipt belong to that module.",
              warning: "Payment posting and receipt generation remain backend-allocated and reconciliation-safe. Do not post from the contract register.",
            },
            {
              label: "Schedule delivery",
              href: ROUTES.admin.deliveryCreate,
              note: "Create delivery through Delivery & Service only after stock readiness is confirmed by Inventory & Stock.",
              warning: "Delivery handover and stock-out belong to Delivery & Service — not to the contract register.",
            },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1 text-sm">
            <div className="font-semibold text-foreground">Plan-type boundary</div>
            <div className="text-xs text-muted-foreground">Advance EMI → Lucky ID + batch (Lucky Plan context). Rent / Lease → No Lucky ID, no draw.</div>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1 text-sm">
            <div className="font-semibold text-foreground">Winner waiver rule</div>
            <div className="text-xs text-muted-foreground">Advance EMI only. Future EMI instalments are waived for the draw winner. Past collected EMIs are not reversed.</div>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1 text-sm">
            <div className="font-semibold text-foreground">Payment & receipt</div>
            <div className="text-xs text-muted-foreground">
              <Link href={ROUTES.admin.financeCollect} className="text-primary hover:underline">Collections & Cashier</Link>
              {" "}— not from this contract page
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1 text-sm">
            <div className="font-semibold text-foreground">Accounting & reconciliation</div>
            <div className="text-xs text-muted-foreground">
              <Link href={ROUTES.admin.reconciliation} className="text-primary hover:underline">Accounting & Reconciliation</Link>
              {" "}— separate module
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <WorkflowCard
            title="Advance EMI — Lucky Plan"
            description="Lucky Plan EMI contracts with batch and Lucky ID assignment. Each subscriber gets a unique Lucky ID from their assigned batch. Draw winner receives a future EMI waiver only. Payment and receipt collection belong to Collections & Cashier."
            action={
              <Link
                href={`${ROUTES.admin.subscriptions}?plan_type=EMI`}
                className="inline-flex text-sm font-semibold text-primary hover:underline"
              >
                Open Advance EMI register →
              </Link>
            }
          />
          <WorkflowCard
            title="Rent — monthly demand"
            description="Rent contracts with monthly demand cycle, security deposit, possession, handover, and return inspection. No Lucky ID or Lucky Draw context. Rent payment and receipt belong to Collections & Cashier. Deposit refund belongs to Finance Operations."
            action={
              <Link
                href={`${ROUTES.admin.subscriptions}?plan_type=RENT`}
                className="inline-flex text-sm font-semibold text-primary hover:underline"
              >
                Open Rent register →
              </Link>
            }
          />
          <WorkflowCard
            title="Lease — monthly demand"
            description="Lease contracts with monthly demand cycle, security deposit, possession, handover, and return inspection. No Lucky ID or Lucky Draw context. Lease payment and receipt belong to Collections & Cashier. Deposit refund belongs to Finance Operations."
            action={
              <Link
                href={`${ROUTES.admin.subscriptions}?plan_type=LEASE`}
                className="inline-flex text-sm font-semibold text-primary hover:underline"
              >
                Open Lease register →
              </Link>
            }
          />
          <WorkflowCard
            title="Partner Operations"
            description="Partner register, partner customers, subscription requests, commissions, and payouts. Partner Advance EMI follows the same Lucky Plan rules. Commission and payout belong to Finance Operations — not from this page."
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
  const [partnerInput, setPartnerInput] = useState(currentPartnerFilter);

  const [kpis, setKpis] = useState<SubscriptionKpis | null>(null);
  const [batchBreakdown, setBatchBreakdown] = useState<BatchBreakdownRow[]>([]);

  useEffect(() => {
    setSearchInput(currentSearchQuery);
    setStatusInput(currentStatusFilter);
    setPlanTypeInput(currentPlanTypeFilter);
    setPartnerInput(currentPartnerFilter);
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

  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (currentSearchQuery) params.set("q", currentSearchQuery);
    if (currentStatusFilter) params.set("status", currentStatusFilter);
    if (currentPlanTypeFilter) params.set("plan_type", currentPlanTypeFilter);
    if (currentCustomerFilter) params.set("customer", currentCustomerFilter);
    if (currentProductFilter) params.set("product", currentProductFilter);
    if (currentPartnerFilter) params.set("partner", currentPartnerFilter);
    if (currentBatchFilter) params.set("batch", currentBatchFilter);
    return params.toString();
  }, [
    currentBatchFilter,
    currentCustomerFilter,
    currentPartnerFilter,
    currentPlanTypeFilter,
    currentProductFilter,
    currentSearchQuery,
    currentStatusFilter,
  ]);

  const loadInsights = useCallback(async () => {
    if (isWorkflowLanding) return;
    const suffix = filterQueryString ? `?${filterQueryString}` : "";
    try {
      const [kpiPayload, batchPayload] = await Promise.all([
        apiFetch<unknown>(`/admin/subscriptions/kpis/${suffix}`),
        apiFetch<unknown>(`/admin/subscriptions/batch-breakdown/${suffix}`),
      ]);
      setKpis(normalizeKpis(kpiPayload));
      setBatchBreakdown(normalizeBatchBreakdown(batchPayload).results);
    } catch {
      // KPIs are supplementary — a failure here must not blank the register.
      setKpis(null);
      setBatchBreakdown([]);
    }
  }, [filterQueryString, isWorkflowLanding]);

  useEffect(() => {
    void loadInsights();
  }, [loadInsights]);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (isWorkflowLanding) {
      setLoading(false);
      return;
    }
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await apiFetch<unknown>(`/admin/subscriptions/?${listQueryString}`);
      const normalized = normalizeSubscriptionListPayload(payload, currentPage);

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

    const next = new URLSearchParams(searchParams.toString());
    next.set("page", "1");
    if (searchInput.trim()) next.set("q", searchInput.trim());
    if (statusInput) next.set("status", statusInput);
    if (planTypeInput.trim()) next.set("plan_type", planTypeInput.trim());
    if (partnerInput.trim()) next.set("partner", parseIdFilter(partnerInput));
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

  const activePlanType = currentPlanTypeFilter.trim().toUpperCase();

  const statCards = useMemo(() => {
    // Register-wide KPIs from the backend honor every active filter. Fall back
    // to page-scoped figures only until the KPI call resolves.
    if (!kpis) {
      return [
        { label: "Total Matching", value: loading ? "—" : count, tone: "info" as const },
        { label: "Active (page)", value: loading ? "—" : pageActiveCount, tone: "success" as const },
        { label: "Page Contract Value", value: loading ? "—" : formatRupee(pageContractValue), tone: "default" as const },
      ];
    }

    if (activePlanType === "EMI") {
      return [
        { label: "EMI Subscriptions", value: kpis.emi_count, tone: "info" as const },
        { label: "Contract Value", value: formatRupee(kpis.total_contract_value), tone: "default" as const },
        { label: "To Collect (Outstanding)", value: formatRupee(kpis.total_outstanding), tone: "warning" as const },
        { label: "Won (Draw)", value: kpis.won_subscriptions, tone: "success" as const },
        { label: "Overdue EMIs", value: kpis.overdue_emis, tone: kpis.overdue_emis > 0 ? ("danger" as const) : ("success" as const) },
      ];
    }

    if (activePlanType === "RENT" || activePlanType === "LEASE") {
      const label = activePlanType === "RENT" ? "Rent" : "Lease";
      return [
        { label: `${label} Contracts`, value: kpis.total_subscriptions, tone: "info" as const },
        { label: "Contract Value", value: formatRupee(kpis.total_contract_value), tone: "default" as const },
        { label: "Monthly Demand", value: formatRupee(kpis.total_monthly_value), tone: "default" as const },
        { label: "To Collect (Outstanding)", value: formatRupee(kpis.total_outstanding), tone: "warning" as const },
      ];
    }

    // "All" view — headline totals plus the per-plan mix.
    return [
      { label: "Total Subscriptions", value: kpis.total_subscriptions, tone: "info" as const },
      { label: "Contract Value", value: formatRupee(kpis.total_contract_value), tone: "default" as const },
      { label: "To Collect (Outstanding)", value: formatRupee(kpis.total_outstanding), tone: "warning" as const },
      { label: "Won (Draw)", value: kpis.won_subscriptions, tone: "success" as const },
      { label: "Mix (EMI / Rent / Lease)", value: `${kpis.emi_count} / ${kpis.rent_count} / ${kpis.lease_count}`, tone: "default" as const },
    ];
  }, [kpis, activePlanType, loading, count, pageActiveCount, pageContractValue]);

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
        lucky_id: row.lucky_id,
        lucky_number: typeof row.lucky_number === "number" ? String(row.lucky_number) : "",
        partner_id: row.partner_id,
        partner_name: row.partner_name ?? "",
        partner_phone: row.partner_phone ?? "",
        plan_type: row.plan_type ?? "",
        tenure_months:
          typeof row.tenure_months === "number" ? String(row.tenure_months) : "",
        start_date: row.start_date ?? "",
        total_amount: row.total_amount,
        monthly_amount: row.monthly_amount,
        status: row.status,
        deposit_status: row.deposit_status ?? "",
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
      eyebrow="Sales & Contracts"
      title="Subscription Register"
      subtitle="Contract source workflow — filtered view of Advance EMI, Rent, and Lease contracts. Advance EMI rows include Lucky ID and batch context. Rent and Lease rows do not."
      helperNote="Contract values shown here are source records. Payment and receipt belong to Collections & Cashier. Accounting bridge and reconciliation belong to Accounting & Reconciliation. Delivery belongs to Delivery & Service."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Subscriptions" },
      ]}
      actions={[
        {
          href: createSubscriptionHref,
          label: "Create Advance EMI",
          variant: "primary",
        },
        {
          href: ROUTES.admin.subscriptionsRentCreate,
          label: "Create Rent",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.subscriptionsLeaseCreate,
          label: "Create Lease",
          variant: "secondary",
        },
        {
          href: "/admin/customers",
          label: "Customer Profiles",
          variant: "secondary",
        },
      ]}
      statusBadge={{
        label: "Contract Source Workflow",
        tone: "info",
      }}
      stats={statCards}
    >
      <RegistryPageShell
        summary={
          !loading && !error ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:text-sm">
              <span className="font-semibold text-foreground">Filtered register</span>
              {": "}
              {count} matching
              {kpis ? (
                <>
                  {" · Contract value "}
                  <span className="tabular-nums text-foreground">{formatRupee(kpis.total_contract_value)}</span>
                  {" · To collect "}
                  <span className="tabular-nums text-amber-600">{formatRupee(kpis.total_outstanding)}</span>
                  {activePlanType === "EMI" || activePlanType === "" ? (
                    <>
                      {" · Pending EMIs "}
                      <span className="tabular-nums text-foreground">{kpis.pending_emis}</span>
                      {kpis.overdue_emis > 0 ? (
                        <span className="text-red-600"> ({kpis.overdue_emis} overdue)</span>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  {" · This page: "}
                  {pageActiveCount} active, {pageWonCount} won · Page contract total{" "}
                  <span className="tabular-nums text-foreground">{formatRupee(pageContractValue)}</span>
                </>
              )}
            </div>
          ) : null
        }
        filters={
          <>
        <nav aria-label="Plan type" className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Plan type
          </span>
          {(
            [
              { label: "All plans", plan: "" },
              { label: "Advance EMI", plan: "EMI" },
              { label: "Rent", plan: "RENT" },
              { label: "Lease", plan: "LEASE" },
            ] as const
          ).map((tab) => {
            const active =
              tab.plan === "" ? !activePlanType : activePlanType === tab.plan;
            const countForTab =
              tab.plan === "EMI"
                ? kpis?.emi_count
                : tab.plan === "RENT"
                  ? kpis?.rent_count
                  : tab.plan === "LEASE"
                    ? kpis?.lease_count
                    : kpis?.total_subscriptions;
            return (
              <Link
                key={tab.label}
                href={buildListPath({ plan_type: tab.plan, page: "" })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted"
                )}
              >
                {tab.label}
                {typeof countForTab === "number" ? (
                  <span className="ml-1.5 tabular-nums opacity-70">{countForTab}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

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
          <form onSubmit={handleApplyFilters} className="grid gap-4 lg:grid-cols-7">
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

            <div>
              <label
                htmlFor="subscription-partner"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Partner ID
              </label>
              <input
                id="subscription-partner"
                type="text"
                value={partnerInput}
                onChange={(event) => setPartnerInput(event.target.value)}
                placeholder="ID"
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
              onClick={() => {
                void loadPage("refresh");
                void loadInsights();
              }}
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
                    { key: "deposit_status", header: "deposit_status" },
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
        {!loading && !error && batchBreakdown.some((b) => b.batch_id !== null) ? (
          <DetailPanel
            title="Batch breakdown"
            description="Running batches inside the current filtered register — subscribers, contract value and outstanding per batch. Select a batch to drill the register into it."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Batch</th>
                    <th className="px-3 py-2 text-right font-semibold">Subscribers</th>
                    <th className="px-3 py-2 text-right font-semibold">Contract value</th>
                    <th className="px-3 py-2 text-right font-semibold">Collected</th>
                    <th className="px-3 py-2 text-right font-semibold">Outstanding</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {batchBreakdown
                    .filter((b) => b.batch_id !== null)
                    .map((b) => {
                      const isActive = currentBatchFilter === String(b.batch_id);
                      return (
                        <tr
                          key={b.batch_id}
                          className={cn(
                            "border-b border-border/60 last:border-0",
                            isActive ? "bg-primary/5" : "hover:bg-muted/40"
                          )}
                        >
                          <td className="px-3 py-2 font-medium text-foreground">
                            {b.batch_code || `Batch #${b.batch_id}`}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.subscriber_count}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatRupee(b.contract_value)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{formatRupee(b.collected_value)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-600">{formatRupee(b.outstanding_value)}</td>
                          <td className="px-3 py-2 text-right">
                            <Link
                              href={buildListPath({ batch: isActive ? "" : String(b.batch_id), page: "" })}
                              className={cn(
                                "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition",
                                isActive
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input bg-background hover:bg-muted"
                              )}
                            >
                              {isActive ? "Clear" : "Filter"}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </DetailPanel>
        ) : null}

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
              description="Review contract context and route into detail, customer, or payment operations. Contract readiness is evaluated on each subscription detail — open a subscription to see its activation and handover readiness."
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
                <div className="grid gap-4 xl:grid-cols-2">
                  {rows.map((row) => (
                    <div key={row.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:shadow-md">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/20 px-5 py-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-semibold text-foreground">
                              {row.subscription_number}
                            </h4>
                            <ERPStatusBadge status={row.status} size="sm" />
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Start: {formatDate(row.start_date)}</span>
                            <span>·</span>
                            <span>Tenure: {typeof row.tenure_months === "number" ? `${row.tenure_months} mo` : "—"}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-foreground">
                            {formatRupee(row.total_amount)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground flex items-center justify-end gap-1">
                            <span>{row.plan_type || "Plan"} · {formatRupee(row.monthly_amount)}/mo</span>
                            {(row.plan_type === "RENT" || row.plan_type === "LEASE") && (row.deposit_status === "SUBMITTED" || row.deposit_status === "PENDING") && (
                              <>
                                <span>·</span>
                                <span className={cn(
                                  "font-medium",
                                  row.deposit_status === "SUBMITTED" ? "text-emerald-600" : "text-amber-600"
                                )}>
                                  {row.deposit_status === "SUBMITTED" ? "Deposit Paid" : "Deposit Pending"}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 px-5 py-4">
                        <div className="space-y-3">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</div>
                            <div className="mt-1 text-sm font-medium">
                              <CustomerIntelligenceTrigger
                                customerId={row.customer_id}
                                customerName={row.customer_name || "Unknown"}
                                scope="admin"
                              />
                            </div>
                            <div className="text-xs text-muted-foreground">{row.customer_phone || "No phone"}</div>
                          </div>

                          {row.partner_name && (
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Partner</div>
                              <div className="mt-1 text-sm font-medium">{row.partner_name}</div>
                              {row.partner_phone && <div className="text-xs text-muted-foreground">{row.partner_phone}</div>}
                            </div>
                          )}
                          
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product Context</div>
                            <div className="mt-1 text-sm font-medium">{row.product_name || "Unknown product"}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.batch_code ? `Batch ${row.batch_code}` : "No Batch"}
                              {typeof row.lucky_number === "number" ? ` · Lucky #${row.lucky_number}` : ""}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-1">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Financial Ledger</div>
                            {row.plan_type === "EMI" && (
                              <HoverCard>
                                <HoverCardTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                                    <InfoIcon className="h-3 w-3" />
                                    <span className="sr-only">View EMI Details</span>
                                  </button>
                                </HoverCardTrigger>
                                <HoverCardContent side="top" align="start" className="w-64">
                                  <div className="space-y-3">
                                    <h4 className="text-sm font-semibold flex items-center gap-2">
                                      <CalendarClock className="h-4 w-4 text-primary" />
                                      Contract Terms
                                    </h4>
                                    <div className="text-xs text-muted-foreground">
                                      Total Tenure: <span className="font-medium text-foreground">{row.tenure_months || 0} Months</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                      <div className="flex flex-col gap-1 rounded-md bg-muted/30 p-2">
                                        <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-emerald-600">
                                          <CheckCircle2 className="h-3 w-3" /> Given
                                        </div>
                                        <div className="text-sm font-bold">{row.paid_emi_count || 0} <span className="text-xs font-normal text-muted-foreground">mo</span></div>
                                      </div>
                                      <div className="flex flex-col gap-1 rounded-md bg-muted/30 p-2">
                                        <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-destructive">
                                          <AlertCircle className="h-3 w-3" /> Fault
                                        </div>
                                        <div className="text-sm font-bold">{row.overdue_emi_count || 0} <span className="text-xs font-normal text-muted-foreground">mo</span></div>
                                      </div>
                                    </div>
                                    {Number(row.waived_emi_count) > 0 && (
                                      <div className="text-xs text-emerald-600 font-medium">
                                        Waived: {row.waived_emi_count} months
                                      </div>
                                    )}
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40 cursor-default">
                              <div className="text-xs text-muted-foreground">Paid</div>
                              <div className="font-semibold text-foreground">
                                {formatRupee(row.total_paid_amount || row.financial_summary?.paid_amount || 0)}
                              </div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40 cursor-default">
                              <div className="text-xs text-muted-foreground">Outstanding</div>
                              <div className="font-semibold text-foreground">
                                {formatRupee(row.outstanding_amount || row.financial_summary?.outstanding_amount || row.total_amount)}
                              </div>
                            </div>
                          </div>
                          {row.plan_type === "EMI" && Number(row.emi_count) > 0 && (
                            <div className="mt-1 space-y-1.5 px-1">
                              <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-muted/60">
                                <div style={{ width: `${(Number(row.paid_emi_count || 0) / Number(row.emi_count)) * 100}%` }} className="bg-emerald-500 transition-all duration-500" />
                                <div style={{ width: `${(Number(row.overdue_emi_count || 0) / Number(row.emi_count)) * 100}%` }} className="bg-destructive transition-all duration-500" />
                              </div>
                              <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                                <span className="text-emerald-600">{row.paid_emi_count || 0} Paid</span>
                                {Number(row.overdue_emi_count) > 0 && <span className="text-destructive font-bold">{row.overdue_emi_count} Overdue</span>}
                                <span>{row.emi_count} Total</span>
                              </div>
                            </div>
                          )}
                          {Number(row.financial_summary?.waived_amount || 0) > 0 && (
                            <div className="text-xs font-medium text-emerald-600 px-1">
                              Waived: {formatRupee(row.financial_summary?.waived_amount || 0)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-border bg-muted/10 px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/subscriptions/${row.id}`}
                            className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background shadow-sm transition hover:opacity-90"
                          >
                            Open Details
                          </Link>
                          
                          <button
                            type="button"
                            onClick={() => openWorkflow("admin.collectPayment", { query: { subscription: row.id } })}
                            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition hover:bg-muted"
                          >
                            Quick Collect
                          </button>

                          {row.status === "PENDING" && (
                            <button
                              type="button"
                              className="inline-flex h-8 items-center rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-blue-700 shadow-sm transition hover:bg-blue-100"
                              onClick={() => {
                                // Activate placeholder - this would open the activate workflow
                                router.push(`/admin/subscriptions/${row.id}`);
                              }}
                            >
                              Activate Contract
                            </button>
                          )}

                          <Link
                            href={`/admin/deliveries/create?subscription=${row.id}`}
                            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition hover:bg-muted"
                          >
                            Record Handover
                          </Link>

                          {(row.plan_type === "RENT" || row.plan_type === "LEASE") && (
                            <Link
                              href={`/admin/subscriptions/${row.id}?tab=ledger`}
                              className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition hover:bg-muted"
                            >
                              Rent/Lease Mapping
                            </Link>
                          )}

                          <button
                            type="button"
                            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition hover:bg-muted"
                            onClick={() => {
                              router.push(`/admin/subscriptions/${row.id}/amend`);
                            }}
                          >
                            Amend Contract
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
