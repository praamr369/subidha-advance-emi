// frontend/src/app/(dashboard)/admin/customers/[id]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  Search,
  X,
  RefreshCw,
  Info,
  CreditCard,
  Wallet,
  Building2,
  Check,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { DetailItem as DetailValue, WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import OtpDeliveryReadinessCard from "@/domains/customers/components/OtpDeliveryReadinessCard";
import {
  buildForgotPasswordHref,
  resolvePasswordResetEmail,
} from "@/lib/auth/password-reset";
import { apiFetch, toArray } from "@/lib/api";

// =====================================================
// TYPES
// =====================================================
type CustomerStatus = "ACTIVE" | "INACTIVE" | "UNKNOWN";
type KycStatus =
  | "NOT_PROVIDED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "UNKNOWN";
type SubscriptionStatus =
  | "ACTIVE"
  | "PENDING"
  | "WON"
  | "COMPLETED"
  | "CANCELLED"
  | "DEFAULTED"
  | "UNKNOWN";

type CustomerDetailRecord = {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  kyc_status: KycStatus;
  status: CustomerStatus;
  user_id?: number | null;
  user_username?: string | null;
  created_at?: string | null;
  kyc_reviewed_by_username?: string | null;
  kyc_reviewed_at?: string | null;
  kyc_rejection_reason?: string | null;
};

type SubscriptionPreviewRow = {
  id: number;
  subscription_number: string;
  product_name?: string;
  batch_code?: string | null;
  lucky_number?: number | null;
  plan_type?: string;
  total_amount: string;
  monthly_amount: string;
  status: SubscriptionStatus;
  start_date?: string | null;
};

type PaymentPreviewRow = {
  id: number;
  amount: string;
  method?: string;
  reference_no?: string | null;
  payment_date?: string | null;
  subscription_id?: number | null;
  subscription_number?: string;
  is_reversed: boolean;
};

type KycDecisionResponse = {
  id: number;
  kyc_status: KycStatus | "APPROVED";
  kyc_reviewed_by_username?: string | null;
  kyc_reviewed_at?: string | null;
  kyc_rejection_reason?: string | null;
};

// =====================================================
// UTILITIES
// =====================================================
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

function toObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load customer detail.";
}

function normalizeCustomerStatus(raw: Record<string, unknown>): CustomerStatus {
  const status = String(raw.status ?? raw.customer_status ?? "").toUpperCase();
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "INACTIVE") return "INACTIVE";
  return "UNKNOWN";
}

function normalizeKycStatus(raw: Record<string, unknown>): KycStatus {
  const status = String(raw.kyc_status ?? raw.kyc ?? "").toUpperCase();

  if (status === "NOT_PROVIDED") return "NOT_PROVIDED";
  if (status === "PENDING") return "PENDING";
  if (status === "VERIFIED") return "VERIFIED";
  if (status === "APPROVED") return "VERIFIED";
  if (status === "REJECTED") return "REJECTED";
  return "UNKNOWN";
}

function normalizeSubscriptionStatus(
  raw: Record<string, unknown>
): SubscriptionStatus {
  const status = String(raw.status ?? raw.subscription_status ?? "").toUpperCase();
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "PENDING") return "PENDING";
  if (status === "WON") return "WON";
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "DEFAULTED") return "DEFAULTED";
  return "UNKNOWN";
}

function normalizeCustomerDetail(
  raw: Record<string, unknown>
): CustomerDetailRecord {
  return {
    id: toNumber(raw.id),
    name: toStringValue(raw.name) || "Unnamed customer",
    phone: toStringValue(raw.phone) || "—",
    email: toNullableString(raw.email),
    address: toNullableString(raw.address),
    city: toNullableString(raw.city),
    kyc_status: normalizeKycStatus(raw),
    status: normalizeCustomerStatus(raw),
    user_id: toNullableNumber(raw.user_id) ?? toNullableNumber(raw.user),
    user_username:
      toNullableString(raw.user_username) ??
      toNullableString(raw.username),
    created_at: toNullableString(raw.created_at),
    kyc_reviewed_by_username: toNullableString(raw.kyc_reviewed_by_username),
    kyc_reviewed_at: toNullableString(raw.kyc_reviewed_at),
    kyc_rejection_reason: toNullableString(raw.kyc_rejection_reason),
  };
}

function normalizeSubscriptionPreview(
  raw: Record<string, unknown>
): SubscriptionPreviewRow {
  const id = toNumber(raw.id);
  const luckyNumber =
    toNullableNumber(raw.lucky_number) ?? toNullableNumber(raw.lucky_no);

  return {
    id,
    subscription_number:
      toStringValue(raw.subscription_number) ||
      toStringValue(raw.subscription_code) ||
      `SUB-${id}`,
    product_name:
      toStringValue(raw.product_name) ||
      toStringValue(raw.product_title) ||
      undefined,
    batch_code:
      toNullableString(raw.batch_code) ??
      toNullableString(raw.batch_number),
    lucky_number: luckyNumber,
    plan_type:
      toStringValue(raw.plan_type) ||
      toStringValue(raw.subscription_type) ||
      undefined,
    total_amount: toMoneyString(
      raw.total_amount ?? raw.contract_value ?? raw.amount
    ),
    monthly_amount: toMoneyString(
      raw.monthly_amount ?? raw.emi_amount ?? raw.installment_amount
    ),
    status: normalizeSubscriptionStatus(raw),
    start_date:
      toNullableString(raw.start_date) ??
      toNullableString(raw.created_date),
  };
}

function normalizePaymentPreview(
  raw: Record<string, unknown>
): PaymentPreviewRow {
  const metadata = toObject(raw.allocation_metadata);
  const reversal = metadata ? toObject(metadata.reversal) : null;

  const subscriptionId =
    toNullableNumber(raw.subscription_id) ?? toNullableNumber(raw.subscription);

  const isReversed =
    raw.is_reversed === true ||
    raw.reversed === true ||
    reversal?.is_reversed === true;

  return {
    id: toNumber(raw.id),
    amount: toMoneyString(raw.amount),
    method: toStringValue(raw.method) || undefined,
    reference_no: toNullableString(raw.reference_no),
    payment_date:
      toNullableString(raw.payment_date) ??
      toNullableString(raw.created_at),
    subscription_id: subscriptionId,
    subscription_number:
      toStringValue(raw.subscription_number) ||
      (subscriptionId ? `SUB-${subscriptionId}` : undefined),
    is_reversed: isReversed,
  };
}

function extractNestedArray(
  payload: Record<string, unknown>,
  keys: string[]
): Record<string, unknown>[] {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return toArray<Record<string, unknown>>(value);
    }
  }
  return [];
}

// =====================================================
// UI COMPONENTS
// =====================================================

function StatCard({
  title,
  value,
  icon,
  trend,
  trendValue,
  tone = "default",
  tooltip,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  tone?: "default" | "success" | "warning" | "danger";
  tooltip?: string;
}) {
  const toneColors = {
    default: "border-border bg-card",
    success: "border-emerald-200 bg-emerald-50/50",
    warning: "border-amber-200 bg-amber-50/50",
    danger: "border-red-200 bg-red-50/50",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${toneColors[tone]}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {tooltip && (
            <div className="group relative">
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 hidden w-48 rounded-lg bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg group-hover:block">
                {tooltip}
              </div>
            </div>
          )}
        </div>
        <div className="rounded-xl bg-background/50 p-2 text-muted-foreground">
          {icon}
        </div>
      </div>
      <div className="mt-2">
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      </div>
      {trend && trendValue && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          {trend === "up" ? (
            <ArrowUpRight className="h-3 w-3 text-emerald-600" />
          ) : trend === "down" ? (
            <ArrowDownRight className="h-3 w-3 text-red-600" />
          ) : null}
          <span
            className={
              trend === "up"
                ? "text-emerald-600"
                : trend === "down"
                  ? "text-red-600"
                  : "text-muted-foreground"
            }
          >
            {trendValue}
          </span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  tone,
}: {
  status: string;
  tone: "success" | "warning" | "danger" | "info" | "default";
}) {
  const toneClasses = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-red-200 bg-red-50 text-red-700",
    info: "border-blue-200 bg-blue-50 text-blue-700",
    default: "border-border bg-muted text-foreground",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClasses[tone]}`}>
      {status}
    </span>
  );
}

// Enhanced Subscriptions Table with sort and search
function SubscriptionsTable({ rows }: { rows: SubscriptionPreviewRow[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof SubscriptionPreviewRow>("start_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (row) =>
        row.subscription_number.toLowerCase().includes(term) ||
        (row.product_name?.toLowerCase() || "").includes(term) ||
        (row.batch_code?.toLowerCase() || "").includes(term) ||
        row.status.toLowerCase().includes(term)
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

  const handleSort = (field: keyof SubscriptionPreviewRow) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: keyof SubscriptionPreviewRow) => {
    if (field !== sortField) return null;
    return sortDirection === "asc" ? "↑" : "↓";
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No subscriptions"
        description="No subscription records were returned for this customer."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by number, product, batch..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
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
                onClick={() => handleSort("subscription_number")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Subscription {getSortIcon("subscription_number")}
              </th>
              <th
                onClick={() => handleSort("product_name")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Product / Plan {getSortIcon("product_name")}
              </th>
              <th
                onClick={() => handleSort("total_amount")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right hover:text-foreground"
              >
                Financials {getSortIcon("total_amount")}
              </th>
              <th
                onClick={() => handleSort("status")}
                className="cursor-pointer border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Status {getSortIcon("status")}
              </th>
              <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
             </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const statusTone =
                row.status === "ACTIVE"
                  ? "success"
                  : row.status === "WON"
                  ? "info"
                  : row.status === "COMPLETED"
                  ? "default"
                  : row.status === "CANCELLED" || row.status === "DEFAULTED"
                  ? "danger"
                  : "warning";

              return (
                <tr key={row.id} className="align-top hover:bg-muted/30 transition">
                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    <div className="font-medium">{row.subscription_number}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Start {formatDate(row.start_date)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.batch_code || "No batch"}
                      {typeof row.lucky_number === "number"
                        ? ` · Lucky #${row.lucky_number}`
                        : ""}
                    </div>
                  </td>
                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    <div className="font-medium">
                      {row.product_name || "Unknown product"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.plan_type || "—"}
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
                    <StatusBadge status={row.status} tone={statusTone} />
                  </td>
                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    <div className="flex flex-col items-start gap-2">
                      <Link
                        href={`/admin/subscriptions/${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Open Subscription
                      </Link>
                      <Link
                        href={`/admin/payments?subscription=${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Payments
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Enhanced Payments Table
function PaymentsTable({ rows }: { rows: PaymentPreviewRow[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof PaymentPreviewRow>("payment_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (row) =>
        row.id.toString().includes(term) ||
        (row.subscription_number?.toLowerCase() || "").includes(term) ||
        (row.reference_no?.toLowerCase() || "").includes(term) ||
        (row.method?.toLowerCase() || "").includes(term)
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

  const handleSort = (field: keyof PaymentPreviewRow) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: keyof PaymentPreviewRow) => {
    if (field !== sortField) return null;
    return sortDirection === "asc" ? "↑" : "↓";
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No payment history"
        description="No payment records were returned for this customer."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by ID, reference, subscription..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
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
                </td>
                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  {row.subscription_number || "—"}
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
                  <span
                    className={[
                      "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                      row.is_reversed
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700",
                    ].join(" ")}
                  >
                    {row.is_reversed ? "Reversed" : "Active"}
                  </span>
                </td>
                <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                  {formatDateTime(row.payment_date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =====================================================
// API HELPERS
// =====================================================
async function submitCustomerKycDecision(
  customerId: string,
  payload: {
    status: "VERIFIED" | "REJECTED";
    reason?: string;
  }
): Promise<KycDecisionResponse> {
  return apiFetch<KycDecisionResponse>(
    `/admin/customers/${customerId}/kyc-decision/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params?.id;

  const [customer, setCustomer] = useState<CustomerDetailRecord | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionPreviewRow[]>([]);
  const [payments, setPayments] = useState<PaymentPreviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKyc, setSavingKyc] = useState(false);
  const [kycReason, setKycReason] = useState("");
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycSuccess, setKycSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!customerId) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [customerResult, subscriptionResult, paymentResult] =
          await Promise.allSettled([
            apiFetch<Record<string, unknown>>(`/admin/customers/${customerId}/`),
            apiFetch<unknown>(`/admin/subscriptions/?customer=${customerId}`),
            apiFetch<unknown>(`/admin/payments/?customer=${customerId}`),
          ]);

        if (customerResult.status !== "fulfilled") {
          throw customerResult.reason;
        }

        const basePayload = customerResult.value;
        const nextWarnings: string[] = [];

        const normalizedCustomer = normalizeCustomerDetail(basePayload);

        let nextSubscriptions: SubscriptionPreviewRow[] = [];
        let nextPayments: PaymentPreviewRow[] = [];

        if (subscriptionResult.status === "fulfilled") {
          nextSubscriptions = toArray<Record<string, unknown>>(subscriptionResult.value)
            .map(normalizeSubscriptionPreview)
            .sort((a, b) => {
              const aDate = Date.parse(a.start_date || "") || 0;
              const bDate = Date.parse(b.start_date || "") || 0;
              return bDate - aDate;
            });
        } else {
          nextSubscriptions = extractNestedArray(basePayload, [
            "subscriptions",
            "subscription_rows",
            "subscription_history",
          ])
            .map(normalizeSubscriptionPreview)
            .sort((a, b) => {
              const aDate = Date.parse(a.start_date || "") || 0;
              const bDate = Date.parse(b.start_date || "") || 0;
              return bDate - aDate;
            });

          nextWarnings.push(
            "Subscription preview was loaded from customer detail payload because the filtered subscription endpoint did not return successfully."
          );
        }

        if (paymentResult.status === "fulfilled") {
          nextPayments = toArray<Record<string, unknown>>(paymentResult.value)
            .map(normalizePaymentPreview)
            .sort((a, b) => {
              const aDate = Date.parse(a.payment_date || "") || 0;
              const bDate = Date.parse(b.payment_date || "") || 0;
              return bDate - aDate;
            });
        } else {
          nextPayments = extractNestedArray(basePayload, [
            "payments",
            "payment_rows",
            "payment_history",
          ])
            .map(normalizePaymentPreview)
            .sort((a, b) => {
              const aDate = Date.parse(a.payment_date || "") || 0;
              const bDate = Date.parse(b.payment_date || "") || 0;
              return bDate - aDate;
            });

          nextWarnings.push(
            "Payment preview was loaded from customer detail payload because the filtered payment endpoint did not return successfully."
          );
        }

        setCustomer(normalizedCustomer);
        setSubscriptions(nextSubscriptions);
        setPayments(nextPayments);
        setWarnings(nextWarnings);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setCustomer(null);
          setSubscriptions([]);
          setPayments([]);
          setWarnings([]);
        }
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [customerId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const activeSubscriptionCount = useMemo(
    () => subscriptions.filter((row) => row.status === "ACTIVE").length,
    [subscriptions]
  );

  const totalContractValue = useMemo(
    () =>
      subscriptions.reduce(
        (sum, row) => sum + Number(row.total_amount || 0),
        0
      ),
    [subscriptions]
  );

  const activePayments = useMemo(
    () => payments.filter((row) => !row.is_reversed),
    [payments]
  );

  const latestSubscription = useMemo(
    () => subscriptions[0] ?? null,
    [subscriptions]
  );

  const passwordResetIdentifier = useMemo(
    () =>
      resolvePasswordResetEmail({
        email: customer?.email,
      }),
    [customer?.email]
  );

  const passwordResetHref = useMemo(
    () => buildForgotPasswordHref(passwordResetIdentifier),
    [passwordResetIdentifier]
  );

  const actions = useMemo(() => {
    const nextActions: Array<{
      href: string;
      label: string;
      variant?: "primary" | "secondary" | "ghost" | "danger";
    }> = [
      {
        href: "/admin/customers",
        label: "Back to Register",
        variant: "secondary",
      },
      {
        href: customer ? `/admin/subscriptions?customer=${customer.id}` : "/admin/subscriptions",
        label: "Open Subscriptions",
        variant: "primary",
      },
    ];

    if (customer) {
      nextActions.push({
        href: `/admin/subscriptions/create?customer=${customer.id}`,
        label: "Create Subscription",
        variant: "secondary",
      });
    }

    return nextActions;
  }, [customer]);

  async function handleKycDecision(status: "VERIFIED" | "REJECTED") {
    if (!customerId) return;

    if (status === "REJECTED" && !kycReason.trim()) {
      setKycError("Reason is required when rejecting KYC.");
      setKycSuccess(null);
      return;
    }

    setSavingKyc(true);
    setKycError(null);
    setKycSuccess(null);

    try {
      const response = await submitCustomerKycDecision(customerId, {
        status,
        reason: kycReason.trim() || undefined,
      });

      setCustomer((current) =>
        current
          ? {
              ...current,
              kyc_status:
                response.kyc_status === "APPROVED"
                  ? "VERIFIED"
                  : response.kyc_status,
              kyc_reviewed_by_username: response.kyc_reviewed_by_username ?? null,
              kyc_reviewed_at: response.kyc_reviewed_at ?? null,
              kyc_rejection_reason: response.kyc_rejection_reason ?? null,
            }
          : current
      );

      setKycSuccess(
        status === "VERIFIED"
          ? "KYC verified successfully."
          : "KYC rejected successfully."
      );
      setKycReason("");
      await loadPage("refresh");
    } catch (err) {
      setKycError(
        err instanceof Error && err.message.trim()
          ? err.message
          : "Failed to submit KYC decision."
      );
    } finally {
      setSavingKyc(false);
    }
  }

  const kycTone: "success" | "warning" | "danger" | "default" =
    customer?.kyc_status === "VERIFIED"
      ? "success"
      : customer?.kyc_status === "REJECTED"
      ? "danger"
      : customer?.kyc_status === "PENDING"
      ? "warning"
      : "default";

  const customerStatusTone: "success" | "danger" | "default" =
    customer?.status === "ACTIVE"
      ? "success"
      : customer?.status === "INACTIVE"
      ? "danger"
      : "default";

  return (
    <PortalPage
      title={customer?.name || `Customer #${customerId ?? "—"}`}
      subtitle="Inspect customer profile, KYC state, linked contracts, and recent payment activity from one operational page."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Customers", href: "/admin/customers" },
        { label: customer?.name || `Customer #${customerId ?? "—"}` },
      ]}
      actions={actions}
      stats={[
        {
          label: "Active Subscriptions",
          value: String(activeSubscriptionCount),
          tone: activeSubscriptionCount > 0 ? "success" : undefined,
        },
        {
          label: "Contract Value",
          value: money(totalContractValue),
          tone: "success",
        },
        {
          label: "Active Payments",
          value: String(activePayments.length),
        },
        {
          label: "KYC",
          value: customer?.kyc_status || "—",
          tone:
            customer?.kyc_status === "VERIFIED"
              ? "success"
              : customer?.kyc_status === "REJECTED"
              ? "danger"
              : "warning",
        },
      ]}
      statusBadge={{
        label: customer?.status || "Customer Detail",
        tone: customer?.status === "ACTIVE" ? "success" : "info",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading customer detail..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load customer detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !customer ? (
          <EmptyState
            title="Customer not available"
            description="The requested customer could not be loaded."
          />
        ) : null}

        {!loading && !error && customer ? (
          <>
            {warnings.length > 0 && (
              <SectionCard
                title="Data source note"
                description="The detail page loaded with fallback sources for some child data."
              >
                <div className="space-y-2">
                  {warnings.map((warning) => (
                    <div
                      key={warning}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                    >
                      {warning}
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Advanced Stats Row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Active Subscriptions"
                value={String(activeSubscriptionCount)}
                icon={<Building2 className="h-4 w-4" />}
                tone={activeSubscriptionCount > 0 ? "success" : "default"}
                tooltip="Subscriptions with status 'ACTIVE'"
              />
              <StatCard
                title="Total Contract Value"
                value={money(totalContractValue)}
                icon={<Wallet className="h-4 w-4" />}
                tone="success"
                tooltip="Sum of total amounts for all subscriptions"
              />
              <StatCard
                title="Active Payments"
                value={String(activePayments.length)}
                icon={<CreditCard className="h-4 w-4" />}
                tone="default"
                tooltip="Non-reversed payments"
              />
              <StatCard
                title="KYC Status"
                value={customer.kyc_status}
                icon={
                  customer.kyc_status === "VERIFIED" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : customer.kyc_status === "REJECTED" ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )
                }
                tone={kycTone}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="Profile Overview"
                description="Primary customer facts used for admin operations and profile verification."
                actionHref={`/admin/customers/${customer.id}/edit`}
                actionLabel="Edit Profile"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue label="Customer ID" value={`#${customer.id}`} />
                  <DetailValue label="Name" value={customer.name} />
                  <DetailValue label="Phone" value={customer.phone || "—"} />
                  <DetailValue label="Email" value={customer.email || "—"} />
                  <DetailValue label="Address" value={customer.address || "—"} />
                  <DetailValue label="City" value={customer.city || "—"} />
                  <DetailValue
                    label="User ID"
                    value={
                      customer.user_id !== null && customer.user_id !== undefined
                        ? String(customer.user_id)
                        : "—"
                    }
                  />
                  <DetailValue
                    label="Created At"
                    value={formatDateTime(customer.created_at)}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge status={customer.status} tone={customerStatusTone} />
                  <StatusBadge status={customer.kyc_status} tone={kycTone} />
                </div>
              </SectionCard>

              <SectionCard
                title="Access Handoff"
                description="Use the existing OTP reset contract for routine customer access handoff. Manual admin password changes should stay exceptional."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue
                    label="Login Username"
                    value={customer.user_username || "—"}
                  />
                  <DetailValue
                    label="Reset Identifier"
                    value={passwordResetIdentifier || "Add email before password reset"}
                  />
                  <DetailValue label="Phone" value={customer.phone || "—"} />
                  <DetailValue
                    label="Reset Email"
                    value={customer.email || "No email configured"}
                  />
                </div>

                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  Ask the customer to use the email OTP reset flow if they do not know the current password or need a first-login password rotation. Accounts without email must be updated before reset can start.
                </div>

                <OtpDeliveryReadinessCard operatorContext="detail" className="mt-4" />

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href="/login"
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Login
                  </Link>
                  {passwordResetIdentifier ? (
                    <Link
                      href={passwordResetHref}
                      className="inline-flex items-center rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 shadow-sm transition hover:bg-blue-100"
                    >
                      Start OTP Reset
                    </Link>
                  ) : (
                    <div className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 shadow-sm">
                      Add email before password reset
                    </div>
                  )}
                  <Link
                    href={`/admin/customers/${customer.id}/edit`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Edit Account
                  </Link>
                </div>
              </SectionCard>

              <SectionCard
                title="KYC Review"
                description="Review and decide KYC for this existing customer. Reject requires a reason. Verify clears prior rejection reason."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue
                    label="Current KYC Status"
                    value={<StatusBadge status={customer.kyc_status} tone={kycTone} />}
                  />
                  <DetailValue
                    label="Customer Status"
                    value={<StatusBadge status={customer.status} tone={customerStatusTone} />}
                  />
                  <DetailValue
                    label="Reviewed By"
                    value={customer.kyc_reviewed_by_username || "—"}
                  />
                  <DetailValue
                    label="Reviewed At"
                    value={formatDateTime(customer.kyc_reviewed_at)}
                  />
                  <DetailValue
                    label="Latest Subscription"
                    value={
                      latestSubscription
                        ? latestSubscription.subscription_number
                        : "No subscriptions"
                    }
                  />
                  <DetailValue
                    label="Rejection Reason"
                    value={customer.kyc_rejection_reason || "—"}
                  />
                </div>

                <div className="mt-5 space-y-3">
                  {kycError ? (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {kycError}
                    </div>
                  ) : null}

                  {kycSuccess ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      {kycSuccess}
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="kyc-reason"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Review note / rejection reason
                    </label>
                    <textarea
                      id="kyc-reason"
                      value={kycReason}
                      onChange={(event) => {
                        setKycReason(event.target.value);
                        setKycError(null);
                        setKycSuccess(null);
                      }}
                      rows={4}
                      placeholder="Optional for verification, required for rejection."
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
                      disabled={savingKyc}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleKycDecision("VERIFIED")}
                      disabled={savingKyc}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Check className="h-4 w-4" />
                      {savingKyc ? "Saving..." : "Verify KYC"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleKycDecision("REJECTED")}
                      disabled={savingKyc}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                      {savingKyc ? "Saving..." : "Reject KYC"}
                    </button>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/subscriptions/create?customer=${customer.id}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Create Subscription
                  </Link>

                  <Link
                    href={`/admin/payments?customer=${customer.id}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Payments Register
                  </Link>

                  <Link
                    href={`/admin/subscriptions?customer=${customer.id}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Subscriptions
                  </Link>
                </div>
              </SectionCard>
            </div>

            <SectionCard
              title="Linked Subscriptions"
              description="Contract history and current subscription context for this customer."
              actionHref={`/admin/subscriptions?customer=${customer.id}`}
              actionLabel="View All"
            >
              <SubscriptionsTable rows={subscriptions} />
            </SectionCard>

            <SectionCard
              title="Payment History"
              description="Recent payment activity linked to this customer."
              actionHref={`/admin/payments?customer=${customer.id}`}
              actionLabel="View All"
            >
              <PaymentsTable rows={payments} />
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
