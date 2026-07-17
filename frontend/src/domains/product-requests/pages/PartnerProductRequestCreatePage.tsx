"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Search,
  X,
} from "lucide-react";

import {
  createPartnerProductRequest,
  getProductRequestOptions,
  type ProductRequestBatchOption,
  type ProductRequestCreateResponse,
  type ProductRequestOptions,
  type ProductRequestProductOption,
  type ProductRequestType,
} from "@/services/product-requests";
import { listPartnerCustomers, type PartnerCustomerListResponse } from "@/services/partner";
import { resolveApiMediaUrl } from "@/lib/media";

/* ─── helpers ─────────────────────────────────────────────── */

function money(value?: string | number | null): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function deriveMonthlyAmount(
  product: ProductRequestProductOption | null,
  batch: ProductRequestBatchOption | null
): string | null {
  const base = toNumber(product?.base_price);
  const months = toNumber(batch?.duration_months);
  if (base <= 0 || months <= 0) return null;
  return (base / months).toFixed(2);
}

/* ─── Product Picker ───────────────────────────────────────── */

function ProductPicker({
  products,
  selectedId,
  onSelect,
}: {
  products: ProductRequestProductOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Derived category/subcategory lists
  const categories = useMemo(() => {
    const cats = Array.from(
      new Set(products.map((p) => p.category?.trim()).filter(Boolean))
    ) as string[];
    return cats.sort();
  }, [products]);

  const subcategories = useMemo(() => {
    if (!category) return [];
    const subs = Array.from(
      new Set(
        products
          .filter((p) => p.category?.trim() === category)
          .map((p) => p.subcategory?.trim())
          .filter(Boolean)
      )
    ) as string[];
    return subs.sort();
  }, [products, category]);

  // Reset subcategory when category changes
  useEffect(() => {
    setSubcategory("");
  }, [category]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter((p) => {
      if (category && p.category?.trim() !== category) return false;
      if (subcategory && p.subcategory?.trim() !== subcategory) return false;
      if (q) {
        return (
          p.name.toLowerCase().includes(q) ||
          (p.product_code?.toLowerCase() ?? "").includes(q) ||
          (p.category?.toLowerCase() ?? "").includes(q)
        );
      }
      return true;
    });
  }, [products, category, subcategory, search]);

  const selectedProduct = products.find((p) => String(p.id) === selectedId);

  function handleSelect(id: string) {
    onSelect(id === selectedId ? "" : id);
  }

  function clearAll() {
    setSearch("");
    setCategory("");
    setSubcategory("");
  }

  const hasFilters = search || category || subcategory;

  return (
    <div className="space-y-3">
      {/* Selected product banner */}
      {selectedProduct ? (
        <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-foreground truncate">{selectedProduct.name}</div>
            <div className="text-xs text-muted-foreground">
              {selectedProduct.product_code || ""}
              {selectedProduct.base_price ? ` · ₹${Number(selectedProduct.base_price).toLocaleString("en-IN")}` : ""}
              {selectedProduct.category ? ` · ${selectedProduct.category}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelect("")}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear selection"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {/* Search bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products by name or code…"
          className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Category pills */}
      {categories.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Category
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategory("")}
              className={`h-8 rounded-full border px-3 text-xs font-bold transition ${
                !category
                  ? "border-primary/40 bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(category === cat ? "" : cat)}
                className={`h-8 rounded-full border px-3 text-xs font-bold transition ${
                  category === cat
                    ? "border-primary/40 bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Subcategory pills */}
      {subcategories.length > 1 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Subcategory
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSubcategory("")}
              className={`h-8 rounded-full border px-3 text-xs font-bold transition ${
                !subcategory
                  ? "border-primary/40 bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {subcategories.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => setSubcategory(subcategory === sub ? "" : sub)}
                className={`h-8 rounded-full border px-3 text-xs font-bold transition ${
                  subcategory === sub
                    ? "border-primary/40 bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {sub}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Clear filters row */}
      {hasFilters ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} product{filtered.length !== 1 ? "s" : ""} found</span>
          <button type="button" onClick={clearAll} className="font-semibold text-primary hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {products.length} product{products.length !== 1 ? "s" : ""} available
        </p>
      )}

      {/* Product cards grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
          <Search className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No products match your search</p>
          <button type="button" onClick={clearAll} className="text-xs font-semibold text-primary hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {filtered.map((product) => {
            const isSelected = String(product.id) === selectedId;
            const imgUrl = resolveApiMediaUrl(product.image ?? null);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => handleSelect(String(product.id))}
                className={`relative overflow-hidden rounded-2xl border text-left transition active:scale-[0.97] ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-1"
                    : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
                }`}
              >
                {/* Product image */}
                {imgUrl ? (
                  <div className="relative h-28 w-full overflow-hidden bg-muted">
                    <Image
                      src={imgUrl}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 33vw"
                    />
                  </div>
                ) : (
                  <div className="flex h-28 w-full items-center justify-center bg-muted/40">
                    <ImageIcon className="size-8 text-muted-foreground/30" />
                  </div>
                )}

                {/* Selected check */}
                {isSelected ? (
                  <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary shadow">
                    <CheckCircle2 className="size-4 text-primary-foreground" />
                  </span>
                ) : null}

                {/* Category tag */}
                {product.category ? (
                  <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                    {product.category}
                  </span>
                ) : null}

                {/* Info */}
                <div className="p-2.5">
                  <p className="line-clamp-2 text-xs font-bold leading-tight text-foreground">
                    {product.name}
                  </p>
                  {product.subcategory ? (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{product.subcategory}</p>
                  ) : null}
                  <p className="mt-1 text-sm font-extrabold text-foreground">
                    ₹{Number(product.base_price || 0).toLocaleString("en-IN")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Batch & Lucky Number pickers ──────────────────────────── */

function BatchPicker({
  batches,
  selectedId,
  onSelect,
}: {
  batches: ProductRequestBatchOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (batches.length === 0) {
    return <p className="text-sm text-muted-foreground">No open batches available.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {batches.map((b) => {
        const isSelected = String(b.id) === selectedId;
        const slots = b.available_slots ?? 0;
        const hasSlots = slots > 0;
        return (
          <button
            key={b.id}
            type="button"
            disabled={!hasSlots}
            onClick={() => onSelect(String(b.id))}
            className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
              isSelected
                ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-1"
                : hasSlots
                ? "border-border bg-card hover:border-primary/40 hover:shadow-sm active:scale-[0.98]"
                : "cursor-not-allowed border-border bg-muted opacity-50"
            }`}
          >
            <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {isSelected ? <CheckCircle2 className="size-4" /> : <ChevronRight className="size-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{b.batch_code || `Batch #${b.id}`}</p>
              <p className="text-xs text-muted-foreground">
                {b.duration_months ? `${b.duration_months} months` : "—"}
                {b.start_date ? ` · starts ${b.start_date}` : ""}
              </p>
              <p className={`mt-1 text-[11px] font-semibold ${hasSlots ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                {hasSlots ? `${slots} slot${slots !== 1 ? "s" : ""} open` : "Full"}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function LuckyNumberPicker({
  numbers,
  selectedNumber,
  onSelect,
  disabled,
}: {
  numbers: number[];
  selectedNumber: string;
  onSelect: (n: string) => void;
  disabled: boolean;
}) {
  if (disabled) {
    return <p className="text-sm text-muted-foreground">Select a batch first to see available lucky numbers.</p>;
  }
  if (numbers.length === 0) {
    return <p className="text-sm text-amber-600 dark:text-amber-400">No lucky numbers available in this batch.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {numbers.map((n) => {
        const isSelected = String(n) === selectedNumber;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onSelect(String(n))}
            className={`flex size-10 items-center justify-center rounded-xl border text-sm font-bold transition active:scale-95 ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground shadow"
                : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5"
            }`}
          >
            {String(n).padStart(2, "0")}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Step indicator ────────────────────────────────────────── */

const STEPS = ["Customer", "Product", "Batch & #", "Confirm"] as const;
type Step = 0 | 1 | 2 | 3;

function StepBar({ step, requestType }: { step: Step, requestType: ProductRequestType }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {i > 0 ? <div className={`h-0.5 flex-1 ${done ? "bg-primary" : "bg-border"}`} /> : <div className="flex-1" />}
              <div className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                  ? "border-primary bg-background text-primary"
                  : "border-border bg-background text-muted-foreground"
              }`}>
                {done ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 ? <div className={`h-0.5 flex-1 ${i < step - 1 ? "bg-primary" : "bg-border"}`} /> : <div className="flex-1" />}
            </div>
            <span className={`mt-1 text-[10px] font-semibold ${active ? "text-primary" : done ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────── */

export default function PartnerProductRequestCreatePage({
  queryString,
}: {
  queryString?: string;
}) {
  const runtimeSearchParams = useSearchParams();
  const defaultProduct = runtimeSearchParams.get("product") || "";
  const requestTypeParam = (runtimeSearchParams.get("type") as ProductRequestType) || "ADVANCE_EMI";
  const [requestType, setRequestType] = useState<ProductRequestType>(requestTypeParam);

  const [options, setOptions] = useState<ProductRequestOptions>({
    products: [],
    batches: [],
    lucky_numbers: [],
  });
  const [customers, setCustomers] = useState<PartnerCustomerListResponse["results"]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ProductRequestCreateResponse | null>(null);
  const [step, setStep] = useState<Step>(0);

  // Form state
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerCity, setNewCustomerCity] = useState("");
  const [productId, setProductId] = useState(defaultProduct);
  const [batchId, setBatchId] = useState("");
  const [luckyNumber, setLuckyNumber] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [opts, custs] = await Promise.all([
          getProductRequestOptions("partner"),
          listPartnerCustomers(),
        ]);
        setOptions(opts);
        setCustomers(custs.results || []);
        if (defaultProduct) setStep(1);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [defaultProduct]);

  // Refresh lucky numbers when batch changes
  useEffect(() => {
    async function refreshBatch() {
      if (!batchId || requestType !== "ADVANCE_EMI") { setLuckyNumber(""); return; }
      try {
        const payload = await getProductRequestOptions("partner", { batchId });
        setOptions(payload);
        const nextLucky = payload.lucky_numbers[0];
        setLuckyNumber((cur) =>
          cur && payload.lucky_numbers.includes(Number(cur)) ? cur : nextLucky !== undefined ? String(nextLucky) : ""
        );
      } catch { /* silent */ }
    }
    void refreshBatch();
  }, [batchId]);

  const selectedProduct = useMemo(
    () => options?.products.find((p) => String(p.id) === productId) ?? null,
    [options, productId]
  );
  const selectedBatch = useMemo(
    () => options?.batches.find((b) => String(b.id) === batchId) ?? null,
    [options, batchId]
  );
  const derivedMonthly = useMemo(
    () => deriveMonthlyAmount(selectedProduct, selectedBatch),
    [selectedProduct, selectedBatch]
  );

  const selectedCustomerLabel = useMemo(() => {
    if (customerMode === "new") return newCustomerName || "New customer";
    const c = customers.find((c) => String(c.id) === customerId);
    return c ? `${c.name} (${c.phone})` : "";
  }, [customerMode, customerId, customers, newCustomerName]);

  function validateStep(s: Step): string | null {
    if (s === 0) {
      if (customerMode === "existing" && !customerId) return "Please select a customer.";
      if (customerMode === "new" && (!newCustomerName || !newCustomerPhone))
        return "Name and phone are required.";
    }
    if (s === 1 && !productId) return "Please select a product.";
    if (s === 2 && requestType === "ADVANCE_EMI") {
      if (!batchId) return "Please select a batch.";
      if (!luckyNumber) return "Please pick a lucky number.";
    }
    return null;
  }

  function goNext() {
    setSubmitError(null);
    const err = validateStep(step);
    if (err) { setSubmitError(err); return; }
    
    if (step === 1 && requestType !== "ADVANCE_EMI") {
      setStep(3); // skip batch step
      return;
    }
    setStep((s) => Math.min(s + 1, 3) as Step);
  }

  function goBack() {
    setSubmitError(null);
    if (step === 3 && requestType !== "ADVANCE_EMI") {
      setStep(1); // skip batch step
      return;
    }
    setStep((s) => Math.max(s - 1, 0) as Step);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        product_id: Number(productId),
        request_type: requestType,
        batch_id: requestType === "ADVANCE_EMI" ? Number(batchId) : undefined,
        preferred_lucky_number: requestType === "ADVANCE_EMI" ? Number(luckyNumber) : undefined,
        notes: notes.trim() || undefined,
      };
      if (customerMode === "existing") {
        payload.customer_id = Number(customerId);
      } else {
        payload.requested_customer_name = newCustomerName;
        payload.requested_customer_phone = newCustomerPhone;
        payload.requested_customer_email = newCustomerEmail;
        payload.requested_customer_address = newCustomerAddress;
        payload.requested_customer_city = newCustomerCity;
      }
      const res = await createPartnerProductRequest(payload as Parameters<typeof createPartnerProductRequest>[0]);
      setSuccess(res);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── loading / error / success ── */
  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading form…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 size-8 text-destructive" />
          <h2 className="text-lg font-bold text-destructive">Could not load form</h2>
          <p className="mt-1 text-sm text-destructive/80">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-4 size-14 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Request Submitted!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your request #{success.id} is pending admin review. We&apos;ll notify you when it&apos;s approved.
          </p>
          {success.product_name ? (
            <div className="mt-4 rounded-xl bg-muted/50 p-3 text-sm">
              <span className="font-semibold">{success.product_name}</span>
              {success.batch_code ? ` · ${success.batch_code}` : ""}
            </div>
          ) : null}
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/partner/product-requests"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition active:scale-95"
            >
              View My Requests
            </Link>
            <button
              type="button"
              onClick={() => {
                setSuccess(null);
                setProductId("");
                setBatchId("");
                setLuckyNumber("");
                setNotes("");
                setCustomerId("");
                setNewCustomerName("");
                setNewCustomerPhone("");
                setStep(0);
              }}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-border bg-transparent px-4 text-sm font-bold text-foreground transition active:scale-95"
            >
              Submit Another Request
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-3 py-4 sm:px-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={step > 0 ? goBack : undefined}
          className="rounded-full bg-muted p-2 text-muted-foreground disabled:opacity-40"
          disabled={step === 0}
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-foreground">New {requestType === "ADVANCE_EMI" ? "Plan" : "Product"} Request</h1>
          <p className="text-xs text-muted-foreground">Step {requestType === "ADVANCE_EMI" ? step + 1 : step === 3 ? 3 : step + 1} of {requestType === "ADVANCE_EMI" ? STEPS.length : 3}</p>
        </div>
        <Link
          href="/partner/subscription-requests"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
        >
          <X className="size-5" />
        </Link>
      </div>

      {/* Step bar */}
      {requestType === "ADVANCE_EMI" ? (
        <StepBar step={step} requestType={requestType} />
      ) : null}

      {/* Step error */}
      {submitError ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p className="text-sm font-medium">{submitError}</p>
        </div>
      ) : null}

      {/* ── Step 0: Customer ── */}
      {step === 0 ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="font-bold text-foreground">Who is this for?</h2>

          <div className="flex rounded-lg bg-muted p-1">
            {(["existing", "new"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCustomerMode(mode)}
                className={`flex-1 rounded-md py-2 text-xs font-bold transition ${
                  customerMode === mode ? "bg-background shadow text-foreground" : "text-muted-foreground"
                }`}
              >
                {mode === "existing" ? "Existing Customer" : "New Customer"}
              </button>
            ))}
          </div>

          {customerMode === "existing" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Select Customer *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Choose a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                ))}
              </select>
              {customers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No customers linked yet.{" "}
                  <button type="button" onClick={() => setCustomerMode("new")} className="font-semibold text-primary underline">
                    Add new customer
                  </button>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { key: "name", label: "Full Name *", value: newCustomerName, setter: setNewCustomerName, type: "text", placeholder: "e.g. Rahul Sharma" },
                { key: "phone", label: "Phone Number *", value: newCustomerPhone, setter: setNewCustomerPhone, type: "tel", placeholder: "e.g. 9876543210" },
                { key: "email", label: "Email (optional)", value: newCustomerEmail, setter: setNewCustomerEmail, type: "email", placeholder: "e.g. rahul@example.com" },
                { key: "city", label: "City (optional)", value: newCustomerCity, setter: setNewCustomerCity, type: "text", placeholder: "e.g. Mumbai" },
                { key: "address", label: "Address (optional)", value: newCustomerAddress, setter: setNewCustomerAddress, type: "text", placeholder: "Street / locality" },
              ].map(({ key, label, value, setter, type, placeholder }) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{label}</label>
                  <input
                    type={type}
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    placeholder={placeholder}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Step 1: Product ── */}
      {step === 1 ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div>
            <h2 className="font-bold text-foreground">Choose a Product</h2>
            <p className="text-xs text-muted-foreground">Filter by category, search by name, then tap to select</p>
          </div>
          <ProductPicker
            products={options?.products ?? []}
            selectedId={productId}
            onSelect={setProductId}
          />
        </div>
      ) : null}

      {/* ── Step 2: Batch & Lucky Number ── */}
      {step === 2 ? (
        <div className="space-y-5">
          {/* Product summary */}
          {selectedProduct ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                {resolveApiMediaUrl(selectedProduct.image ?? null) ? (
                  <Image
                    src={resolveApiMediaUrl(selectedProduct.image ?? null)!}
                    alt={selectedProduct.name}
                    width={40}
                    height={40}
                    className="h-10 w-10 object-cover"
                  />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground/40" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{selectedProduct.name}</p>
                <p className="text-xs text-muted-foreground">₹{Number(selectedProduct.base_price || 0).toLocaleString("en-IN")}</p>
              </div>
              <button
                type="button"
                onClick={() => { setStep(1); setBatchId(""); setLuckyNumber(""); }}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Change
              </button>
            </div>
          ) : null}

          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div>
              <h2 className="font-bold text-foreground">Pick a Batch</h2>
              <p className="text-xs text-muted-foreground">Choose an open batch with available lucky ID slots</p>
            </div>
            <BatchPicker
              batches={options?.batches ?? []}
              selectedId={batchId}
              onSelect={setBatchId}
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div>
              <h2 className="font-bold text-foreground">Choose Lucky Number</h2>
              <p className="text-xs text-muted-foreground">Available lucky IDs in the selected batch</p>
            </div>
            <LuckyNumberPicker
              numbers={options?.lucky_numbers ?? []}
              selectedNumber={luckyNumber}
              onSelect={setLuckyNumber}
              disabled={!batchId}
            />
          </div>

          {/* Monthly EMI preview */}
          {productId && batchId && derivedMonthly ? (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Monthly EMI</p>
                <p className="text-2xl font-extrabold text-emerald-800 dark:text-emerald-200">{money(derivedMonthly)}</p>
              </div>
              <div className="text-right text-xs text-emerald-600 dark:text-emerald-400">
                <p>Total ₹{Number(selectedProduct?.base_price || 0).toLocaleString("en-IN")}</p>
                <p>{selectedBatch?.duration_months} months</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Step 3: Confirm ── */}
      {step === 3 ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
            <h2 className="font-bold text-foreground">Review &amp; Confirm</h2>
            {[
              { label: "Customer", value: selectedCustomerLabel, show: true },
              { label: "Product", value: selectedProduct?.name ?? "—", show: true },
              { label: "Request Type", value: requestType, show: true },
              {
                label: "Batch",
                value: selectedBatch
                  ? `${selectedBatch.batch_code} · ${selectedBatch.duration_months} months`
                  : "—",
                show: requestType === "ADVANCE_EMI"
              },
              { label: "Lucky Number", value: luckyNumber ? `#${luckyNumber.padStart(2, "0")}` : "—", show: requestType === "ADVANCE_EMI" },
              { label: "Monthly EMI", value: derivedMonthly ? money(derivedMonthly) : "—", show: requestType === "ADVANCE_EMI" },
            ]
              .filter((x) => x.show)
              .map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                <span className="text-sm font-semibold text-foreground text-right max-w-[60%] break-words">{value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any special instructions or comments…"
              className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            {requestType === "ADVANCE_EMI" 
              ? "This is a request only — not a live contract. Admin approval creates your subscription, EMI schedule, and lucky draw assignment."
              : "This is a request only. The admin will review it and coordinate the next steps."}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition active:scale-95 disabled:opacity-60"
          >
            {submitting ? (
              <><Loader2 className="mr-2 size-4 animate-spin" /> Submitting…</>
            ) : (
              "Submit Request"
            )}
          </button>
        </form>
      ) : null}

      {/* Navigation buttons (steps 0–2) */}
      {step < 3 ? (
        <div className="flex gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-bold text-foreground transition active:scale-95"
            >
              <ChevronLeft className="size-4" /> Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={goNext}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition active:scale-95"
          >
            {(step === 2 || (step === 1 && requestType !== "ADVANCE_EMI")) ? "Review" : "Next"} <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
