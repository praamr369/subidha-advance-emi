"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch, toArray } from "@/lib/api";

type PlanType = "EMI" | "RENT" | "LEASE";

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
};

type BatchOption = {
  id: number;
  batch_code?: string;
  status?: string;
  duration_months?: number;
  draw_day?: number;
  start_date?: string;
};

type LuckyIdOption = {
  id: number;
  lucky_number?: number;
  status?: string;
  batch?: number;
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
  };
}

function normalizeLuckyId(raw: Record<string, unknown>): LuckyIdOption {
  return {
    id: toNumber(raw.id),
    lucky_number: toOptionalNumber(raw.lucky_number),
    status: toOptionalString(raw.status),
    batch: toOptionalNumber(raw.batch),
  };
}

function normalizePartner(raw: Record<string, unknown>): PartnerOption {
  return {
    id: toNumber(raw.id),
    username: toOptionalString(raw.username),
    phone: toOptionalString(raw.phone),
  };
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
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
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
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          disabled={disabled || loading}
          className="h-10 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          onClick={onSearch}
          disabled={disabled || loading}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {selected ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>{renderSelected(selected)}</div>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
            >
              Clear
            </button>
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
              className="w-full rounded-xl border border-border bg-card p-4 text-left transition hover:border-slate-300 hover:bg-muted/40"
            >
              {renderOption(item)}
            </button>
          ))}
        </div>
      ) : null}

      {!selected && !loading && query.trim().length > 0 && results.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      ) : null}
    </div>
  );
}

export default function SubscriptionCreatePage() {
  const searchParams = useSearchParams();
  const searchParamKey = searchParams.toString();
  const [planType, setPlanType] = useState<PlanType>("EMI");

  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [batch, setBatch] = useState<BatchOption | null>(null);
  const [luckyId, setLuckyId] = useState<LuckyIdOption | null>(null);
  const [partner, setPartner] = useState<PartnerOption | null>(null);

  const [customerQuery, setCustomerQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [batchQuery, setBatchQuery] = useState("");
  const [luckyQuery, setLuckyQuery] = useState("");
  const [partnerQuery, setPartnerQuery] = useState("");

  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [productResults, setProductResults] = useState<ProductOption[]>([]);
  const [batchResults, setBatchResults] = useState<BatchOption[]>([]);
  const [luckyResults, setLuckyResults] = useState<LuckyIdOption[]>([]);
  const [partnerResults, setPartnerResults] = useState<PartnerOption[]>([]);

  const [customerLoading, setCustomerLoading] = useState(false);
  const [productLoading, setProductLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [luckyLoading, setLuckyLoading] = useState(false);
  const [partnerLoading, setPartnerLoading] = useState(false);

  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualTenureMonths, setManualTenureMonths] = useState("12");

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

  const returnToLeadHref = useMemo(() => {
    if (!success || !leadContext?.lead) return null;

    const params = new URLSearchParams();
    if (success.customer) params.set("converted_customer", String(success.customer));
    params.set("converted_subscription", String(success.id));
    return `/admin/leads/${leadContext.lead}?${params.toString()}`;
  }, [leadContext?.lead, success]);

  const isEmiPlan = planType === "EMI";

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

  const canSubmit = useMemo(() => {
    if (!customer || !product || !startDate) return false;
    if (!tenureMonths || tenureMonths <= 0) return false;
    if (isEmiPlan && !batch) return false;
    return true;
  }, [customer, product, startDate, tenureMonths, isEmiPlan, batch]);

  async function runCustomerSearch() {
    if (!customerQuery.trim()) return;
    setCustomerLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<unknown>(
        `/admin/customers/?q=${encodeURIComponent(customerQuery.trim())}`
      );
      setCustomerResults(
        toArray<Record<string, unknown>>(payload).map(normalizeCustomer)
      );
    } catch (err) {
      setError(toErrorMessage(err));
      setCustomerResults([]);
    } finally {
      setCustomerLoading(false);
    }
  }

  async function runProductSearch() {
    if (!productQuery.trim()) return;
    setProductLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<unknown>(
        `/admin/products/?q=${encodeURIComponent(productQuery.trim())}`
      );
      setProductResults(
        toArray<Record<string, unknown>>(payload).map(normalizeProduct)
      );
    } catch (err) {
      setError(toErrorMessage(err));
      setProductResults([]);
    } finally {
      setProductLoading(false);
    }
  }

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

  async function runLuckySearch() {
    if (!batch?.id) {
      setError("Select an open batch before searching Lucky IDs.");
      return;
    }

    setLuckyLoading(true);
    setError(null);
    setGlobalLoadingLabel("Loading available Lucky IDs...");
    try {
      const payload = await apiFetch<unknown>(
        `/admin/lucky-ids/available/?batch_id=${encodeURIComponent(String(batch.id))}`
      );
      const rows = toArray<Record<string, unknown>>(payload)
        .map(normalizeLuckyId)
        .filter((item) =>
          luckyQuery.trim()
            ? String(item.lucky_number ?? item.id).includes(luckyQuery.trim())
            : true
        );
      setLuckyResults(rows);
    } catch (err) {
      setError(toErrorMessage(err));
      setLuckyResults([]);
    } finally {
      setLuckyLoading(false);
      setGlobalLoadingLabel(null);
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
            setBatch(null);
            setLuckyId(null);
            setBatchResults([]);
            setLuckyResults([]);
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
              setCustomerQuery(`${normalized.name} ${normalized.phone}`.trim());
              setCustomerResults([]);
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

  function resetForAnotherCreate() {
    setPlanType("EMI");
    setCustomer(null);
    setProduct(null);
    setBatch(null);
    setLuckyId(null);
    setPartner(null);

    setCustomerQuery("");
    setProductQuery("");
    setBatchQuery("");
    setLuckyQuery("");
    setPartnerQuery("");

    setCustomerResults([]);
    setProductResults([]);
    setBatchResults([]);
    setLuckyResults([]);
    setPartnerResults([]);

    setStartDate(new Date().toISOString().slice(0, 10));
    setManualTenureMonths("12");

    setError(null);
    setSuccess(null);
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);

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

    setSubmitting(true);
    setGlobalLoadingLabel("Creating subscription and applying contract rules...");

    try {
      const body: Record<string, unknown> = {
        customer: customer.id,
        product: product.id,
        partner: partner?.id ?? null,
        plan_type: planType,
        tenure_months: tenureMonths,
        start_date: startDate,
      };

      if (isEmiPlan) {
        body.batch = batch?.id ?? null;
        body.lucky_id = luckyId?.id ?? null;
      } else {
        body.batch = null;
        body.lucky_id = null;
      }

      const created = await apiFetch<CreatedSubscriptionResponse>(
        "/admin/subscriptions/",
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );

      setSuccess(created);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSubmitting(false);
      setGlobalLoadingLabel(null);
    }
  }

  return (
    <PortalPage
      title="Create Subscription"
      subtitle="Search-first contract creation flow for customer, product, plan, batch, Lucky ID, and start date."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Subscriptions", href: "/admin/subscriptions" },
        { label: "Create" },
      ]}
      actions={[
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
      ]}
      stats={[
        {
          label: "Plan Type",
          value: planType,
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
          label: "Default EMI",
          value: money(monthlyAmount),
        },
      ]}
      statusBadge={{
        label: "Contract Creation",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <SectionCard
          title="Creation rules"
          description="Product base price is treated as total contract price. Default EMI is total contract price divided by tenure months."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailValue label="Contract Value Source" value="Product base price" />
            <DetailValue label="Default EMI Formula" value="base price / tenure months" />
            <DetailValue
              label="EMI Plan Rule"
              value="Batch required, Lucky ID optional"
            />
            <DetailValue
              label="Lucky ID Behavior"
              value={
                isEmiPlan
                  ? luckyId
                    ? `Manual Lucky #${luckyId.lucky_number ?? luckyId.id}`
                    : "Auto-assign first available if left empty"
                  : "Not used for rent/lease"
              }
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Step 1 · Contract parties"
          description="Select the customer, product, and optional partner context for this subscription."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <SearchPanel<CustomerOption>
              title="Customer"
              description="Search by customer name or phone."
              query={customerQuery}
              setQuery={setCustomerQuery}
              onSearch={runCustomerSearch}
              loading={customerLoading}
              selected={customer}
              onClear={() => {
                setCustomer(null);
                setCustomerResults([]);
              }}
              results={customerResults}
              renderSelected={(item) => (
                <div>
                  <div className="font-medium text-foreground">
                    {item.name} ({item.phone})
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    KYC {item.kyc_status || "—"}
                  </div>
                </div>
              )}
              renderOption={(item) => (
                <div>
                  <div className="font-medium text-foreground">
                    {item.name} ({item.phone})
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    KYC {item.kyc_status || "—"}
                  </div>
                </div>
              )}
              onSelect={(item) => {
                setCustomer(item);
                setCustomerResults([]);
                setError(null);
                setSuccess(null);
              }}
              placeholder="Search customer by name or phone"
            />

            <SearchPanel<ProductOption>
              title="Product"
              description="Search by product name or product code."
              query={productQuery}
              setQuery={setProductQuery}
              onSearch={runProductSearch}
              loading={productLoading}
              selected={product}
              onClear={() => {
                setProduct(null);
                setProductResults([]);
                setBatch(null);
                setLuckyId(null);
              }}
              results={productResults}
              renderSelected={(item) => (
                <div>
                  <div className="font-medium text-foreground">
                    {item.name} {item.product_code ? `(${item.product_code})` : ""}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Base price {money(item.base_price)}
                  </div>
                </div>
              )}
              renderOption={(item) => (
                <div>
                  <div className="font-medium text-foreground">
                    {item.name} {item.product_code ? `(${item.product_code})` : ""}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Base price {money(item.base_price)} · {item.category || "—"} /{" "}
                    {item.subcategory || "—"}
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

            <SearchPanel<PartnerOption>
              title="Partner (optional)"
              description="Attach a partner to the contract when applicable."
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

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Plan Type</h3>
                <p className="text-xs text-muted-foreground">
                  EMI requires batch linkage. Rent and lease use manual tenure.
                </p>
              </div>

              <div className="mt-4">
                <select
                  value={planType}
                  onChange={(event) => {
                    const nextPlanType = event.target.value as PlanType;
                    setPlanType(nextPlanType);
                    setBatch(null);
                    setLuckyId(null);
                    setBatchResults([]);
                    setLuckyResults([]);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                >
                  <option value="EMI">EMI</option>
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
                <SearchPanel<BatchOption>
                  title="Batch (Open only)"
                  description="EMI subscriptions must be linked to an open batch."
                  query={batchQuery}
                  setQuery={setBatchQuery}
                  onSearch={runBatchSearch}
                  loading={batchLoading}
                  selected={batch}
                  onClear={() => {
                    setBatch(null);
                    setLuckyId(null);
                    setBatchResults([]);
                    setLuckyResults([]);
                  }}
                  results={batchResults}
                  renderSelected={(item) => (
                    <div>
                      <div className="font-medium text-foreground">
                        {item.batch_code || `Batch #${item.id}`}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.duration_months || 0} months · {item.status || "—"}
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
                    </div>
                  )}
                  onSelect={(item) => {
                    setBatch(item);
                    setLuckyId(null);
                    setBatchResults([]);
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="Search batch by code"
                />

                <SearchPanel<LuckyIdOption>
                  title="Lucky ID (optional)"
                  description="Leave empty to allow automatic first-available allocation."
                  query={luckyQuery}
                  setQuery={setLuckyQuery}
                  onSearch={runLuckySearch}
                  loading={luckyLoading}
                  selected={luckyId}
                  onClear={() => {
                    setLuckyId(null);
                    setLuckyResults([]);
                  }}
                  results={luckyResults}
                  renderSelected={(item) => (
                    <div>
                      <div className="font-medium text-foreground">
                        Lucky #{item.lucky_number ?? item.id}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.status || "AVAILABLE"}
                      </div>
                    </div>
                  )}
                  renderOption={(item) => (
                    <div>
                      <div className="font-medium text-foreground">
                        Lucky #{item.lucky_number ?? item.id}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.status || "AVAILABLE"}
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
              </>
            ) : (
              <div className="lg:col-span-2">
                <EmptyState
                  title="Batch and Lucky ID not required"
                  description="Rent and lease plans are created without batch or Lucky ID allocation."
                />
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
              value={partner?.username || "—"}
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
              label="Default EMI"
              value={money(monthlyAmount)}
            />
          </div>
        </SectionCard>

        {globalLoadingLabel ? <LoadingBlock label={globalLoadingLabel} /> : null}

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
          <ErrorState
            title="Unable to create subscription"
            description={error}
            onRetry={canSubmit ? handleSubmit : undefined}
          />
        ) : null}

        {success ? (
          <SectionCard
            title="Subscription created"
            description="The contract was created successfully and is ready for downstream workflows."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailValue label="Subscription ID" value={`#${success.id}`} />
              <DetailValue label="Plan Type" value={success.plan_type || planType} />
              <DetailValue label="Status" value={success.status || "ACTIVE"} />
              <DetailValue
                label="Monthly EMI"
                value={money(success.monthly_amount || monthlyAmount)}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/admin/subscriptions/${success.id}`}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Open Subscription
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
                onClick={resetForAnotherCreate}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Create Another
              </button>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Create contract"
          description="Submit only after verifying customer, product, plan structure, and financial preview."
        >
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating Subscription..." : "Create Subscription"}
            </button>

            <button
              type="button"
              onClick={resetForAnotherCreate}
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
    </PortalPage>
  );
}
