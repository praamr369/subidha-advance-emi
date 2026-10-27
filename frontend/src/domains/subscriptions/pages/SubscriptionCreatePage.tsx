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
import ProductSelector from "@/components/admin/products/ProductSelector";
import PartnerSelector from "@/components/admin/partners/PartnerSelector";
import type { CustomerRecord } from "@/services/customers";
import KycReadinessPanel from "@/domains/subscriptions/components/KycReadinessPanel";
import type { ContractKycReadiness } from "@/services/kyc-readiness";
import SignatureCanvas from "@/components/forms/SignatureCanvas";
import { CustomerSignatureLinkModal } from "@/components/contracts/CustomerSignatureLinkModal";

type PlanType = "EMI" | "RENT" | "LEASE";
type SubscriptionCreateVariant = "page" | "drawer";

type CustomerOption = {
  id: number;
  name: string;
  phone: string;
  kyc_status?: string;
  profile_photo_url?: string | null;
};

export function isCustomerKycApproved(status?: string | null): boolean {
  if (!status) return false;
  const s = status.trim().toUpperCase();
  return s === "VERIFIED" || s === "APPROVED" || s === "EXCEPTION_APPROVED";
}

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

export type ContractBasketItem = {
  id: string;
  product: ProductOption;
  quantity: number;
  unit_base_price: string;
  monthly_yield_percent: string;
  security_deposit_percent: string;
  security_deposit_amount?: string;
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
    profile_photo_url: toOptionalString(raw.profile_photo_url ?? raw.profile_photo),
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
  const [planType, setPlanType] = useState<PlanType | null>(null);

  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [contractItems, setContractItems] = useState<ContractBasketItem[]>([]);
  const [addingProduct, setAddingProduct] = useState(false);
  const [batch, setBatch] = useState<BatchOption | null>(null);
  const [luckyId, setLuckyId] = useState<LuckyIdOption | null>(null);
  const [partner, setPartner] = useState<PartnerOption | null>(null);

  function addProductToBasket(item: ProductOption) {
    setContractItems((prev) => {
      const existingIndex = prev.findIndex((p) => p.product.id === item.id);
      if (existingIndex >= 0) {
        return prev.map((p, idx) =>
          idx === existingIndex ? { ...p, quantity: p.quantity + 1 } : p
        );
      }
      const newItem: ContractBasketItem = {
        id: `item-${item.id}-${Date.now()}`,
        product: item,
        quantity: 1,
        unit_base_price: item.base_price || "0.00",
        monthly_yield_percent: yieldRatePercent || "5.00",
        security_deposit_percent: securityDepositPercent || "20.00",
      };
      return [...prev, newItem];
    });
    if (!product) {
      setProduct(item);
    }
    setAddingProduct(false);
  }

  function removeProductFromBasket(id: string) {
    setContractItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      if (next.length > 0) {
        setProduct(next[0].product);
      } else {
        setProduct(null);
      }
      return next;
    });
  }

  function updateBasketQuantity(id: string, qty: number) {
    const clamped = Math.max(1, qty);
    setContractItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, quantity: clamped } : it))
    );
  }

  function updateBasketUnitPrice(id: string, price: string) {
    setContractItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, unit_base_price: price } : it))
    );
  }

  function updateBasketYield(id: string, yieldPct: string) {
    setContractItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, monthly_yield_percent: yieldPct } : it))
    );
  }

  function updateBasketDepositPercent(id: string, depositPct: string) {
    setContractItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, security_deposit_percent: depositPct, security_deposit_amount: undefined } : it))
    );
  }

  function updateBasketDepositAmount(id: string, depositAmt: string) {
    setContractItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, security_deposit_amount: depositAmt } : it))
    );
  }

  function applyGlobalYieldToAll(yieldPct: string) {
    setContractItems((prev) =>
      prev.map((it) => ({ ...it, monthly_yield_percent: yieldPct }))
    );
  }

  function applyGlobalDepositToAll(depositPct: string) {
    setContractItems((prev) =>
      prev.map((it) => ({ ...it, security_deposit_percent: depositPct, security_deposit_amount: undefined }))
    );
  }

  const [securityDepositPercent, setSecurityDepositPercent] = useState("20");
  const [leaseBuyoutAmount, setLeaseBuyoutAmount] = useState("");
  const [ownershipTransferAllowed, setOwnershipTransferAllowed] = useState(false);
  const [handoverNotes, setHandoverNotes] = useState("");
  const [contractTermsSnapshot, setContractTermsSnapshot] = useState("");
  const [yieldRatePercent, setYieldRatePercent] = useState("5.00");
  const [depositPaymentOption, setDepositPaymentOption] = useState<"FULL" | "PARTIAL">("FULL");
  const [depositBufferDays, setDepositBufferDays] = useState("30");
  const [initialDepositPayment, setInitialDepositPayment] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [signatureInputMode, setSignatureInputMode] = useState<"draw" | "upload">("upload");
  const [idDocType, setIdDocType] = useState<string>("AADHAAR");
  const [idDocFile, setIdDocFile] = useState<File | null>(null);
  const [rentAgreementFile, setRentAgreementFile] = useState<File | null>(null);

  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);

  const handlePhotoChange = (file: File | null) => {
    setPhotoFile(file);
    setDocUploadError(null);
    if (photoPreview && photoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }
    if (file) {
      setPhotoPreview(URL.createObjectURL(file));
    } else {
      setPhotoPreview(null);
    }
  };

  const handleSignatureFileChange = (file: File | null) => {
    setSignatureFile(file);
    setDocUploadError(null);
    if (signaturePreview && signaturePreview.startsWith("blob:")) {
      URL.revokeObjectURL(signaturePreview);
    }
    if (file) {
      setSignaturePreview(URL.createObjectURL(file));
    } else {
      setSignaturePreview(null);
    }
  };

  const handleSignatureCanvasChange = (file: File | null, dataUrl: string | null) => {
    setSignatureFile(file);
    setDocUploadError(null);
    if (signaturePreview && signaturePreview.startsWith("blob:")) {
      URL.revokeObjectURL(signaturePreview);
    }
    setSignaturePreview(dataUrl);
  };

  const handleClearSignature = () => {
    if (signaturePreview && signaturePreview.startsWith("blob:")) {
      URL.revokeObjectURL(signaturePreview);
    }
    setSignatureFile(null);
    setSignaturePreview(null);
  };

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
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);

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

  const totalProductBaseValue = useMemo(() => {
    if ((isRentPlan || isLeasePlan) && contractItems.length > 0) {
      return contractItems.reduce(
        (acc, it) => acc + it.quantity * (Number(it.unit_base_price) || 0),
        0
      );
    }
    return Number(product?.base_price ?? 0);
  }, [isRentPlan, isLeasePlan, contractItems, product?.base_price]);

  const monthlyAmount = useMemo(() => {
    if (!tenureMonths || tenureMonths <= 0) return "0.00";
    if (isRentPlan || isLeasePlan) {
      if (contractItems.length > 0) {
        const totalRent = contractItems.reduce((acc, it) => {
          const yieldPct =
            Number(it.monthly_yield_percent) || Number(yieldRatePercent) || 5.0;
          const lineBase = it.quantity * (Number(it.unit_base_price) || 0);
          return acc + (lineBase * yieldPct) / 100;
        }, 0);
        return totalRent.toFixed(2);
      }
      const yieldRateNumber = Number(yieldRatePercent);
      if (Number.isFinite(yieldRateNumber) && yieldRateNumber > 0) {
        return ((totalProductBaseValue * yieldRateNumber) / 100).toFixed(2);
      }
      return "0.00";
    }
    return (totalProductBaseValue / tenureMonths).toFixed(2);
  }, [
    totalProductBaseValue,
    tenureMonths,
    isRentPlan,
    isLeasePlan,
    yieldRatePercent,
    contractItems,
  ]);

  const totalAmount = useMemo(() => {
    if (isRentPlan || isLeasePlan) {
      return Number(monthlyAmount) * tenureMonths;
    }
    return totalProductBaseValue;
  }, [isRentPlan, isLeasePlan, monthlyAmount, tenureMonths, totalProductBaseValue]);

  const depositPercentNumber = useMemo(() => {
    const parsed = Number(securityDepositPercent);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [securityDepositPercent]);

  const securityDepositAmount = useMemo(() => {
    if (isRentPlan || isLeasePlan) {
      if (contractItems.length > 0) {
        const totalDeposit = contractItems.reduce((acc, it) => {
          const lineBase = it.quantity * (Number(it.unit_base_price) || 0);
          if (it.security_deposit_amount && !isNaN(Number(it.security_deposit_amount))) {
            return acc + Number(it.security_deposit_amount);
          }
          const depPct = Number(it.security_deposit_percent) || Number(securityDepositPercent) || 20.0;
          return acc + (lineBase * depPct) / 100;
        }, 0);
        return totalDeposit.toFixed(2);
      }
    }
    const percent = depositPercentNumber;
    if (!percent || percent <= 0) return "0.00";
    return ((totalProductBaseValue * percent) / 100).toFixed(2);
  }, [
    isRentPlan,
    isLeasePlan,
    contractItems,
    securityDepositPercent,
    depositPercentNumber,
    totalProductBaseValue,
  ]);

  const effectiveDepositPercent = useMemo(() => {
    if (totalProductBaseValue <= 0) return securityDepositPercent;
    const depAmt = Number(securityDepositAmount) || 0;
    return ((depAmt / totalProductBaseValue) * 100).toFixed(1);
  }, [totalProductBaseValue, securityDepositAmount, securityDepositPercent]);

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
    if (!planType) return false;
    if (!customer || !startDate) return false;
    if (!tenureMonths || tenureMonths <= 0) return false;
    if (isEmiPlan) {
      if (!product || !batch) return false;
    } else {
      const hasProducts = contractItems.length > 0 || Boolean(product);
      if (!hasProducts) return false;
      if (contractItems.length > 0) {
        const effDep = Number(effectiveDepositPercent) || 0;
        if (effDep < 0 || effDep > 100) return false;
        const anyDisabled = contractItems.some((it) =>
          isRentPlan ? !it.product.is_rent_enabled : !it.product.is_lease_enabled
        );
        if (anyDisabled) return false;
        const anyInvalid = contractItems.some((it) => {
          const y = Number(it.monthly_yield_percent);
          const d = Number(it.security_deposit_percent);
          return isNaN(y) || y <= 0 || isNaN(d) || d < 0;
        });
        if (anyInvalid) return false;
      } else {
        if (depositPercentNumber < 0 || depositPercentNumber > 100) return false;
        const yieldRateNumber = Number(yieldRatePercent);
        if (!Number.isFinite(yieldRateNumber) || yieldRateNumber <= 0) return false;
        if (product) {
          if (isRentPlan && !product.is_rent_enabled) return false;
          if (isLeasePlan && !product.is_lease_enabled) return false;
        }
      }
    }
    return true;
  }, [
    planType,
    customer,
    startDate,
    tenureMonths,
    isEmiPlan,
    product,
    batch,
    contractItems,
    effectiveDepositPercent,
    depositPercentNumber,
    yieldRatePercent,
    isRentPlan,
    isLeasePlan,
  ]);

  /**
   * Every structural reason the submit buttons are disabled, in the same order
   * the form asks for them. Without this the buttons just grey out silently and
   * the operator has no way to tell which field is at fault.
   */
  const submitBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!planType) blockers.push("Choose a plan type.");
    if (!customer) blockers.push("Select a customer.");
    if (isEmiPlan) {
      if (!product) {
        blockers.push("Select a product for EMI.");
      }
      if (!batch) blockers.push("Select an EMI batch.");
    } else {
      if (contractItems.length === 0 && !product) {
        blockers.push(
          `Attach at least one furniture product for this ${isRentPlan ? "RENT" : "LEASE"} contract.`
        );
      } else if (contractItems.length > 0) {
        contractItems.forEach((it) => {
          if (isRentPlan && !it.product.is_rent_enabled) {
            blockers.push(`"${it.product.name}" is not enabled for RENT.`);
          }
          if (isLeasePlan && !it.product.is_lease_enabled) {
            blockers.push(`"${it.product.name}" is not enabled for LEASE.`);
          }
          const y = Number(it.monthly_yield_percent);
          if (isNaN(y) || y <= 0) {
            blockers.push(`"${it.product.name}" has an invalid yield rate (must be > 0%).`);
          }
          const d = Number(it.security_deposit_percent);
          if (isNaN(d) || d < 0) {
            blockers.push(`"${it.product.name}" has an invalid deposit % (cannot be negative).`);
          }
        });
        const effDep = Number(effectiveDepositPercent) || 0;
        if (effDep < 0 || effDep > 100) {
          blockers.push(`Effective security deposit must be between 0% and 100% (currently ${effDep}%).`);
        }
      } else if (product) {
        if (isRentPlan && !product.is_rent_enabled) {
          blockers.push(`"${product.name}" is not enabled for RENT.`);
        }
        if (isLeasePlan && !product.is_lease_enabled) {
          blockers.push(`"${product.name}" is not enabled for LEASE.`);
        }
        if (depositPercentNumber < 0 || depositPercentNumber > 100) {
          blockers.push(
            `Security deposit must be between 0% and 100% (currently ${depositPercentNumber || 0}%).`
          );
        }
        const yieldRateNumber = Number(yieldRatePercent);
        if (!Number.isFinite(yieldRateNumber) || yieldRateNumber <= 0) {
          blockers.push("Yield rate must be greater than zero.");
        }
      }
    }
    if (!startDate) blockers.push("Set a start date.");
    if (!tenureMonths || tenureMonths <= 0) blockers.push("Tenure must be at least 1 month.");
    if (!photoFile && !customer?.profile_photo_url) blockers.push("Customer photo is required.");
    if (!signatureFile) blockers.push("Customer signature is required (draw on screen or upload).");

    if ((isRentPlan || isLeasePlan) && customer) {
      const isApprovedKyc =
        isCustomerKycApproved(customer.kyc_status) ||
        Boolean(kycReadiness?.can_activate) ||
        Boolean(kycReadiness?.kyc_verified) ||
        Boolean(idDocFile);
      if (!isApprovedKyc) {
        blockers.push(
          "Customer KYC must be verified/approved (or an ID document uploaded) before activating a Rent or Lease contract."
        );
      }

      // Supporting residential proof is required for Rent and Lease contracts
      const hasResidentialProof =
        Boolean(rentAgreementFile) ||
        Boolean(kycReadiness?.can_activate) ||
        Boolean(kycReadiness?.present_documents?.includes("ADDRESS_PROOF")) ||
        Boolean(kycReadiness?.required_documents?.some((r) => r.code === "ADDRESS_PROOF" && r.present));
      if (!hasResidentialProof) {
        blockers.push(
          "Supporting residential proof (Rent Agreement or Tenancy document) must be provided for Rent & Lease contract activation."
        );
      }
    }
    return blockers;
  }, [
    planType,
    customer,
    isEmiPlan,
    product,
    batch,
    contractItems,
    effectiveDepositPercent,
    isRentPlan,
    isLeasePlan,
    depositPercentNumber,
    yieldRatePercent,
    startDate,
    tenureMonths,
    photoFile,
    signatureFile,
    idDocFile,
    rentAgreementFile,
    kycReadiness,
  ]);

  // For RENT/LEASE, the activate path is gated on KYC readiness from the backend.
  // If gating is disabled server-side, readiness.can_activate will be true anyway.
  const canActivate = useMemo(() => {
    if (!canSubmit) return false;
    if (isEmiPlan) return canSubmit;
    const isApprovedKyc =
      isCustomerKycApproved(customer?.kyc_status) ||
      Boolean(kycReadiness?.can_activate) ||
      Boolean(kycReadiness?.kyc_verified) ||
      Boolean(idDocFile);
    if (!isApprovedKyc) return false;
    if (kycReadiness && !kycReadiness.can_activate && !idDocFile && !isApprovedKyc) return false;
    return true;
  }, [canSubmit, isEmiPlan, kycReadiness, idDocFile, customer]);

  // Save as Draft is always allowed when the form structure is complete (no KYC gate).
  const canSaveAsDraft = useMemo(() => {
    if (isEmiPlan) return false;
    if (!customer || !startDate) return false;
    if (contractItems.length === 0 && !product) return false;
    if (!tenureMonths || tenureMonths <= 0) return false;
    if (contractItems.length > 0) {
      const anyDisabled = contractItems.some((it) =>
        isRentPlan ? !it.product.is_rent_enabled : !it.product.is_lease_enabled
      );
      if (anyDisabled) return false;
      const anyInvalid = contractItems.some((it) => {
        const y = Number(it.monthly_yield_percent);
        const d = Number(it.security_deposit_percent);
        return isNaN(y) || y <= 0 || isNaN(d) || d < 0;
      });
      if (anyInvalid) return false;
    } else if (product) {
      if (isRentPlan && !product.is_rent_enabled) return false;
      if (isLeasePlan && !product.is_lease_enabled) return false;
      if (depositPercentNumber < 0 || depositPercentNumber > 100) return false;
    }
    return true;
  }, [
    isEmiPlan,
    customer,
    startDate,
    contractItems,
    product,
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
      const payload = await apiFetch(`/admin/products/search/?q=${encodeURIComponent(productQuery.trim())}`);
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
      const payload = await apiFetch(`/admin/partners/search/?q=${encodeURIComponent(partnerQuery.trim())}`);
      const normalized = toArray<Record<string, unknown>>(payload).map(normalizePartner);
      setPartnerResults(normalized);
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
              // The search picker already filters by plan mode; the prefill path
              // must apply the same rule or the form silently blocks every submit.
              const modeOk = isEmiPlan
                ? normalized.is_emi_enabled !== false
                : isRentPlan
                  ? Boolean(normalized.is_rent_enabled)
                  : isLeasePlan
                    ? Boolean(normalized.is_lease_enabled)
                    : true;
              if (!modeOk) {
                messages.push(
                  `"${normalized.name}" was not applied because it is not enabled for ${planType} contracts. Enable ${planType} on the product, or pick another product.`
                );
              } else {
                setProduct(normalized);
                setProductQuery(
                  normalized.product_code
                    ? `${normalized.name} ${normalized.product_code}`
                    : normalized.name
                );
                setProductResults([]);
              }
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
    setPlanType(null);
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

    setPhotoFile(null);
    setSignatureFile(null);
    setPhotoPreview(null);
    setSignaturePreview(null);
    setIdDocFile(null);
    setRentAgreementFile(null);

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

    if (isEmiPlan) {
      if (!product) {
        setError("Product is required for EMI subscription.");
        return;
      }
      if (!batch) {
        setError("Batch is required for EMI subscription.");
        return;
      }
    } else {
      if (contractItems.length === 0 && !product) {
        setError(`Please attach at least one furniture product for this ${planType} contract.`);
        return;
      }
    }

    if (!startDate) {
      setError("Start date is required.");
      return;
    }

    if (!tenureMonths || tenureMonths <= 0) {
      setError("Tenure must be greater than zero.");
      return;
    }

    if (!isEmiPlan) {
      const depCheck = contractItems.length > 0 ? Number(effectiveDepositPercent) : depositPercentNumber;
      if (depCheck < 0 || depCheck > 100) {
        setError(`Security deposit percent must be between 0 and 100 (currently ${depCheck}%).`);
        return;
      }
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
          product: product!.id,
          partner: partner?.id ?? null,
          plan_type: planType ?? "EMI",
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
        const primaryProd = contractItems.length > 0 ? contractItems[0].product : product!;
        const itemsPayload =
          contractItems.length > 0
            ? contractItems.map((it) => ({
                product: it.product.id,
                quantity: it.quantity,
                unit_base_price: it.unit_base_price,
                monthly_yield_percent: it.monthly_yield_percent || yieldRatePercent,
                security_deposit_percent: it.security_deposit_percent || securityDepositPercent,
                security_deposit_amount: it.security_deposit_amount || undefined,
              }))
            : undefined;

        const body: Record<string, unknown> = {
          customer: customer.id,
          product: primaryProd.id,
          items: itemsPayload,
          tenure_months: tenureMonths,
          start_date: startDate,
          security_deposit_percent: Number(effectiveDepositPercent) || depositPercentNumber,
          monthly_yield_percent: Number(yieldRatePercent) || 5.0,
          handover_notes: handoverNotes || "",
          contract_terms_snapshot: contractTermsSnapshot || "",
          save_as_draft: asDraft,
          deposit_payment_option: depositPaymentOption,
          deposit_buffer_days: Number(depositBufferDays) || 30,
          initial_deposit_payment: initialDepositPayment.trim()
            ? Number(initialDepositPayment)
            : depositPaymentOption === "FULL"
              ? securityDepositAmount
              : null,
        };

        created = await apiFetch<CreatedSubscriptionResponse>("/admin/contracts/rent/", {
          method: "POST",
          body: JSON.stringify(body),
        });
      } else {
        const primaryProd = contractItems.length > 0 ? contractItems[0].product : product!;
        const itemsPayload =
          contractItems.length > 0
            ? contractItems.map((it) => ({
                product: it.product.id,
                quantity: it.quantity,
                unit_base_price: it.unit_base_price,
                monthly_yield_percent: it.monthly_yield_percent || yieldRatePercent,
                security_deposit_percent: it.security_deposit_percent || securityDepositPercent,
                security_deposit_amount: it.security_deposit_amount || undefined,
              }))
            : undefined;

        const body: Record<string, unknown> = {
          customer: customer.id,
          product: primaryProd.id,
          items: itemsPayload,
          tenure_months: tenureMonths,
          start_date: startDate,
          security_deposit_percent: Number(effectiveDepositPercent) || depositPercentNumber,
          monthly_yield_percent: Number(yieldRatePercent) || 5.0,
          buyout_amount: leaseBuyoutAmount.trim() ? leaseBuyoutAmount.trim() : null,
          ownership_transfer_allowed: ownershipTransferAllowed,
          handover_notes: handoverNotes || "",
          contract_terms_snapshot: contractTermsSnapshot || "",
          save_as_draft: asDraft,
          deposit_payment_option: depositPaymentOption,
          deposit_buffer_days: Number(depositBufferDays) || 30,
          initial_deposit_payment: initialDepositPayment.trim()
            ? Number(initialDepositPayment)
            : depositPaymentOption === "FULL"
              ? securityDepositAmount
              : null,
        };

        created = await apiFetch<CreatedSubscriptionResponse>("/admin/contracts/lease/", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      let finalSuccess = created;

      // 1. Direct customer KYC document upload (if provided for Rent/Lease):
      if ((isRentPlan || isLeasePlan) && idDocFile && customer) {
        try {
          setGlobalLoadingLabel("Uploading customer KYC document...");
          const kycForm = new FormData();
          kycForm.append("document_type", idDocType);
          kycForm.append("category", "IDENTITY");
          kycForm.append("file", idDocFile);
          kycForm.append("notes", `Direct walk-in ID verification during ${planType} contract creation`);
          await apiFetch(`/admin/customers/${customer.id}/kyc-documents/upload/`, {
            method: "POST",
            body: kycForm,
          });
          // Formally set customer KYC profile to VERIFIED
          await apiFetch(`/admin/customers/${customer.id}/kyc-decision/`, {
            method: "POST",
            body: JSON.stringify({
              status: "VERIFIED",
              reason: `Walk-in physical ID verified during ${planType} contract creation`,
            }),
          });
          setCustomer((prev) => (prev ? { ...prev, kyc_status: "VERIFIED" } : prev));
        } catch (kycErr) {
          console.warn("KYC upload warning:", kycErr);
          setDocUploadError(`KYC document upload notice: ${toErrorMessage(kycErr)}`);
        }
      }

      // Supporting residential tenancy proof (sync to customer dossier as well):
      if ((isRentPlan || isLeasePlan) && rentAgreementFile && customer) {
        try {
          const rentForm = new FormData();
          rentForm.append("document_type", "OTHER");
          rentForm.append("category", "DELIVERY_ADDRESS_PROOF");
          rentForm.append("file", rentAgreementFile);
          rentForm.append(
            "notes",
            `Supporting Tenancy Proof / Rent Agreement during ${planType} contract creation (#${created.id})`
          );
          await apiFetch(`/admin/customers/${customer.id}/kyc-documents/upload/`, {
            method: "POST",
            body: rentForm,
          });
        } catch (rentErr) {
          console.warn("Rent agreement customer KYC sync notice:", rentErr);
        }
      }

      // 2. Subscription documents (photo, signature, rent agreement):
      if (!!photoFile || signatureFile || rentAgreementFile) {
        try {
          setGlobalLoadingLabel("Uploading contract documents...");
          if (photoFile) {
            await uploadDocument(created.id, "CUSTOMER_PHOTO", photoFile, "Customer Photo");
          }
          if (signatureFile) {
            await uploadDocument(created.id, "CUSTOMER_SIGNATURE", signatureFile, "Customer signature");
          }
          if (rentAgreementFile) {
            await uploadDocument(
              created.id,
              isRentPlan ? "RENT_CONTRACT_PDF" : "LEASE_CONTRACT_PDF",
              rentAgreementFile,
              "Customer Rent Agreement / Premises Proof"
            );
          }
          const refreshed = await apiFetch<CreatedSubscriptionResponse>(`/admin/subscriptions/${created.id}/`, {
            cache: "no-store",
          });
          finalSuccess = refreshed;
          setPhotoFile(null);
          setSignatureFile(null);
          setPhotoPreview(null);
          setSignaturePreview(null);
          setIdDocFile(null);
          setRentAgreementFile(null);
        } catch (docErr) {
          setDocUploadError(toErrorMessage(docErr));
        }
      }

      setSuccess(finalSuccess);
      onCreated?.(finalSuccess.id);
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

    if (!photoFile) {
      setDocUploadError("Select at least one KYC document file.");
      return;
    }

    if (!signatureFile) {
      setDocUploadError("Select a customer signature file.");
      return;
    }

    setDocUploadBusy(true);
    try {
      if (photoFile) {
        await uploadDocument(success.id, "CUSTOMER_PHOTO", photoFile, "Customer Photo");
      }
      if (signatureFile) {
        await uploadDocument(success.id, "CUSTOMER_SIGNATURE", signatureFile, "Customer signature");
      }
      await refreshSuccess(success.id);
      setPhotoFile(null);
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
                value: money(isRentPlan || isLeasePlan ? Number(monthlyAmount) * tenureMonths : totalAmount),
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
                  setCustomer({
                    id: rec.id,
                    name: rec.name,
                    phone: rec.phone,
                    kyc_status: rec.kyc_status,
                    profile_photo_url: rec.profile_photo_url,
                  });
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
            {isRentPlan || isLeasePlan ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      Attached Furniture Items ({contractItems.length})
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Attach single or multiple furniture items under this {isRentPlan ? "Rental" : "Lease"} contract.
                    </div>
                  </div>
                  {!addingProduct && contractItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAddingProduct(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                    >
                      <span>+ Add Another Product</span>
                    </button>
                  )}
                </div>

                {contractItems.length > 0 ? (
                  <div className="space-y-2">
                    <div className="overflow-x-auto rounded-xl border border-border bg-card/60">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                            <th className="px-3 py-2.5">Product</th>
                            <th className="px-3 py-2.5 w-20">Qty</th>
                            <th className="px-3 py-2.5 w-28">Unit Base (₹)</th>
                            <th className="px-3 py-2.5 w-28">Line Base</th>
                            <th className="px-3 py-2.5 w-24">Yield %</th>
                            <th className="px-3 py-2.5 w-28">Monthly {isRentPlan ? "Rent" : "Lease"}</th>
                            <th className="px-3 py-2.5 w-24">Deposit %</th>
                            <th className="px-3 py-2.5 w-28">Deposit (₹)</th>
                            <th className="px-3 py-2.5 text-right w-12">Remove</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {contractItems.map((itm) => {
                            const lineBase = itm.quantity * (Number(itm.unit_base_price) || 0);
                            const yieldPct =
                              Number(itm.monthly_yield_percent) || Number(yieldRatePercent) || 5.0;
                            const lineMonthly = (lineBase * yieldPct) / 100;
                            const depPct =
                              Number(itm.security_deposit_percent) || Number(securityDepositPercent) || 20.0;
                            const lineDeposit = itm.security_deposit_amount
                              ? Number(itm.security_deposit_amount)
                              : (lineBase * depPct) / 100;
                            return (
                              <tr key={itm.id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-3 py-2.5">
                                  <div className="font-semibold text-foreground flex items-center gap-2">
                                    <span>{itm.product.name}</span>
                                    {isRentPlan && !itm.product.is_rent_enabled && (
                                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                                        ⚠ Not Rent Enabled
                                      </span>
                                    )}
                                    {isLeasePlan && !itm.product.is_lease_enabled && (
                                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                                        ⚠ Not Lease Enabled
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-2">
                                    <span>
                                      {itm.product.product_code || "—"}{" "}
                                      {itm.product.category ? `· ${itm.product.category}` : ""}
                                    </span>
                                    {((isRentPlan && !itm.product.is_rent_enabled) || (isLeasePlan && !itm.product.is_lease_enabled)) && (
                                      <a
                                        href={`/admin/products/${itm.product.id}/edit`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline text-[10px] font-medium"
                                      >
                                        Enable in Products ↗
                                      </a>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => updateBasketQuantity(itm.id, itm.quantity - 1)}
                                      className="h-6 w-6 rounded border border-border bg-background text-center text-xs font-bold hover:bg-muted"
                                    >
                                      -
                                    </button>
                                    <span className="w-7 text-center font-semibold">{itm.quantity}</span>
                                    <button
                                      type="button"
                                      onClick={() => updateBasketQuantity(itm.id, itm.quantity + 1)}
                                      className="h-6 w-6 rounded border border-border bg-background text-center text-xs font-bold hover:bg-muted"
                                    >
                                      +
                                    </button>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={itm.unit_base_price}
                                    onChange={(e) => updateBasketUnitPrice(itm.id, e.target.value)}
                                    className="h-7 w-24 rounded border border-border bg-background px-2 text-xs font-mono"
                                  />
                                </td>
                                <td className="px-3 py-2.5 font-semibold font-mono text-foreground">
                                  ₹
                                  {lineBase.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0.01"
                                      value={itm.monthly_yield_percent}
                                      onChange={(e) => updateBasketYield(itm.id, e.target.value)}
                                      className="h-7 w-16 rounded border border-border bg-background px-1.5 text-xs font-mono"
                                      title="Custom yield rate % for this product"
                                    />
                                    <span className="text-[11px] text-muted-foreground">%</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 font-semibold font-mono text-primary">
                                  ₹
                                  {lineMonthly.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max="100"
                                      value={itm.security_deposit_percent}
                                      onChange={(e) => updateBasketDepositPercent(itm.id, e.target.value)}
                                      className="h-7 w-16 rounded border border-border bg-background px-1.5 text-xs font-mono"
                                      title="Custom security deposit % for this product"
                                    />
                                    <span className="text-[11px] text-muted-foreground">%</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 font-semibold font-mono text-amber-700 dark:text-amber-400">
                                  ₹
                                  {lineDeposit.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeProductFromBasket(itm.id)}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    title="Remove product"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
                      <div className="flex flex-wrap items-center gap-4">
                        <div>
                          <span className="text-muted-foreground">Total Base:</span>{" "}
                          <span className="font-bold text-foreground font-mono">
                            ₹
                            {totalProductBaseValue.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Monthly Total:</span>{" "}
                          <span className="font-bold text-primary font-mono">
                            ₹
                            {Number(monthlyAmount).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total Deposit:</span>{" "}
                          <span className="font-bold text-amber-700 dark:text-amber-400 font-mono">
                            ₹
                            {Number(securityDepositAmount).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            (effective {effectiveDepositPercent}%)
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">Quick set:</span>
                        <button
                          type="button"
                          onClick={() => applyGlobalYieldToAll(yieldRatePercent)}
                          className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-muted"
                          title="Apply default yield % to all products"
                        >
                          Yield {yieldRatePercent}%
                        </button>
                        <button
                          type="button"
                          onClick={() => applyGlobalDepositToAll(securityDepositPercent)}
                          className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-muted"
                          title="Apply default deposit % to all products"
                        >
                          Deposit {securityDepositPercent}%
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {(contractItems.length === 0 || addingProduct) && (
                  <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-primary">
                      <span>
                        {contractItems.length === 0
                          ? "Select Initial Product for Contract"
                          : "Search & Add Another Product to Contract"}
                      </span>
                      {addingProduct && (
                        <button
                          type="button"
                          onClick={() => setAddingProduct(false)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    <ProductSelector
                      selected={null}
                      planFilter={planType as "ADVANCE_EMI" | "RENT" | "LEASE"}
                      onSelect={(item) => addProductToBasket(item)}
                      onClear={() => {}}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Product</div>
                <div className="text-xs text-muted-foreground mb-2">
                  Search by product name or code for Lucky Plan Advance EMI.
                </div>
                <ProductSelector
                  selected={product}
                  planFilter={planType as "ADVANCE_EMI" | "RENT" | "LEASE"}
                  onSelect={(item) => {
                    nextLuckyRequestToken();
                    setProduct(item);
                    setError(null);
                    setSuccess(null);
                  }}
                  onClear={() => {
                    nextLuckyRequestToken();
                    setProduct(null);
                    setBatch(null);
                    setLuckyId(null);
                    setBatchQuery("");
                    setLuckyQuery("");
                    setBatchResults([]);
                    setLuckyResults([]);
                    setAvailableLuckyCount(null);
                  }}
                />
              </div>
            )}
            {isEmiPlan ? (
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Partner (optional)</div>
                <div className="text-xs text-muted-foreground mb-2">
                  Attach a partner to the contract when applicable.
                </div>
                <PartnerSelector
                  selected={partner}
                  onSelect={(item) => {
                    setPartner(item);
                    setError(null);
                    setSuccess(null);
                  }}
                  onClear={() => {
                    setPartner(null);
                  }}
                />
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Plan Type <span className="text-destructive">*</span></h3>
                <p className="text-xs text-muted-foreground">
                  Choose the subscription plan. Each type has different payment and contract structure.
                </p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["EMI", "RENT", "LEASE"] as const).map((pt) => {
                  const labels: Record<typeof pt, { title: string; desc: string }> = {
                    EMI: { title: "Advance EMI", desc: "Batch + Lucky ID draw system" },
                    RENT: { title: "Rent", desc: "Monthly rental contract" },
                    LEASE: { title: "Lease", desc: "Long-term lease agreement" },
                  };
                  const selected = planType === pt;
                  return (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => {
                        setPlanType(pt);
                        if (pt === "EMI") {
                          if (contractItems.length > 1) {
                            setContractItems(contractItems.slice(0, 1));
                          }
                        } else {
                          nextLuckyRequestToken();
                          setBatch(null);
                          setLuckyId(null);
                          if (product && contractItems.length === 0) {
                            setContractItems([
                              {
                                id: `item-${product.id}`,
                                product,
                                quantity: 1,
                                unit_base_price: product.base_price || "0.00",
                                monthly_yield_percent: yieldRatePercent || "5.00",
                                security_deposit_percent: securityDepositPercent || "20.00",
                              },
                            ]);
                          }
                        }
                      }}
                      className={[
                        "flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/50",
                      ].join(" ")}
                    >
                      <span className="text-sm font-semibold">{labels[pt].title}</span>
                      <span className={["text-[11px]", selected ? "text-primary/80" : "text-muted-foreground"].join(" ")}>{labels[pt].desc}</span>
                    </button>
                  );
                })}
              </div>
              {!planType && (
                <p className="mt-2 text-[11px] text-destructive">Please select a plan type to continue.</p>
              )}
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
                      Security deposit &amp; Yield structure
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {contractItems.length > 1
                        ? `Custom rates are configured per product in Step 1. You can also sync uniform rates across all ${contractItems.length} items below.`
                        : "Configure security deposit and monthly yield rate for this contract."}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        {contractItems.length > 1 ? "Default / Global Deposit %" : "Deposit percent (%)"}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={securityDepositPercent}
                        onChange={(event) => {
                          setSecurityDepositPercent(event.target.value);
                          setError(null);
                          setSuccess(null);
                        }}
                        className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                      />
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Effective rate: {effectiveDepositPercent}%</span>
                        {contractItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => applyGlobalDepositToAll(securityDepositPercent)}
                            className="font-semibold text-primary hover:underline"
                          >
                            Apply to all {contractItems.length} items
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Deposit amount
                      </div>
                      <div className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-400 font-mono">
                        {money(securityDepositAmount)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {contractItems.length > 1
                          ? `Sum of itemized product deposits (effective ${effectiveDepositPercent}%)`
                          : `Computed from base price ${money(totalProductBaseValue)}`}
                      </div>
                    </div>
                  </div>

                  {/* Security Deposit Payment Terms: Full upfront vs Part payment with buffer */}
                  <div className="mt-4 rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-foreground">
                        Deposit Payment Plan &amp; Buffer
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Total Deposit: {money(securityDepositAmount)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Customer can pay full security deposit upfront at creation time, or make a part payment with a 20–30 day buffer to complete the full deposit.
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDepositPaymentOption("FULL");
                          setInitialDepositPayment(String(securityDepositAmount));
                        }}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition text-left ${
                          depositPaymentOption === "FULL"
                            ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <div className="font-bold">Full Payment Upfront</div>
                        <div className="text-[10px] opacity-80 mt-0.5">100% paid at creation ({money(securityDepositAmount)})</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDepositPaymentOption("PARTIAL");
                          if (!initialDepositPayment) {
                            setInitialDepositPayment(String(Math.round(Number(securityDepositAmount) / 2)));
                          }
                        }}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition text-left ${
                          depositPaymentOption === "PARTIAL"
                            ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <div className="font-bold">Part Payment + Buffer</div>
                        <div className="text-[10px] opacity-80 mt-0.5">Part now, 20–30 days buffer for full deposit</div>
                      </button>
                    </div>

                    {depositPaymentOption === "PARTIAL" && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 border-t border-border/60 pt-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            Upfront Deposit Paid Now (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={securityDepositAmount}
                            step="100"
                            value={initialDepositPayment}
                            onChange={(e) => setInitialDepositPayment(e.target.value)}
                            placeholder="e.g. 2000"
                            className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-ring"
                          />
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            Remaining Balance: {money(Math.max(Number(securityDepositAmount) - Number(initialDepositPayment || 0), 0))}
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            Buffer Days for Full Deposit
                          </label>
                          <select
                            value={depositBufferDays}
                            onChange={(e) => setDepositBufferDays(e.target.value)}
                            className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-ring"
                          >
                            <option value="20">20 Days Buffer</option>
                            <option value="25">25 Days Buffer</option>
                            <option value="30">30 Days Buffer (Standard)</option>
                          </select>
                          <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            Full balance due within {depositBufferDays} days from contract start
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        {contractItems.length > 1 ? "Default / Global Yield %" : "Yield rate (%)"}
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={yieldRatePercent}
                        onChange={(event) => {
                          setYieldRatePercent(event.target.value);
                          setError(null);
                          setSuccess(null);
                        }}
                        className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                      />
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Monthly yield on base price</span>
                        {contractItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => applyGlobalYieldToAll(yieldRatePercent)}
                            className="font-semibold text-primary hover:underline"
                          >
                            Apply to all {contractItems.length} items
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Monthly {isRentPlan ? "Rent" : "Lease"} Amount
                      </div>
                      <div className="mt-2 text-sm font-semibold text-foreground font-mono">
                        {money(monthlyAmount)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {contractItems.length > 1
                          ? `Sum of monthly dues across ${contractItems.length} products`
                          : `Computed from base price ${money(totalProductBaseValue)}`}
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
              label={
                isRentPlan || isLeasePlan
                  ? `Attached Products (${contractItems.length || (product ? 1 : 0)})`
                  : "Product"
              }
              value={
                (isRentPlan || isLeasePlan) && contractItems.length > 0
                  ? contractItems
                      .map((c) => `${c.quantity}x ${c.product.name}`)
                      .join(", ")
                  : product
                  ? `${product.name}${product.product_code ? ` (${product.product_code})` : ""}`
                  : "—"
              }
            />
            {isRentPlan || isLeasePlan ? (
              <DetailValue
                label="Combined Base Value"
                value={money(totalProductBaseValue)}
              />
            ) : (
              <DetailValue
                label="Enabled Modes"
                value={productModes.length > 0 ? productModes.join(" / ") : "—"}
              />
            )}
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
              value={money(isRentPlan || isLeasePlan ? Number(monthlyAmount) * tenureMonths : totalAmount)}
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
              <DetailValue label="Plan Type" value={formatPlanTypeLabel(success.plan_type || planType || "EMI")} />
              <DetailValue label="Status" value={success.status || "ACTIVE"} />
              <DetailValue
                label={isEmiPlan ? "Monthly Advance EMI" : "Recurring Amount (monthly)"}
                value={money(success.monthly_amount || monthlyAmount)}
              />
            </div>

            <div className="mt-5 rounded-xl border border-border bg-background p-4">
              {docUploadError ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <div className="font-medium">Document Upload Failed</div>
                  <div className="mt-1">{docUploadError}</div>
                  <div className="mt-2 text-xs opacity-90">Please retry uploading the documents below, or do it later from the contract detail page.</div>
                </div>
              ) : null}

              {(!!photoFile || signatureFile || docUploadError) && (!Array.isArray(success.documents) || success.documents.length === 0) ? (
                <div className="mb-6 border-b border-border pb-6">
                  <div className="text-sm font-semibold text-foreground mb-4">Retry KYC and Signature Uploads</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="retry-photo-file" className="text-xs font-medium text-muted-foreground">Customer photo</label>
                      <input
                        id="retry-photo-file"
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = (event.target.files ?? [])[0] ?? null;
                          setPhotoFile(file);
                          setDocUploadError(null);
                        }}
                        className="mt-2 block w-full text-sm"
                      />
                      <div className="mt-2 text-xs text-muted-foreground">
                        {photoFile ? photoFile.name : "No file selected"}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="retry-signature-file" className="text-xs font-medium text-muted-foreground">Customer signature file</label>
                      <input
                        id="retry-signature-file"
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

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void handleUploadSelectedDocuments();
                      }}
                      disabled={docUploadBusy}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {docUploadBusy ? "Uploading..." : "Retry Upload"}
                    </button>
                  </div>
                </div>
              ) : null}

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

            {/* Customer Digital Signature & Mobile Signing Section */}
            {(() => {
              const hasAttachedSignature = Boolean(
                Array.isArray(success.documents) &&
                  success.documents.some(
                    (doc) =>
                      String((doc as Record<string, unknown>).document_type ?? "").toUpperCase() ===
                        "CUSTOMER_SIGNATURE" &&
                      Boolean((doc as Record<string, unknown>).file_url)
                  )
              );

              return (
                <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">Customer Digital Signature</span>
                        {hasAttachedSignature ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            ✓ Signed & Attached
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                            ⏳ Signature Required
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 max-w-xl">
                        {hasAttachedSignature
                          ? "The customer's digital signature is attached to this agreement and will automatically appear on printed contracts with its verified timestamp."
                          : "Customer signature is not yet attached. Send a secure signing link to their phone via WhatsApp or SMS, email via Gmail, or scan the on-screen QR code."}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSignatureModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
                      >
                        <span>📲</span>
                        <span>{hasAttachedSignature ? "View Signing Link / QR" : "Send Mobile Signing Link (WhatsApp / Gmail / QR)"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link
                href={
                  isRentPlan || isLeasePlan
                    ? `/admin/rent-lease/contracts/${success.id}/contract/print`
                    : `/admin/subscriptions/${success.id}/contract/print`
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#8a5a22] bg-[#f0dfbd] px-3.5 py-2 text-sm font-semibold text-[#5e3818] shadow-sm transition hover:bg-[#e6d1a8]"
              >
                <span>🖨</span>
                <span>Print Final Contract</span>
              </Link>

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

            <CustomerSignatureLinkModal
              subscriptionId={success.id}
              isOpen={signatureModalOpen}
              onClose={() => setSignatureModalOpen(false)}
              onSignatureUpdated={() => void refreshSuccess(success.id)}
            />
          </SectionCard>
        ) : null}

        {success ? null : (
          <>
            <SectionCard
              title="Step 3 · Identity & Supporting Documents"
              description="Upload customer identity proof, photo, signature, and tenancy documents to complete contract onboarding."
            >
              {/* If Rent or Lease plan, render the dedicated KYC & Supporting Documents Workfield */}
              {(isRentPlan || isLeasePlan) && customer ? (
                <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/10 pb-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        Rent & Lease Document Verification Workfield
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Rent and Lease contracts require verified KYC (ID + address proof) and a supporting Rent Agreement where the furniture is placed.
                      </div>
                    </div>
                    <div>
                      {isCustomerKycApproved(customer.kyc_status) || kycReadiness?.can_activate ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                            ✓ KYC Approved ({customer.kyc_status || "APPROVED"})
                          </span>
                          {rentAgreementFile ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                              ✓ Tenancy Proof Attached
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-950/40 px-3 py-1 text-xs font-medium text-blue-800 dark:text-blue-300">
                              Tenancy Proof Ready to Upload
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-950/40 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                          ⚠ KYC Action Required for Activation
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="id-doc-type" className="text-xs font-medium text-muted-foreground">
                        Customer ID Document Type
                      </label>
                      <select
                        id="id-doc-type"
                        value={idDocType}
                        onChange={(e) => setIdDocType(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="AADHAAR">Aadhaar Card (Masked)</option>
                        <option value="PAN">PAN Card</option>
                        <option value="VOTER_ID">Voter ID</option>
                        <option value="DRIVING_LICENSE">Driving License</option>
                        <option value="PASSPORT">Passport</option>
                        <option value="OTHER">Other Official ID</option>
                      </select>

                      <label htmlFor="id-doc-file" className="mt-3 block text-xs font-medium text-muted-foreground">
                        Upload ID Proof (PDF or Image)
                      </label>
                      <input
                        id="id-doc-file"
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(event) => {
                          const file = (event.target.files ?? [])[0] ?? null;
                          setIdDocFile(file);
                          setDocUploadError(null);
                        }}
                        className="mt-1 block w-full text-sm"
                      />
                      <div className="mt-1 text-xs">
                        {idDocFile ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            ✓ Selected: {idDocFile.name}
                          </span>
                        ) : isCustomerKycApproved(customer.kyc_status) || kycReadiness?.can_activate ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            ✓ Existing verified KYC on file ({customer.kyc_status || "APPROVED"})
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Upload to verify customer KYC automatically</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="rent-agreement-file" className="text-xs font-medium text-muted-foreground">
                        Supporting Document: Rent Agreement / Tenancy Proof (Required for Rent/Lease)
                      </label>
                      <input
                        id="rent-agreement-file"
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(event) => {
                          const file = (event.target.files ?? [])[0] ?? null;
                          setRentAgreementFile(file);
                          setDocUploadError(null);
                        }}
                        className="mt-1 block w-full text-sm"
                      />
                      <div className="mt-1 text-xs">
                        {rentAgreementFile ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            ✓ Attached: {rentAgreementFile.name} ({(rentAgreementFile.size / 1024).toFixed(1)} KB)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Required residential proof of physical premises where rented/leased items are deployed.
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        Provides legal proof of physical premises where rented/leased items are deployed.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label htmlFor="photo-file" className="text-xs font-semibold text-muted-foreground">
                    Customer Photo {customer?.profile_photo_url ? "(Profile Photo on File)" : ""}
                  </label>
                  <input
                    id="photo-file"
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = (event.target.files ?? [])[0] ?? null;
                      handlePhotoChange(file);
                    }}
                    className="mt-2 block w-full text-sm"
                  />
                  {photoPreview ? (
                    <div className="mt-3 relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-emerald-300 bg-white p-1 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoPreview} alt="Customer photo preview" className="h-full w-full rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={() => handlePhotoChange(null)}
                        className="absolute right-1 top-1 rounded-full bg-slate-900/60 p-1 text-[10px] text-white hover:bg-slate-900"
                        title="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  ) : customer?.profile_photo_url ? (
                    <div className="mt-3 relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/50 p-1 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={customer.profile_photo_url} alt="Customer profile photo" className="h-full w-full rounded-lg object-cover" />
                      <div className="absolute bottom-0 inset-x-0 bg-emerald-900/80 py-0.5 text-center text-[9px] font-medium text-white">
                        ✓ On Profile
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {photoFile ? photoFile.name : "No photo selected"}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground">Customer Signature</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSignatureInputMode("draw")}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                          signatureInputMode === "draw"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        ✍ Draw on screen
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignatureInputMode("upload")}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                          signatureInputMode === "upload"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        📁 Upload image
                      </button>
                    </div>
                  </div>

                  <div className="mt-2">
                    {signatureInputMode === "draw" ? (
                      <div className="space-y-2">
                        <SignatureCanvas
                          height={140}
                          label="Customer Signature Pad"
                          onChange={handleSignatureCanvasChange}
                        />
                        <div className="text-[11px] text-muted-foreground">
                          Draw signature with touchscreen, stylus, or mouse.
                        </div>
                      </div>
                    ) : (
                      <div>
                        <input
                          id="signature-file"
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = (event.target.files ?? [])[0] ?? null;
                            handleSignatureFileChange(file);
                          }}
                          className="mt-1 block w-full text-sm"
                        />
                        <div className="mt-1 text-xs text-muted-foreground">
                          Upload JPG, PNG, or WEBP customer signature image.
                        </div>
                      </div>
                    )}
                  </div>

                  {signaturePreview ? (
                    <div className="mt-3">
                      <div className="text-[11px] font-medium text-emerald-700">✓ Customer signature captured</div>
                      <div className="relative mt-1 flex h-20 w-56 items-center justify-center rounded-xl border border-emerald-300 bg-white p-2 shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={signaturePreview}
                          alt="Signature preview"
                          className="max-h-16 max-w-full object-contain filter contrast-125"
                        />
                        <button
                          type="button"
                          onClick={handleClearSignature}
                          className="absolute right-1 top-1 rounded-full bg-slate-200 p-1 text-[10px] text-slate-700 hover:bg-slate-300"
                          title="Clear signature"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {signatureFile ? signatureFile.name : "No signature captured yet"}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Create contract"
              description="Submit only after verifying customer, product, plan structure, and financial preview."
            >
              {submitBlockers.length > 0 ? (
                <div
                  data-testid="submit-blockers"
                  className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                >
                  <div className="font-semibold">
                    Complete these before the contract can be activated:
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {submitBlockers.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  {!isEmiPlan && canSaveAsDraft ? (
                    <div className="mt-2.5 text-xs font-normal text-amber-800">
                      💡 <strong>Save as Draft</strong> is available: you can save this contract as a draft now and complete document uploads before delivery.
                    </div>
                  ) : null}
                </div>
              ) : !isEmiPlan && kycReadiness && !kycReadiness.can_activate ? (
                <div className="mb-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  Documents are still outstanding, so this contract cannot be activated yet.
                  <strong> Save as Draft</strong> to register it now and upload the documents later.
                </div>
              ) : null}

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
          </>
        )}
      </div>
    </ERPPageShell>
  );
}
