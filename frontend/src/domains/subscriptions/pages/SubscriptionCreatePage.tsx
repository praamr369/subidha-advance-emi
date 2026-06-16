"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { apiFetch, toArray } from "@/lib/api";
import { formatPlanTypeLabel } from "@/lib/plan-labels";
import { ROUTES } from "@/lib/routes";
import CustomerSelector from "@/components/admin/customers/CustomerSelector";
import type { CustomerRecord } from "@/services/customers";
import KycReadinessPanel from "@/domains/subscriptions/components/KycReadinessPanel";
import type { ContractKycReadiness } from "@/services/kyc-readiness";

type PlanType = "EMI" | "RENT" | "LEASE";
type SubscriptionCreateVariant = "page" | "drawer";

type CustomerOption = {
  id: number;
  name: string;
  phone: string;
  kyc_status?: string;
};

type ProductOption = {
  id: number;
  name: string;
  product_code?: string;
  base_price?: string;
  category?: string;
  subcategory?: string;
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
  // Phase 2
  is_direct_sale_enabled?: boolean;
  lifecycle_status?: string;
  on_hand_qty?: string;
  reserved_qty?: string;
  available_qty?: string;
  stock_status?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "FULLY_RESERVED";
};

type BatchOption = {
  id: number;
  batch_code?: string;
  status?: string;
  duration_months?: number;
  draw_day?: number;
  start_date?: string;
  available_slots?: number;
};

type LuckyIdOption = {
  id: number;
  lucky_number?: number;
  status?: string;
  batch?: number;
  assignable?: boolean;
  assignment_state?: string;
  assignment_note?: string;
};

type PartnerOption = {
  id: number;
  username?: string;
  phone?: string;
};

type CreatedSubscriptionResponse = {
  id: number;
  customer?: number;
  product?: number;
  partner?: number | null;
  batch?: number | null;
  lucky_id?: number | null;
  plan_type?: string;
  tenure_months?: number;
  start_date?: string;
  total_amount?: string;
  monthly_amount?: string;
  status?: string;
  rent_profile?: Record<string, unknown> | null;
  lease_profile?: Record<string, unknown> | null;
  documents?: Array<Record<string, unknown>>;
};

const LUCKY_PREVIEW_LIMIT = 12;

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

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Request failed.";
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizePlanType(value: string | null): PlanType | null {
  const normalized = (value || "").trim().toUpperCase();
  if (normalized === "EMI") return "EMI";
  if (normalized === "RENT") return "RENT";
  if (normalized === "LEASE") return "LEASE";
  return null;
}

function isValidDateInput(value: string | null): value is string {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function normalizeCustomer(raw: Record<string, unknown>): CustomerOption {
  return {
    id: toNumber(raw.id),
    name: String(raw.name ?? ""),
    phone: String(raw.phone ?? ""),
    kyc_status: toOptionalString(raw.kyc_status),
  };
}

function normalizeProduct(raw: Record<string, unknown>): ProductOption {
  return {
    id: toNumber(raw.id),
    name: String(raw.name ?? ""),
    product_code: toOptionalString(raw.product_code),
    base_price: toMoneyString(raw.base_price),
    category: toOptionalString(raw.category),
    subcategory: toOptionalString(raw.subcategory),
    is_emi_enabled:
      typeof raw.is_emi_enabled === "boolean" ? raw.is_emi_enabled : undefined,
    is_rent_enabled:
      typeof raw.is_rent_enabled === "boolean" ? raw.is_rent_enabled : undefined,
    is_lease_enabled:
      typeof raw.is_lease_enabled === "boolean" ? raw.is_lease_enabled : undefined,
    // Phase 2
    is_direct_sale_enabled:
      typeof raw.is_direct_sale_enabled === "boolean" ? raw.is_direct_sale_enabled : undefined,
    lifecycle_status: toOptionalString(raw.lifecycle_status),
  };
}

function normalizeBatch(raw: Record<string, unknown>): BatchOption {
  return {
    id: toNumber(raw.id),
    batch_code: toOptionalString(raw.batch_code),
    status: toOptionalString(raw.status),
    duration_months: toOptionalNumber(raw.duration_months),
    draw_day: toOptionalNumber(raw.draw_day),
    start_date: toOptionalString(raw.start_date),
    available_slots: toOptionalNumber(raw.available_slots),
  };
}

function normalizeLuckyId(raw: Record<string, unknown>): LuckyIdOption {
  return {
    id: toNumber(raw.id),
    lucky_number: toOptionalNumber(raw.lucky_number),
    status: toOptionalString(raw.status),
    batch: toOptionalNumber(raw.batch),
    assignable: typeof raw.assignable === "boolean" ? raw.assignable : undefined,
    assignment_state: toOptionalString(raw.assignment_state),
    assignment_note: toOptionalString(raw.assignment_note),
  };
}

function normalizePartner(raw: Record<string, unknown>): PartnerOption {
  return {
    id: toNumber(raw.id),
    username: toOptionalString(raw.username),
    phone: toOptionalString(raw.phone),
  };
}

function formatAvailableSlots(batch: BatchOption | null | undefined): string {
  if (!batch || typeof batch.available_slots !== "number") return "Slots unavailable";
  return `${batch.available_slots} slots open`;
}

function enabledPlanModes(product: ProductOption | null | undefined): string[] {
  if (!product) return [];

  const modes: string[] = [];
  if (product.is_emi_enabled) modes.push("EMI");
  if (product.is_rent_enabled) modes.push("RENT");
  if (product.is_lease_enabled) modes.push("LEASE");
  return modes;
}

function formatLuckyNumber(item: LuckyIdOption | null | undefined): string {
  const value = item?.lucky_number ?? item?.id;
  if (value == null) return "—";
  return `#${String(value).padStart(2, "0")}`;
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="surface-panel-elevated rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="space-y-1">
        <h2 className="enterprise-section-title text-base">{title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DetailValue({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

function SearchPanel<T>({
  title,
  description,
  query,
  setQuery,
  onSearch,
  loading,
  selected,
  onClear,
  results,
  renderSelected,
  renderOption,
  onSelect,
  disabled = false,
  placeholder = "Search...",
  emptyTitle = "No results",
  emptyDescription = "No matching records were found.",
}: {
  title: string;
  description: string;
  query: string;
  setQuery: (value: string) => void;
  onSearch: () => void;
  loading: boolean;
  selected: T | null;
  onClear: () => void;
  results: T[];
  renderSelected: (item: T) => ReactNode;
  renderOption: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSearch();
            }
          }}
          placeholder={placeholder}
          disabled={disabled || loading}
          className="h-10 flex-1 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <ActionButton
          type="button"
          variant="primary"
          onClick={onSearch}
          disabled={disabled || loading}
        >
          {loading ? "Searching..." : "Search"}
        </ActionButton>
      </div>

      {selected ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>{renderSelected(selected)}</div>
            <ActionButton
              type="button"
              variant="outline"
              size="sm"
              onClick={onClear}
            >
              Clear
            </ActionButton>
          </div>
        </div>
      ) : null}

      {!selected && results.length > 0 ? (
        <div className="mt-4 space-y-2">
          {results.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(item)}
              className="w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4 text-left transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
            >
              {renderOption(item)}
            </button>
          ))}
        </div>
      ) : null}

      {!selected && !loading && query.trim().length > 0 && results.length === 0 ? (
        <div className="mt-4">
          <ERPEmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      ) : null}
    </div>
  );
}

export default function SubscriptionCreatePage({
  variant = "page",
  queryString,
  onCreated,
}: {
  variant?: SubscriptionCreateVariant;
  queryString?: string;
  onCreated?: (subscriptionId: number) => void;
} = {}) {
  const runtimeSearchParams = useSearchParams();
  const searchParamKey = useMemo(() => {
    const raw = (queryString ?? "").trim();
    if (raw) return raw.replace(/^\?/, "");
    return runtimeSearchParams.toString();
  }, [queryString, runtimeSearchParams]);
  const luckyRequestSequence = useRef(0);
  const [planType, setPlanType] = useState<PlanType>("EMI");

  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [batch, setBatch] = useState<BatchOption | null>(null);
  const [luckyId, setLuckyId] = useState<LuckyIdOption | null>(null);
  const [partner, setPartner] = useState<PartnerOption | null>(null);

  const [securityDepositPercent, setSecurityDepositPercent] = useState("20");
  const [leaseBuyoutAmount, setLeaseBuyoutAmount] = useState("");
  const [ownershipTransferAllowed, setOwnershipTransferAllowed] = useState(false);
  const [handoverNotes, setHandoverNotes] = useState("");
  const [contractTermsSnapshot, setContractTermsSnapshot] = useState("");

  const [kycFiles, setKycFiles] = useState<File[]>([]);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);

  // customerQuery / customerResults / customerLoading removed – handled by CustomerSelector
  const [productQuery, setProductQuery] = useState("");
  const [batchQuery, setBatchQuery] = useState("");
  const [luckyQuery, setLuckyQuery] = useState("");
  const [partnerQuery, setPartnerQuery] = useState("");

  const [productResults, setProductResults] = useState<ProductOption[]>([]);
  const [batchResults, setBatchResults] = useState<BatchOption[]>([]);
  const [luckyResults, setLuckyResults] = useState<LuckyIdOption[]>([]);
  const [partnerResults, setPartnerResults] = useState<PartnerOption[]>([]);
  const [availableLuckyCount, setAvailableLuckyCount] = useState<number | null>(null);

  const [productLoading, setProductLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [luckyLoading, setLuckyLoading] = useState(false);
  const [partnerLoading, setPartnerLoading] = useState(false);

  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualTenureMonths, setManualTenureMonths] = useState("12");

  const [kycReadiness, setKycReadiness] = useState<ContractKycReadiness | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [globalLoadingLabel, setGlobalLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefillMessages, setPrefillMessages] = useState<string[]>([]);
  const [success, setSuccess] = useState<CreatedSubscriptionResponse | null>(null);

  const leadContext = useMemo(() => {
    const params = new URLSearchParams(searchParamKey);
    const lead = (params.get("lead") || "").trim();
    const leadName = (params.get("lead_name") || "").trim();
    const leadPhone = (params.get("lead_phone") || "").trim();
    const leadCity = (params.get("lead_city") || "").trim();
    const leadNotes =
      (params.get("lead_notes") || "").trim() || (params.get("notes") || "").trim();
    const leadProduct =
      (params.get("lead_product_name") || "").trim() ||
      (params.get("product_name") || "").trim() ||
      (params.get("interested_product") || "").trim();

    if (!lead && !leadName && !leadPhone && !leadCity && !leadNotes && !leadProduct) {
      return null;
    }

    return {
      lead,
      leadName,
      leadPhone,
      leadCity,
      leadNotes,
      leadProduct,
    };
  }, [searchParamKey]);

  const customerCreateHref = useMemo(() => {
    if (!leadContext) return "/admin/customers/create";

    const params = new URLSearchParams();
    if (leadContext.lead) params.set("lead", leadContext.lead);
    if (leadContext.leadName) params.set("name", leadContext.leadName);
    if (leadContext.leadPhone) params.set("phone", leadContext.leadPhone);
    if (leadContext.leadCity) params.set("city", leadContext.leadCity);
    if (leadContext.leadNotes) params.set("notes", leadContext.leadNotes);
    if (product?.id) params.set("product", String(product.id));
    if (product?.name) params.set("product_name", product.name);
    if (product?.product_code) params.set("product_code", product.product_code);
    if (leadContext.leadProduct && !product?.name) {
      params.set("interested_product", leadContext.leadProduct);
    }

    return `/admin/customers/create?${params.toString()}`;
  }, [leadContext, product?.id, product?.name, product?.product_code]);

  const canonicalSelfHref = useMemo(() => {
    const canonicalPath =
      planType === "RENT"
        ? ROUTES.admin.subscriptionsRentCreate
        : planType === "LEASE"
          ? ROUTES.admin.subscriptionsLeaseCreate
          : ROUTES.admin.subscriptionsAdvanceEmiCreate;
    return searchParamKey ? `${canonicalPath}?${searchParamKey}` : canonicalPath;
  }, [planType, searchParamKey]);

  const returnToLeadHref = useMemo(() => {
    if (!success || !leadContext?.lead) return null;

    const params = new URLSearchParams();
    if (success.customer) params.set("converted_customer", String(success.customer));
    params.set("converted_subscription", String(success.id));
    return `/admin/leads/${leadContext.lead}?${params.toString()}`;
  }, [leadContext?.lead, success]);

  const isEmiPlan = planType === "EMI";
  const isRentPlan = planType === "RENT";
  const isLeasePlan = planType === "LEASE";
  const isDrawer = variant === "drawer";

  const tenureMonths = useMemo(() => {
    if (isEmiPlan) {
      return Number(batch?.duration_months ?? 0);
    }
    return Number(manualTenureMonths || 0);
  }, [isEmiPlan, batch?.duration_months, manualTenureMonths]);

  const totalAmount = useMemo(() => Number(product?.base_price ?? 0), [product?.base_price]);

  const monthlyAmount = useMemo(() => {
    if (!tenureMonths || tenureMonths <= 0) return "0.00";
    return (totalAmount / tenureMonths).toFixed(2);
  }, [totalAmount, tenureMonths]);

  const depositPercentNumber = useMemo(() => {
    const parsed = Number(securityDepositPercent);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [securityDepositPercent]);

  const securityDepositAmount = useMemo(() => {
    const percent = depositPercentNumber;
    if (!percent || percent <= 0) return "0.00";
    return (totalAmount * percent / 100).toFixed(2);
  }, [depositPercentNumber, totalAmount]);

  const productModes = useMemo(() => enabledPlanModes(product), [product]);
  const luckyPreviewLabel = useMemo(() => {
    if (!batch || availableLuckyCount == null) return null;
    if (availableLuckyCount <= 0) {
      return "No available Lucky IDs remain in this batch.";
    }

    const previewNumbers = luckyResults
      .slice(0, LUCKY_PREVIEW_LIMIT)
      .map((item) =>
        item.lucky_number != null
          ? `#${String(item.lucky_number).padStart(2, "0")}`
          : `#${item.id}`
      );

    if (luckyId) {
      return `${availableLuckyCount} Lucky IDs are currently available in ${batch.batch_code || `Batch #${batch.id}`}.`;
    }

    if (previewNumbers.length === 0) {
      return `${availableLuckyCount} Lucky IDs are currently available in ${batch.batch_code || `Batch #${batch.id}`}. Leave Lucky ID blank to auto-assign the next available row.`;
    }

    return `${availableLuckyCount} Lucky IDs are currently available in ${batch.batch_code || `Batch #${batch.id}`}. Leave Lucky ID blank to auto-assign the next available row, or quick-pick from ${previewNumbers.join(", ")}.`;
  }, [availableLuckyCount, batch, luckyId, luckyResults]);

  const canSubmit = useMemo(() => {
    if (!customer || !product || !startDate) return false;
    if (!tenureMonths || tenureMonths <= 0) return false;
    if (isEmiPlan && !batch) return false;
    if (!isEmiPlan) {
      if (depositPercentNumber < 20 || depositPercentNumber > 30) return false;
      if (isRentPlan && !product.is_rent_enabled) return false;
      if (isLeasePlan && !product.is_lease_enabled) return false;
    }
    return true;
  }, [
    customer,
    product,
    startDate,
    tenureMonths,
    isEmiPlan,
    batch,
    depositPercentNumber,
    isRentPlan,
    isLeasePlan,
  ]);

  // For RENT/LEASE, the activate path is gated on KYC readiness from the backend.
  // If gating is disabled server-side, readiness.can_activate will be true anyway.
  const canActivate = useMemo(() => {
    if (!canSubmit) return false;
    if (isEmiPlan) return canSubmit;
    if (kycReadiness && !kycReadiness.can_activate) return false;
    return true;
  }, [canSubmit, isEmiPlan, kycReadiness]);

  // Save as Draft is always allowed when the form structure is complete (no KYC gate).
  const canSaveAsDraft = useMemo(() => {
    if (isEmiPlan) return false;
    if (!customer || !product || !startDate) return false;
    if (!tenureMonths || tenureMonths <= 0) return false;
    if (depositPercentNumber < 20 || depositPercentNumber > 30) return false;
    if (isRentPlan && !product.is_rent_enabled) return false;
    if (isLeasePlan && !product.is_lease_enabled) return false;
    return true;
  }, [
    isEmiPlan,
    customer,
    product,
    startDate,
    tenureMonths,
    depositPercentNumber,
    isRentPlan,
    isLeasePlan,
  ]);

  function nextLuckyRequestToken(): number {
    luckyRequestSequence.current += 1;
    return luckyRequestSequence.current;
  }

  async function runProductSearch() {
    if (!productQuery.trim()) return;
    setProductLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<unknown>(
        `/admin/products/search/?q=${encodeURIComponent(productQuery.trim())}`
      );
      const normalized = toArray<Record<string, unknown>>(payload).map(normalizeProduct);
      const filtered = normalized.filter((item) => {
        // Phase 2: filter out DISCONTINUED products from selector
        if (item.lifecycle_status === "DISCONTINUED") return false;
        if (isEmiPlan) return Boolean(item.is_emi_enabled);
        if (isRentPlan) return Boolean(item.is_rent_enabled);
        if (isLeasePlan) return Boolean(item.is_lease_enabled);
        return true;
      });
      setProductResults(filtered);
    } catch (err) {
      setError(toErrorMessage(err));
      setProductResults([]);
    } finally {
      setProductLoading(false);
    }
  }

  // Phase 2: debounce auto-search on productQuery changes (300ms)
  useEffect(() => {
    if (!productQuery.trim()) return;
    const timer = setTimeout(() => {
      void runProductSearch();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productQuery]);

  async function runBatchSearch() {
    if (!batchQuery.trim()) return;
    setBatchLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<unknown>(
        `/admin/batches/?q=${encodeURIComponent(batchQuery.trim())}`
      );
      const rows = toArray<Record<string, unknown>>(payload)
        .map(normalizeBatch)
        .filter((item) => (item.status || "").toUpperCase() === "OPEN");
      setBatchResults(rows);
    } catch (err) {
      setError(toErrorMessage(err));
      setBatchResults([]);
    } finally {
      setBatchLoading(false);
    }
  }

  async function loadLuckyAvailability(
    batchId: number,
    query = "",
    options?: { previewOnly?: boolean; requestToken?: number }
  ) {
    const payload = await apiFetch<Record<string, unknown>>(
      `/admin/lucky-ids/available/?batch_id=${encodeURIComponent(String(batchId))}`
    );
    const allRows = toArray<Record<string, unknown>>(payload)
      .map(normalizeLuckyId)
      .filter((item) => item.assignable !== false);
    const trimmedQuery = query.trim();
    const filteredRows = trimmedQuery
      ? allRows.filter((item) =>
          String(item.lucky_number ?? item.id).includes(trimmedQuery)
        )
      : allRows;

    if (
      typeof options?.requestToken === "number" &&
      options.requestToken !== luckyRequestSequence.current
    ) {
      return;
    }

    setAvailableLuckyCount(
      typeof payload.count === "number" ? payload.count : allRows.length
    );
    setLuckyResults(
      options?.previewOnly && !trimmedQuery
        ? filteredRows.slice(0, LUCKY_PREVIEW_LIMIT)
        : filteredRows
    );
  }

  async function runLuckySearch() {
    if (!batch?.id) {
      setError("Select an open batch before searching Lucky IDs.");
      return;
    }

    setLuckyLoading(true);
    setError(null);
    try {
      await loadLuckyAvailability(batch.id, luckyQuery, {
        requestToken: nextLuckyRequestToken(),
      });
    } catch (err) {
      setError(toErrorMessage(err));
      setAvailableLuckyCount(null);
      setLuckyResults([]);
    } finally {
      setLuckyLoading(false);
    }
  }

  async function runPartnerSearch() {
    if (!partnerQuery.trim()) return;
    setPartnerLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<unknown>(
        `/admin/partners/?q=${encodeURIComponent(partnerQuery.trim())}`
      );
      setPartnerResults(
        toArray<Record<string, unknown>>(payload).map(normalizePartner)
      );
    } catch (err) {
      setError(toErrorMessage(err));
      setPartnerResults([]);
    } finally {
      setPartnerLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(searchParamKey);

    const customerParam = params.get("customer");
    const productParam = params.get("product");
    const partnerParam = params.get("partner");
    const batchParam = params.get("batch");
    const luckyParam = params.get("lucky_id") || params.get("lucky");
    const planTypeParam = params.get("plan_type") || params.get("plan");
    const startDateParam = params.get("start_date");

    const hasPrefillParams =
      customerParam ||
      productParam ||
      partnerParam ||
      batchParam ||
      luckyParam ||
      planTypeParam ||
      startDateParam;

    if (!hasPrefillParams) {
      setPrefillMessages([]);
      return () => {
        cancelled = true;
      };
    }

    async function applyPrefills() {
      const messages: string[] = [];

      setError(null);
      setSuccess(null);
      setGlobalLoadingLabel("Loading requested prefill context...");

      const resolvedPlanType = normalizePlanType(planTypeParam);
      if (planTypeParam) {
        if (resolvedPlanType) {
          setPlanType(resolvedPlanType);
          if (resolvedPlanType !== "EMI") {
            nextLuckyRequestToken();
            setBatch(null);
            setLuckyId(null);
            setBatchResults([]);
            setLuckyResults([]);
            setLuckyQuery("");
            setAvailableLuckyCount(null);
          }
        } else {
          messages.push(
            `Plan prefill "${planTypeParam}" was ignored because it is not a supported plan type.`
          );
        }
      }

      if (startDateParam) {
        if (isValidDateInput(startDateParam)) {
          setStartDate(startDateParam);
        } else {
          messages.push(
            `Start date prefill "${startDateParam}" was ignored because it is not a valid YYYY-MM-DD date.`
          );
        }
      }

      const customerId = parsePositiveInteger(customerParam);
      if (customerParam) {
        if (!customerId) {
          messages.push(
            `Customer prefill "${customerParam}" was ignored because it is not a valid customer id.`
          );
        } else {
          try {
            const payload = await apiFetch<Record<string, unknown>>(
              `/admin/customers/${customerId}/`
            );
            if (!cancelled) {
              const normalized = normalizeCustomer(payload);
              setCustomer(normalized);
              // CustomerSelector manages its own query/results state
            }
          } catch {
            messages.push(
              `Customer #${customerId} could not be loaded, so the customer prefill was not applied.`
            );
          }
        }
      }

      const productId = parsePositiveInteger(productParam);
      if (productParam) {
        if (!productId) {
          messages.push(
            `Product prefill "${productParam}" was ignored because it is not a valid product id.`
          );
        } else {
          try {
            const payload = await apiFetch<Record<string, unknown>>(
              `/admin/products/${productId}/`
            );
            if (!cancelled) {
              const normalized = normalizeProduct(payload);
              setProduct(normalized);
              setProductQuery(
                normalized.product_code
                  ? `${normalized.name} ${normalized.product_code}`
                  : normalized.name
              );
              setProductResults([]);
            }
          } catch {
            messages.push(
              `Product #${productId} could not be loaded, so the product prefill was not applied.`
            );
          }
        }
      }

      const partnerId = parsePositiveInteger(partnerParam);
      if (partnerParam) {
        if (!partnerId) {
          messages.push(
            `Partner prefill "${partnerParam}" was ignored because it is not a valid partner id.`
          );
        } else {
          try {
            const payload = await apiFetch<Record<string, unknown>>(
              `/admin/partners/${partnerId}/`
            );
            if (!cancelled) {
              const normalized = normalizePartner(payload);
              setPartner(normalized);
              setPartnerQuery(
                normalized.phone
                  ? `${normalized.username || `Partner #${normalized.id}`} ${normalized.phone}`
                  : normalized.username || `Partner #${normalized.id}`
              );
              setPartnerResults([]);
            }
          } catch {
            messages.push(
              `Partner #${partnerId} could not be loaded, so the partner prefill was not applied.`
            );
          }
        }
      }

      const effectivePlanType = resolvedPlanType ?? "EMI";
      const batchId = parsePositiveInteger(batchParam);
      if (batchParam) {
        if (effectivePlanType !== "EMI") {
          messages.push(
            "Batch prefill was ignored because batch linkage only applies to EMI subscriptions."
          );
        } else if (!batchId) {
          messages.push(
            `Batch prefill "${batchParam}" was ignored because it is not a valid batch id.`
          );
        } else {
          try {
            const payload = await apiFetch<Record<string, unknown>>(
              `/admin/batches/${batchId}/`
            );
            if (!cancelled) {
              const normalized = normalizeBatch(payload);
              if ((normalized.status || "").toUpperCase() !== "OPEN") {
                messages.push(
                  `Batch #${batchId} was loaded but not applied because only OPEN batches are allowed for EMI contract creation.`
                );
              } else {
                setBatch(normalized);
                setBatchQuery(normalized.batch_code || `Batch #${normalized.id}`);
                setBatchResults([]);
              }
            }
          } catch {
            messages.push(
              `Batch #${batchId} could not be loaded, so the batch prefill was not applied.`
            );
          }
        }
      }

      const luckyIdValue = luckyParam;
      const luckyIdParam = parsePositiveInteger(luckyIdValue);
      if (luckyIdValue) {
        if (effectivePlanType !== "EMI") {
          messages.push(
            "Lucky ID prefill was ignored because Lucky ID allocation only applies to EMI subscriptions."
          );
        } else if (!luckyIdParam) {
          messages.push(
            `Lucky ID prefill "${luckyIdValue}" was ignored because it is not a valid Lucky ID.`
          );
        } else {
          try {
            const payload = await apiFetch<Record<string, unknown>>(
              `/admin/lucky-ids/${luckyIdParam}/`
            );
            if (!cancelled) {
              const normalized = normalizeLuckyId(payload);
              if (batchId && normalized.batch && normalized.batch !== batchId) {
                messages.push(
                  `Lucky ID #${luckyIdParam} was loaded but not applied because it does not belong to batch #${batchId}.`
                );
              } else {
                setLuckyId(normalized);
                setLuckyQuery(
                  normalized.lucky_number != null
                    ? String(normalized.lucky_number)
                    : String(normalized.id)
                );
                setLuckyResults([]);
              }
            }
          } catch {
            messages.push(
              `Lucky ID #${luckyIdParam} could not be loaded, so the Lucky ID prefill was not applied.`
            );
          }
        }
      }

      if (!cancelled) {
        setPrefillMessages(messages);
        setGlobalLoadingLabel(null);
      }
    }

    void applyPrefills();

    return () => {
      cancelled = true;
    };
  }, [searchParamKey]);

  useEffect(() => {
    if (!isEmiPlan || !batch?.id) {
      setAvailableLuckyCount(null);
      setLuckyResults([]);
      return;
    }

    const batchId = batch.id;
    let cancelled = false;

    async function warmLuckyPreview() {
      setLuckyLoading(true);
      try {
        await loadLuckyAvailability(batchId, "", {
          previewOnly: true,
          requestToken: nextLuckyRequestToken(),
        });
      } catch (err) {
        if (!cancelled) {
          setError(toErrorMessage(err));
          setAvailableLuckyCount(null);
          setLuckyResults([]);
        }
      } finally {
        if (!cancelled) {
          setLuckyLoading(false);
        }
      }
    }

    void warmLuckyPreview();

    return () => {
      cancelled = true;
    };
  }, [batch?.id, isEmiPlan]);

  function resetForFreshCreate() {
    nextLuckyRequestToken();
    setPlanType("EMI");
    setCustomer(null);
    setKycReadiness(null);
    setProduct(null);
    setBatch(null);
    setLuckyId(null);
    setPartner(null);

    // customerQuery/customerResults managed by CustomerSelector
    setProductQuery("");
    setBatchQuery("");
    setLuckyQuery("");
    setPartnerQuery("");

    setProductResults([]);
    setBatchResults([]);
    setLuckyResults([]);
    setPartnerResults([]);
    setAvailableLuckyCount(null);

    setStartDate(new Date().toISOString().slice(0, 10));
    setManualTenureMonths("12");

    setError(null);
    setSuccess(null);
  }

  async function prepareNextWithSameSetup() {
    nextLuckyRequestToken();
    setCustomer(null);
    setLuckyId(null);

    // customerQuery/customerResults managed by CustomerSelector
    setLuckyQuery("");

    setLuckyResults([]);

    setError(null);
    setSuccess(null);

    if (isEmiPlan && batch?.id) {
      setLuckyLoading(true);
      try {
        await loadLuckyAvailability(batch.id, "", {
          previewOnly: true,
          requestToken: nextLuckyRequestToken(),
        });
      } catch (err) {
        setError(toErrorMessage(err));
        setAvailableLuckyCount(null);
        setLuckyResults([]);
      } finally {
        setLuckyLoading(false);
      }
    } else {
      setAvailableLuckyCount(null);
    }
  }

  async function handleSubmit(options?: { saveAsDraft?: boolean }) {
    const asDraft = options?.saveAsDraft ?? false;
    setError(null);
    setSuccess(null);
    setDocUploadError(null);

    if (!customer) {
      setError("Customer is required.");
      return;
    }

    if (!product) {
      setError("Product is required.");
      return;
    }

    if (!startDate) {
      setError("Start date is required.");
      return;
    }

    if (!tenureMonths || tenureMonths <= 0) {
      setError("Tenure must be greater than zero.");
      return;
    }

    if (isEmiPlan && !batch) {
      setError("Batch is required for EMI subscription.");
      return;
    }

    if (!isEmiPlan && (depositPercentNumber < 20 || depositPercentNumber > 30)) {
      setError("Security deposit percent must be between 20 and 30.");
      return;
    }

    setSubmitting(true);
    setGlobalLoadingLabel(
      isEmiPlan
        ? "Creating subscription and applying contract rules..."
        : asDraft
          ? `Saving ${planType} contract as draft...`
          : `Creating ${planType} contract and generating contract PDF...`
    );

    try {
      let created: CreatedSubscriptionResponse;

      if (isEmiPlan) {
        const body: Record<string, unknown> = {
          customer: customer.id,
          product: product.id,
          partner: partner?.id ?? null,
          plan_type: planType,
          tenure_months: tenureMonths,
          start_date: startDate,
          batch: batch?.id ?? null,
          lucky_id: luckyId?.id ?? null,
        };

        created = await apiFetch<CreatedSubscriptionResponse>("/admin/subscriptions/", {
          method: "POST",
          body: JSON.stringify(body),
        });
      } else if (isRentPlan) {
        const body: Record<string, unknown> = {
          customer: customer.id,
          product: product.id,
          tenure_months: tenureMonths,
          start_date: startDate,
          security_deposit_percent: depositPercentNumber,
          handover_notes: handoverNotes || "",
          contract_terms_snapshot: contractTermsSnapshot || "",
          save_as_draft: asDraft,
        };

        created = await apiFetch<CreatedSubscriptionResponse>("/admin/contracts/rent/", {
          method: "POST",
          body: JSON.stringify(body),
        });
      } else {
        const body: Record<string, unknown> = {
          customer: customer.id,
          product: product.id,
          tenure_months: tenureMonths,
          start_date: startDate,
          security_deposit_percent: depositPercentNumber,
          buyout_amount: leaseBuyoutAmount.trim() ? leaseBuyoutAmount.trim() : null,
          ownership_transfer_allowed: ownershipTransferAllowed,
          handover_notes: handoverNotes || "",
          contract_terms_snapshot: contractTermsSnapshot || "",
          save_as_draft: asDraft,
        };

        created = await apiFetch<CreatedSubscriptionResponse>("/admin/contracts/lease/", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      setSuccess(created);
      onCreated?.(created.id);
    } catch (err) {
      const message = toErrorMessage(err);
      if (
        message.toLowerCase().includes("lucky id") &&
        (message.toLowerCase().includes("no longer") ||
          message.toLowerCase().includes("assigned") ||
          message.toLowerCase().includes("frozen"))
      ) {
        setError("This Lucky ID is no longer available. Refresh and choose another.");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
      setGlobalLoadingLabel(null);
    }
  }

  async function uploadDocument(subscriptionId: number, documentType: string, file: File, notes?: string) {
    const form = new FormData();
    form.append("document_type", documentType);
    form.append("file", file);
    if (notes) form.append("notes", notes);

    return apiFetch<Record<string, unknown>>(`/admin/subscriptions/${subscriptionId}/documents/`, {
      method: "POST",
      body: form,
    });
  }

  async function refreshSuccess(subscriptionId: number) {
    const refreshed = await apiFetch<CreatedSubscriptionResponse>(`/admin/subscriptions/${subscriptionId}/`, {
      cache: "no-store",
    });
    setSuccess(refreshed);
  }

  async function handleUploadSelectedDocuments() {
    if (!success?.id) return;
    setDocUploadError(null);

    if (kycFiles.length === 0) {
      setDocUploadError("Select at least one KYC document file.");
      return;
    }

    if (!signatureFile) {
      setDocUploadError("Select a customer signature file.");
      return;
    }

    setDocUploadBusy(true);
    try {
      for (const file of kycFiles) {
        await uploadDocument(success.id, "CUSTOMER_KYC_ID", file, "Customer KYC ID");
      }
      await uploadDocument(success.id, "CUSTOMER_SIGNATURE", signatureFile, "Customer signature");
      await refreshSuccess(success.id);
      setKycFiles([]);
      setSignatureFile(null);
    } catch (err) {
      setDocUploadError(toErrorMessage(err));
    } finally {
      setDocUploadBusy(false);
    }
  }

  return (
    <ERPPageShell
      title={variant === "drawer" ? "Create subscription" : "Create Subscription"}
      subtitle="Search-first contract creation flow for customer, product, plan, batch, Lucky ID, and start date."
      helperNote="This flow preserves existing EMI, payment, waiver, draw, and audit semantics while adding safe contract onboarding controls."
      helperTone="info"
      breadcrumbs={
        variant === "drawer"
          ? []
          : [
              { label: "Admin", href: "/admin" },
              { label: "Subscriptions", href: "/admin/subscriptions" },
              { label: "Create" },
            ]
      }
      actions={
        variant === "drawer"
          ? [
              { href: canonicalSelfHref, label: "Open full page", variant: "secondary" },
              { href: customerCreateHref, label: "Create Customer", variant: "ghost" },
            ]
          : [
              {
                href: "/admin/subscriptions",
                label: "Back to Register",
                variant: "secondary",
              },
              {
                href: customerCreateHref,
                label: "Create Customer",
                variant: "secondary",
              },
            ]
      }
      stats={
        variant === "drawer"
          ? []
          : [
              {
                label: "Plan Type",
                value: formatPlanTypeLabel(planType),
              },
              {
                label: "Tenure",
                value: tenureMonths > 0 ? `${tenureMonths} months` : "—",
              },
              {
                label: "Contract Value",
                value: money(totalAmount),
                tone: "success",
              },
              {
                label: isEmiPlan ? "Default Advance EMI" : "Recurring Amount (monthly)",
                value: money(monthlyAmount),
              },
            ]
      }
      statusBadge={{
        label: "Contract Creation",
        tone: "info",
      }}
      presentation={variant === "drawer" ? "popup" : "page"}
      maxWidth={variant === "drawer" ? "100%" : undefined}
    >
      <div className="space-y-6">
        {!isDrawer ? (
          <SectionCard
            title="Creation rules"
            description="Product base price is treated as total contract price. Default Advance EMI is total contract price divided by tenure months."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailValue label="Contract Value Source" value="Product base price" />
              <DetailValue label="Default Advance EMI Formula" value="base price / tenure months" />
              <DetailValue
                label="EMI Plan Rule"
                value="Batch required, Lucky ID optional"
              />
              <DetailValue
                label="Lucky ID Behavior"
                value={
                  isEmiPlan
                    ? luckyId
                      ? `Manual Lucky ${formatLuckyNumber(luckyId)}`
                      : "Auto-assign first available if left empty"
                    : "Not used for rent/lease"
                }
              />
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Step 1 · Contract parties"
          description="Select the customer, product, and optional partner context for this subscription."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Customer</div>
              <div className="text-xs text-muted-foreground mb-2">
                Phone-first search with inline quick-create. Duplicate phones return the existing customer.
              </div>
              <CustomerSelector
                selected={
                  customer
                    ? ({ ...customer } as CustomerRecord)
                    : null
                }
                onSelect={(rec: CustomerRecord) => {
                  setCustomer({ id: rec.id, name: rec.name, phone: rec.phone, kyc_status: rec.kyc_status });
                  setError(null);
                  setSuccess(null);
                }}
                onClear={() => {
                  setCustomer(null);
                  setKycReadiness(null);
                }}
                placeholder="Search customer by phone, name, or code…"
              />
            </div>

            <SearchPanel<ProductOption>
              title="Product"
              description="Search by product name or product code. Press Enter to search."
              query={productQuery}
              setQuery={setProductQuery}
              onSearch={runProductSearch}
              loading={productLoading}
              selected={product}
              onClear={() => {
                nextLuckyRequestToken();
                setProduct(null);
                setProductResults([]);
                setBatch(null);
                setLuckyId(null);
                setBatchQuery("");
                setLuckyQuery("");
                setBatchResults([]);
                setLuckyResults([]);
                setAvailableLuckyCount(null);
              }}
              results={productResults}
              renderSelected={(item) => (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {item.name} {item.product_code ? `(${item.product_code})` : ""}
                    </span>
                    {item.lifecycle_status && item.lifecycle_status !== "ACTIVE" && (
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        item.lifecycle_status === "DISCONTINUED" ? "bg-red-100 text-red-700" :
                        item.lifecycle_status === "MAINTENANCE" ? "bg-yellow-100 text-yellow-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {item.lifecycle_status}
                      </span>
                    )}
                    {item.stock_status && (
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        item.stock_status === "IN_STOCK" ? "bg-green-100 text-green-700" :
                        item.stock_status === "LOW_STOCK" ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {item.stock_status === "IN_STOCK" ? "In Stock" :
                         item.stock_status === "LOW_STOCK" ? "Low Stock" :
                         item.stock_status === "OUT_OF_STOCK" ? "Out of Stock" :
                         "Fully Reserved"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Base price {money(item.base_price)}
                    {item.available_qty && ` · Available: ${item.available_qty}`}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Enabled modes {enabledPlanModes(item).join(" / ") || "—"}
                  </div>
                </div>
              )}
              renderOption={(item) => (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {item.name} {item.product_code ? `(${item.product_code})` : ""}
                    </span>
                    {item.lifecycle_status && item.lifecycle_status !== "ACTIVE" && (
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        item.lifecycle_status === "DISCONTINUED" ? "bg-red-100 text-red-700" :
                        item.lifecycle_status === "MAINTENANCE" ? "bg-yellow-100 text-yellow-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {item.lifecycle_status}
                      </span>
                    )}
                    {item.stock_status && (
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        item.stock_status === "IN_STOCK" ? "bg-green-100 text-green-700" :
                        item.stock_status === "LOW_STOCK" ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {item.stock_status === "IN_STOCK" ? "In Stock" :
                         item.stock_status === "LOW_STOCK" ? "Low Stock" :
                         item.stock_status === "OUT_OF_STOCK" ? "Out of Stock" :
                         "Fully Reserved"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Base price {money(item.base_price)} · {item.category || "—"} /{" "}
                    {item.subcategory || "—"}
                    {item.available_qty && ` · Avail: ${item.available_qty}`}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Enabled modes {enabledPlanModes(item).join(" / ") || "—"}
                  </div>
                </div>
              )}
              onSelect={(item) => {
                setProduct(item);
                setProductResults([]);
                setError(null);
                setSuccess(null);
              }}
              placeholder="Search product by name or code"
            />

            {isEmiPlan ? (
              <SearchPanel<PartnerOption>
                title="Partner (optional)"
                description="Attach a partner to the contract when applicable. Press Enter to search."
                query={partnerQuery}
                setQuery={setPartnerQuery}
                onSearch={runPartnerSearch}
                loading={partnerLoading}
                selected={partner}
                onClear={() => {
                  setPartner(null);
                  setPartnerResults([]);
                }}
                results={partnerResults}
                renderSelected={(item) => (
                  <div>
                    <div className="font-medium text-foreground">
                      {item.username || `Partner #${item.id}`}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.phone || "No phone"}
                    </div>
                  </div>
                )}
                renderOption={(item) => (
                  <div>
                    <div className="font-medium text-foreground">
                      {item.username || `Partner #${item.id}`}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.phone || "No phone"}
                    </div>
                  </div>
                )}
                onSelect={(item) => {
                  setPartner(item);
                  setPartnerResults([]);
                  setError(null);
                  setSuccess(null);
                }}
                placeholder="Search partner by username or phone"
              />
            ) : null}

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Plan Type</h3>
                <p className="text-xs text-muted-foreground">
                  Advance EMI requires batch linkage. Rent and lease use manual tenure.
                </p>
              </div>

              <div className="mt-4">
                <select
                  value={planType}
                  onChange={(event) => {
                    const nextPlanType = event.target.value as PlanType;
                    nextLuckyRequestToken();
                    setPlanType(nextPlanType);
                    setBatch(null);
                    setLuckyId(null);
                    setPartner(null);
                    setBatchResults([]);
                    setLuckyResults([]);
                    setLuckyQuery("");
                    setAvailableLuckyCount(null);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                >
                  <option value="EMI">Advance EMI</option>
                  <option value="RENT">RENT</option>
                  <option value="LEASE">LEASE</option>
                </select>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Step 2 · Contract structure"
          description="For EMI plans, choose an open batch and optionally assign an available Lucky ID."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {isEmiPlan ? (
              <>
                <div className="space-y-3">
                  <SearchPanel<BatchOption>
                    title="Batch (Open only)"
                    description="EMI subscriptions must be linked to an open batch. Press Enter to search."
                    query={batchQuery}
                    setQuery={setBatchQuery}
                    onSearch={runBatchSearch}
                    loading={batchLoading}
                    selected={batch}
                    onClear={() => {
                      nextLuckyRequestToken();
                      setBatch(null);
                      setLuckyId(null);
                      setBatchQuery("");
                      setLuckyQuery("");
                      setBatchResults([]);
                      setLuckyResults([]);
                      setAvailableLuckyCount(null);
                    }}
                    results={batchResults}
                    renderSelected={(item) => (
                      <div>
                        <div className="font-medium text-foreground">
                          {item.batch_code || `Batch #${item.id}`}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.duration_months || 0} months · {item.status || "—"} ·{" "}
                          {formatAvailableSlots(item)}
                        </div>
                      </div>
                    )}
                    renderOption={(item) => (
                      <div>
                        <div className="font-medium text-foreground">
                          {item.batch_code || `Batch #${item.id}`}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.duration_months || 0} months · Draw day{" "}
                          {item.draw_day ?? "—"} · Start {item.start_date || "—"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatAvailableSlots(item)}
                        </div>
                      </div>
                    )}
                    onSelect={(item) => {
                      nextLuckyRequestToken();
                      setBatch(item);
                      setLuckyId(null);
                      setLuckyQuery("");
                      setBatchResults([]);
                      setLuckyResults([]);
                      setAvailableLuckyCount(null);
                      setError(null);
                      setSuccess(null);
                    }}
                    placeholder="Search batch by code"
                  />

                  {batch ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                      <div className="font-medium">
                        {batch.batch_code || `Batch #${batch.id}`} is ready for EMI onboarding.
                      </div>
                      <div className="mt-1 text-xs text-blue-800">
                        Tenure is locked to {batch.duration_months || 0} months.{" "}
                        {formatAvailableSlots(batch)}. Lucky IDs are limited to this batch only.
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <SearchPanel<LuckyIdOption>
                    title="Lucky ID (optional)"
                    description="Press Enter to search a specific Lucky ID, or leave it blank to use backend auto-assignment."
                    query={luckyQuery}
                    setQuery={setLuckyQuery}
                    onSearch={runLuckySearch}
                    loading={luckyLoading}
                    selected={luckyId}
                    onClear={() => {
                      setLuckyId(null);
                      setLuckyResults([]);
                      setError(null);
                      setSuccess(null);
                      if (batch?.id) {
                        setLuckyLoading(true);
                        void loadLuckyAvailability(batch.id, "", {
                          previewOnly: true,
                          requestToken: nextLuckyRequestToken(),
                        })
                          .catch((err) => {
                            setError(toErrorMessage(err));
                            setAvailableLuckyCount(null);
                            setLuckyResults([]);
                          })
                          .finally(() => {
                            setLuckyLoading(false);
                          });
                      } else {
                        setAvailableLuckyCount(null);
                      }
                    }}
                    results={luckyResults}
                    renderSelected={(item) => (
                      <div>
                        <div className="font-medium text-foreground">
                          Lucky {formatLuckyNumber(item)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.assignment_note || item.assignment_state || item.status || "AVAILABLE"}
                        </div>
                      </div>
                    )}
                    renderOption={(item) => (
                      <div>
                        <div className="font-medium text-foreground">
                          Lucky {formatLuckyNumber(item)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.assignment_note || item.assignment_state || item.status || "AVAILABLE"}
                        </div>
                      </div>
                    )}
                    onSelect={(item) => {
                      setLuckyId(item);
                      setLuckyResults([]);
                      setError(null);
                      setSuccess(null);
                    }}
                    disabled={!batch}
                    placeholder={batch ? "Search Lucky ID by number" : "Select batch first"}
                    emptyTitle={batch ? "No available Lucky IDs" : "Batch required"}
                    emptyDescription={
                      batch
                        ? "No matching Lucky IDs are currently available in this batch."
                        : "Select a batch before searching Lucky IDs."
                    }
                  />

                  {batch ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                      <div className="font-medium">
                        {luckyPreviewLabel || "Loading Lucky ID availability..."}
                      </div>
                      {!luckyQuery.trim() &&
                      availableLuckyCount != null &&
                      availableLuckyCount > luckyResults.length ? (
                        <div className="mt-1 text-xs text-sky-800">
                          Showing the first {LUCKY_PREVIEW_LIMIT} available Lucky IDs for quick pick. Search a specific number to narrow further.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="lg:col-span-2 space-y-4">
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      Security deposit (required)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Deposit must be between 20% and 30% of contract value. Refund is processed after return-condition assessment.
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Deposit percent
                      </label>
                      <input
                        type="number"
                        min="20"
                        max="30"
                        step="0.5"
                        value={securityDepositPercent}
                        onChange={(event) => {
                          setSecurityDepositPercent(event.target.value);
                          setError(null);
                          setSuccess(null);
                        }}
                        className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                      />
                      <p className="mt-2 text-xs text-muted-foreground">Allowed range: 20 to 30</p>
                    </div>

                    <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Deposit amount
                      </div>
                      <div className="mt-2 text-sm font-semibold text-foreground">
                        {money(securityDepositAmount)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Computed from contract value {money(totalAmount)}
                      </div>
                    </div>
                  </div>

                  {isLeasePlan ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Buyout amount (optional)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={leaseBuyoutAmount}
                          onChange={(event) => {
                            setLeaseBuyoutAmount(event.target.value);
                            setError(null);
                            setSuccess(null);
                          }}
                          className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          Leave blank if buyout is not applicable.
                        </p>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-3">
                        <input
                          id="ownership-transfer"
                          type="checkbox"
                          checked={ownershipTransferAllowed}
                          onChange={(event) => {
                            setOwnershipTransferAllowed(event.target.checked);
                            setError(null);
                            setSuccess(null);
                          }}
                          className="mt-1 h-4 w-4 rounded border border-border"
                        />
                        <label htmlFor="ownership-transfer" className="text-sm">
                          <div className="font-medium text-foreground">
                            Ownership transfer allowed
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Enable only if the lease contract allows transfer after fulfillment.
                          </div>
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">Handover notes (optional)</h3>
                      <p className="text-xs text-muted-foreground">
                        Stored on the contract profile for operational handover history.
                      </p>
                    </div>
                    <textarea
                      value={handoverNotes}
                      onChange={(event) => {
                        setHandoverNotes(event.target.value);
                        setError(null);
                        setSuccess(null);
                      }}
                      rows={4}
                      className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
                      placeholder="Optional notes for condition, delivery, or handover checklist..."
                    />
                  </div>

                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">Contract terms snapshot (optional)</h3>
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use the default system terms snapshot. Stored immutably for audit.
                      </p>
                    </div>
                    <textarea
                      value={contractTermsSnapshot}
                      onChange={(event) => {
                        setContractTermsSnapshot(event.target.value);
                        setError(null);
                        setSuccess(null);
                      }}
                      rows={4}
                      className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
                      placeholder="Optional custom terms snapshot for lawyer review..."
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Start Date</h3>
                <p className="text-xs text-muted-foreground">
                  Contract start date used for schedule creation and audit trace.
                </p>
              </div>

              <input
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setError(null);
                  setSuccess(null);
                }}
                className="mt-4 h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Tenure Months</h3>
                <p className="text-xs text-muted-foreground">
                  EMI tenure is batch-controlled. Rent and lease tenure is manual.
                </p>
              </div>

              <input
                type="number"
                min="1"
                value={isEmiPlan ? String(batch?.duration_months ?? "") : manualTenureMonths}
                onChange={(event) => setManualTenureMonths(event.target.value)}
                disabled={isEmiPlan}
                className="mt-4 h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
              />

              <p className="mt-2 text-xs text-muted-foreground">
                {isEmiPlan
                  ? "Tenure is locked to the selected batch duration."
                  : "Manual tenure is used for rent or lease contracts."}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Step 3 · Financial preview"
          description="Review derived contract values before creation."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailValue
              label="Customer"
              value={customer ? `${customer.name} (${customer.phone})` : "—"}
            />
            <DetailValue
              label="Product"
              value={
                product
                  ? `${product.name}${product.product_code ? ` (${product.product_code})` : ""}`
                  : "—"
              }
            />
            <DetailValue
              label="Enabled Modes"
              value={productModes.length > 0 ? productModes.join(" / ") : "—"}
            />
            <DetailValue
              label="Batch"
              value={
                isEmiPlan
                  ? batch
                    ? batch.batch_code || `Batch #${batch.id}`
                    : "—"
                  : "Not applicable"
              }
            />
            <DetailValue
              label="Lucky ID"
              value={
                isEmiPlan
                  ? luckyId
                    ? `#${luckyId.lucky_number ?? luckyId.id}`
                    : "Auto assign if available"
                  : "Not applicable"
              }
            />
            <DetailValue
              label="Partner"
              value={isEmiPlan ? (partner?.username || "—") : "Not applicable"}
            />
            <DetailValue
              label="Tenure"
              value={tenureMonths > 0 ? `${tenureMonths} months` : "—"}
            />
            <DetailValue
              label="Contract Value"
              value={money(totalAmount)}
            />
            <DetailValue
              label={isEmiPlan ? "Default Advance EMI" : "Recurring Amount (monthly)"}
              value={money(monthlyAmount)}
            />
            {!isEmiPlan ? (
              <DetailValue
                label="Security Deposit"
                value={`${depositPercentNumber.toFixed(2)}% · ${money(securityDepositAmount)}`}
              />
            ) : null}
          </div>
        </SectionCard>

        {customer && (isRentPlan || isLeasePlan || isEmiPlan) ? (
          <SectionCard
            title="KYC Readiness"
            description={
              isEmiPlan
                ? "KYC status is shown for reference. The gate is enforced at contract activation, not subscription creation."
                : "Required documents must be present before the contract can be activated. Save as Draft to register now and upload documents later."
            }
          >
            <KycReadinessPanel
              customerId={customer.id}
              planType={planType}
              onReadinessChange={setKycReadiness}
            />
          </SectionCard>
        ) : null}

        {globalLoadingLabel ? <ERPLoadingState label={globalLoadingLabel} /> : null}

        {leadContext ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <div className="font-medium">Lead context is attached to this subscription flow.</div>
            <div className="mt-1">
              {leadContext.lead ? `Lead #${leadContext.lead}` : "Public lead"} ·{" "}
              {leadContext.leadName || "No lead name"} · {leadContext.leadPhone || "No phone"}
            </div>
            <div className="mt-1 text-xs text-blue-700">
              {leadContext.leadProduct || "No product context provided"} ·{" "}
              {leadContext.leadCity || "No city provided"}
            </div>
            {leadContext.leadNotes ? (
              <div className="mt-2 whitespace-pre-wrap text-xs text-blue-700">
                {leadContext.leadNotes}
              </div>
            ) : null}
            {leadContext.lead ? (
              <div className="mt-3">
                <Link
                  href={`/admin/leads/${leadContext.lead}`}
                  className="inline-flex items-center rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-900 transition hover:bg-blue-100"
                >
                  Back to Lead Detail
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {prefillMessages.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="font-medium">Some URL prefills were not applied.</div>
            <ul className="mt-2 list-disc pl-5">
              {prefillMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <ERPErrorState
            title={isEmiPlan ? "Unable to create subscription" : "Unable to create contract"}
            description={error}
            onRetry={canActivate ? handleSubmit : undefined}
          />
        ) : null}

        {success ? (
          <SectionCard
            title={isEmiPlan ? "Subscription created" : "Contract created"}
            description={
              isEmiPlan
                ? "The contract was created successfully and is ready for downstream workflows."
                : "Contract created successfully. Upload KYC/signature and open the generated contract PDF from the documents list."
            }
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailValue label="Subscription ID" value={`#${success.id}`} />
              <DetailValue label="Plan Type" value={formatPlanTypeLabel(success.plan_type || planType)} />
              <DetailValue label="Status" value={success.status || "ACTIVE"} />
              <DetailValue
                label={isEmiPlan ? "Monthly Advance EMI" : "Recurring Amount (monthly)"}
                value={money(success.monthly_amount || monthlyAmount)}
              />
            </div>

            {!isEmiPlan ? (
              <div className="mt-5 rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-semibold text-foreground">KYC and signature uploads</div>
                  <div className="text-xs text-muted-foreground">
                    Upload at least one customer KYC document and the customer signature for this contract.
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="kyc-id-files" className="text-xs font-medium text-muted-foreground">Customer KYC ID files</label>
                    <input
                      id="kyc-id-files"
                      type="file"
                      multiple
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        setKycFiles(files);
                        setDocUploadError(null);
                      }}
                      className="mt-2 block w-full text-sm"
                    />
                    <div className="mt-2 text-xs text-muted-foreground">
                      {kycFiles.length > 0 ? `${kycFiles.length} file(s) selected` : "No files selected"}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="signature-file" className="text-xs font-medium text-muted-foreground">Customer signature file</label>
                    <input
                      id="signature-file"
                      type="file"
                      onChange={(event) => {
                        const file = (event.target.files ?? [])[0] ?? null;
                        setSignatureFile(file);
                        setDocUploadError(null);
                      }}
                      className="mt-2 block w-full text-sm"
                    />
                    <div className="mt-2 text-xs text-muted-foreground">
                      {signatureFile ? signatureFile.name : "No file selected"}
                    </div>
                  </div>
                </div>

                {docUploadError ? (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {docUploadError}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleUploadSelectedDocuments();
                    }}
                    disabled={docUploadBusy}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {docUploadBusy ? "Uploading..." : "Upload Documents"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void refreshSuccess(success.id);
                    }}
                    disabled={docUploadBusy}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Refresh Contract Detail
                  </button>
                </div>

                {Array.isArray(success.documents) && success.documents.length > 0 ? (
                  <div className="mt-4 grid gap-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Attached documents
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {success.documents.slice(0, 8).map((doc) => {
                        const id = Number((doc as Record<string, unknown>).id ?? 0);
                        const type = String((doc as Record<string, unknown>).document_type ?? "");
                        const url = (doc as Record<string, unknown>).file_url;
                        const href = typeof url === "string" ? url : null;
                        return (
                          <div
                            key={`${type}-${id}`}
                            className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3"
                          >
                            <div className="text-sm font-medium text-foreground">{type || "Document"}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {href ? "Ready" : "No file URL"}
                            </div>
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex text-sm font-medium text-sky-700 hover:underline"
                              >
                                Open file
                              </a>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Full document list is available in the subscription detail page.
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    No documents attached yet.
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/admin/subscriptions/${success.id}`}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Open Detail
              </Link>

              <Link
                href="/admin/subscriptions"
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Back to Register
              </Link>

              {returnToLeadHref ? (
                <Link
                  href={returnToLeadHref}
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Return to Lead
                </Link>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  void prepareNextWithSameSetup();
                }}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Create Another With Same Setup
              </button>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Create contract"
          description="Submit only after verifying customer, product, plan structure, and financial preview."
        >
          <div className={variant === "drawer" ? "popup-action-bar items-center" : "flex flex-wrap gap-3"}>
            <button
              type="button"
              onClick={() => { void handleSubmit(); }}
              disabled={!canActivate || submitting}
              data-testid="activate-contract-button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? isEmiPlan
                  ? "Creating Subscription..."
                  : "Creating Contract..."
                : isEmiPlan
                  ? "Create Subscription"
                  : "Activate Contract"}
            </button>

            {!isEmiPlan ? (
              <button
                type="button"
                onClick={() => { void handleSubmit({ saveAsDraft: true }); }}
                disabled={!canSaveAsDraft || submitting}
                data-testid="save-draft-button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Saving..." : "Save as Draft"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={resetForFreshCreate}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset Form
            </button>

            <Link
              href="/admin/subscriptions"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Cancel
            </Link>
          </div>
        </SectionCard>
      </div>
    </ERPPageShell>
  );
}
