"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { DocumentReadinessPanel } from "@/components/customer-intelligence/DocumentReadinessPanel";
import { RentalAssetReadinessPanel } from "@/components/customer-intelligence/RentalAssetReadinessPanel";
import {
  ContractActivationReadinessPanel,
  type ActivationReadiness,
} from "@/components/subscriptions/ContractActivationReadinessPanel";
import { ReadinessGatedActionBanner } from "@/components/subscriptions/ReadinessGatedActionBanner";
import { DataTableShell, DetailPanel, Timeline } from "@/components/ui/operations";
import { DetailItem as DetailValue } from "@/components/ui/workspace";
import {
  buildSubscriptionDetailSemantics,
  formatLuckyNumberLabel,
  formatWinnerMonthLabel,
} from "@/domains/subscriptions/detail/view-model";
import {
  DetailHeroSurface,
  DetailMetricTile,
} from "@/domains/subscriptions/detail/surfaces";
import { apiFetch, toArray } from "@/lib/api";
import { formatPlanTypeLabel } from "@/lib/plan-labels";
import { cn } from "@/lib/utils";
import GuarantorSection from "@/components/subscriptions/GuarantorSection";
import {
  normalizeDeliveryRecord,
  type DeliveryRecord,
} from "@/services/deliveries";
import { listPayments, type PaymentRecord } from "@/services/payments";

type SubscriptionStatus =
  | "ACTIVE"
  | "WON"
  | "COMPLETED"
  | "DEFAULTED"
  | "UNKNOWN";

type PlanType = "EMI" | "RENT" | "LEASE" | "UNKNOWN";

type EmiStatus = "PENDING" | "PAID" | "WAIVED" | "UNKNOWN";

type AuditEvent = {
  id: number;
  action_type: string;
  model_name: string;
  object_id: number | string | null;
  performed_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
};

type FinancialSummary = {
  subscription_id: number;
  total_amount: string;
  total_emi_amount: string;
  emi_total: string;
  paid_amount: string;
  waived_amount: string;
  stored_waived_amount: string;
  waiver_ledger_amount: string;
  reversed_amount: string;
  pending_amount: string;
  remaining_amount: string;
  outstanding_amount: string;
  emi_count_total: number;
  emi_count_paid: number;
  emi_count_waived: number;
  emi_count_pending: number;
  winner_status: string;
  winner_month: number | null;
  lucky_id: number | null;
  lucky_number: number | null;
  batch: {
    id: number | null;
    batch_code: string | null;
    status: string | null;
  };
  partner: {
    id: number | null;
    username: string | null;
    phone: string | null;
    commission_rate: string;
  };
};

type ReconciliationFlags = {
  is_financially_consistent: boolean;
  pending_matches_remaining: boolean;
  has_reversal_history: boolean;
  has_waiver_history: boolean;
  warnings: string[];
};

type WinnerSummary = {
  winner_status: string;
  winner_month: number | null;
  lucky_id: number | null;
  lucky_number: number | null;
  draw_id: number | null;
  draw_month: number | null;
  draw_revealed_at: string | null;
  waiver_scope: string | null;
  waived_emi_count: number;
  waived_amount: string;
};

type WinnerStatus = "WON" | "NOT_WON";

type EmiRow = {
  id: number;
  month_no: number;
  due_date: string | null;
  amount: string;
  status: EmiStatus;
  derived_status: EmiStatus;
  paid_amount: string;
  total_paid: string;
  reversed_amount: string;
  waived_amount: string;
  waiver_ledger_amount: string;
  balance_amount: string;
  is_overdue: boolean;
  is_status_consistent: boolean;
  warnings: string[];
};

type ContractDocument = {
  id: number;
  document_type: string;
  verification_status: string;
  notes: string;
  file_url: string | null;
  uploaded_by_username: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RentProfile = {
  security_deposit_percent: string;
  security_deposit_amount: string;
  refundable_security_deposit: string;
  return_condition_status: string;
  deduction_amount: string;
  refund_amount: string;
  refund_status: string;
  return_inspection_notes: string;
  handover_notes: string;
  contract_terms_snapshot: string;
  created_at: string | null;
  updated_at: string | null;
};

type LeaseProfile = RentProfile & {
  buyout_amount: string | null;
  ownership_transfer_allowed: boolean;
};

type SubscriptionDetailRecord = {
  id: number;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string;
  product_id: number | null;
  product_name: string;
  product_code: string;
  partner_id: number | null;
  partner_name: string | null;
  partner_phone: string | null;
  batch_id: number | null;
  batch_code: string | null;
  batch_status: string | null;
  lucky_id: number | null;
  lucky_number: number | null;
  plan_type: PlanType;
  tenure_months: number;
  start_date: string | null;
  total_amount: string;
  monthly_amount: string;
  status: SubscriptionStatus;
  winner_month: number | null;
  winner_status: string;
  waived_amount: string;
  fulfillment_status: string | null;
  delivery_status: string | null;
  created_at: string | null;
  emi_count: number;
  paid_emi_count: number;
  pending_emi_count: number;
  waived_emi_count: number;
  financial_summary: FinancialSummary | null;
  reconciliation_flags: ReconciliationFlags | null;
  winner_summary: WinnerSummary | null;
  delivery_summary: DeliveryRecord | null;
  deliveries: DeliveryRecord[];
  emis: EmiRow[];
  rent_profile: RentProfile | null;
  lease_profile: LeaseProfile | null;
  documents: ContractDocument[];
  activation_readiness: ActivationReadiness | null;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  return value === null ? null : null;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}


function money(value: string | number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
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

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  const status = String(value ?? "").toUpperCase();
  if (
    status === "ACTIVE" ||
    status === "WON" ||
    status === "COMPLETED" ||
    status === "DEFAULTED"
  ) {
    return status;
  }
  return "UNKNOWN";
}

function normalizePlanType(value: unknown): PlanType {
  const planType = String(value ?? "").toUpperCase();
  if (planType === "EMI" || planType === "RENT" || planType === "LEASE") {
    return planType;
  }
  return "UNKNOWN";
}

function normalizeEmiStatus(value: unknown): EmiStatus {
  const status = String(value ?? "").toUpperCase();
  if (status === "PENDING" || status === "PAID" || status === "WAIVED") {
    return status;
  }
  return "UNKNOWN";
}

function isWinnerLikeStatus(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "WON" || normalized === "DRAWN" || normalized === "WINNER";
}

function normalizeWinnerStatus(
  value: unknown,
  fallback: WinnerStatus = "NOT_WON"
): WinnerStatus {
  const normalized = String(value ?? "").trim().toUpperCase();

  if (normalized === "NOT_WON") {
    return "NOT_WON";
  }

  if (isWinnerLikeStatus(normalized)) {
    return "WON";
  }

  return fallback;
}

function resolveWinnerStatus(...values: unknown[]): WinnerStatus {
  if (values.some((value) => isWinnerLikeStatus(value))) {
    return "WON";
  }

  return "NOT_WON";
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to load subscription detail.";

  const raw = error.message.trim();
  if (!raw) return "Failed to load subscription detail.";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }

    for (const [field, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > 0) {
        return `${field}: ${String(value[0])}`;
      }
      if (typeof value === "string" && value.trim()) {
        return `${field}: ${value}`;
      }
    }

    return raw;
  } catch {
    return raw;
  }
}

function normalizeFinancialSummary(raw: unknown, subscriptionId: number): FinancialSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const batch = (value.batch ?? {}) as Record<string, unknown>;
  const partner = (value.partner ?? {}) as Record<string, unknown>;

  return {
    subscription_id: toNumber(value.subscription_id, subscriptionId),
    total_amount: String(value.total_amount ?? "0.00"),
    total_emi_amount: String(value.total_emi_amount ?? value.emi_total ?? "0.00"),
    emi_total: String(value.emi_total ?? value.total_emi_amount ?? "0.00"),
    paid_amount: String(value.paid_amount ?? "0.00"),
    waived_amount: String(value.waived_amount ?? "0.00"),
    stored_waived_amount: String(value.stored_waived_amount ?? value.waived_amount ?? "0.00"),
    waiver_ledger_amount: String(value.waiver_ledger_amount ?? "0.00"),
    reversed_amount: String(value.reversed_amount ?? "0.00"),
    pending_amount: String(value.pending_amount ?? "0.00"),
    remaining_amount: String(value.remaining_amount ?? value.outstanding_amount ?? "0.00"),
    outstanding_amount: String(value.outstanding_amount ?? value.remaining_amount ?? "0.00"),
    emi_count_total: toNumber(value.emi_count_total),
    emi_count_paid: toNumber(value.emi_count_paid),
    emi_count_waived: toNumber(value.emi_count_waived),
    emi_count_pending: toNumber(value.emi_count_pending),
    winner_status: normalizeWinnerStatus(value.winner_status),
    winner_month: toNullableNumber(value.winner_month),
    lucky_id: toNullableNumber(value.lucky_id),
    lucky_number: toNullableNumber(value.lucky_number),
    batch: {
      id: toNullableNumber(batch.id),
      batch_code: toStringValue(batch.batch_code).trim() || null,
      status: toStringValue(batch.status).trim() || null,
    },
    partner: {
      id: toNullableNumber(partner.id),
      username: toStringValue(partner.username).trim() || null,
      phone: toStringValue(partner.phone).trim() || null,
      commission_rate: String(partner.commission_rate ?? "0.00"),
    },
  };
}

function normalizeReconciliationFlags(raw: unknown): ReconciliationFlags | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Record<string, unknown>;

  return {
    is_financially_consistent: toBoolean(value.is_financially_consistent),
    pending_matches_remaining: toBoolean(value.pending_matches_remaining),
    has_reversal_history: toBoolean(value.has_reversal_history),
    has_waiver_history: toBoolean(value.has_waiver_history),
    warnings: toArray<unknown>(value.warnings).map((item) => String(item)),
  };
}

function normalizeWinnerSummary(raw: unknown): WinnerSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Record<string, unknown>;

  return {
    winner_status: normalizeWinnerStatus(value.winner_status),
    winner_month: toNullableNumber(value.winner_month),
    lucky_id: toNullableNumber(value.lucky_id),
    lucky_number: toNullableNumber(value.lucky_number),
    draw_id: toNullableNumber(value.draw_id),
    draw_month: toNullableNumber(value.draw_month),
    draw_revealed_at: toNullableString(value.draw_revealed_at),
    waiver_scope: toStringValue(value.waiver_scope).trim() || null,
    waived_emi_count: toNumber(value.waived_emi_count),
    waived_amount: String(value.waived_amount ?? "0.00"),
  };
}

function normalizeEmiRow(raw: Record<string, unknown>): EmiRow {
  return {
    id: toNumber(raw.id),
    month_no: toNumber(raw.month_no),
    due_date: toNullableString(raw.due_date),
    amount: String(raw.amount ?? "0.00"),
    status: normalizeEmiStatus(raw.status),
    derived_status: normalizeEmiStatus(raw.derived_status ?? raw.status),
    paid_amount: String(raw.paid_amount ?? raw.total_paid ?? "0.00"),
    total_paid: String(raw.total_paid ?? raw.paid_amount ?? "0.00"),
    reversed_amount: String(raw.reversed_amount ?? "0.00"),
    waived_amount: String(raw.waived_amount ?? "0.00"),
    waiver_ledger_amount: String(raw.waiver_ledger_amount ?? "0.00"),
    balance_amount: String(raw.balance_amount ?? "0.00"),
    is_overdue: toBoolean(raw.is_overdue),
    is_status_consistent: toBoolean(raw.is_status_consistent, true),
    warnings: toArray<unknown>(raw.warnings).map((item) => String(item)),
  };
}

function normalizeContractDocument(raw: Record<string, unknown>): ContractDocument {
  return {
    id: toNumber(raw.id),
    document_type: toStringValue(raw.document_type).trim() || "DOCUMENT",
    verification_status: toStringValue(raw.verification_status).trim() || "PENDING",
    notes: toStringValue(raw.notes).trim(),
    file_url: toNullableString(raw.file_url),
    uploaded_by_username: toNullableString(raw.uploaded_by_username),
    created_at: toNullableString(raw.created_at),
    updated_at: toNullableString(raw.updated_at),
  };
}

function normalizeRentProfile(raw: unknown): RentProfile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  return {
    security_deposit_percent: String(value.security_deposit_percent ?? "0.00"),
    security_deposit_amount: String(value.security_deposit_amount ?? "0.00"),
    refundable_security_deposit: String(value.refundable_security_deposit ?? "0.00"),
    return_condition_status: toStringValue(value.return_condition_status).trim() || "NOT_ASSESSED",
    deduction_amount: String(value.deduction_amount ?? "0.00"),
    refund_amount: String(value.refund_amount ?? "0.00"),
    refund_status: toStringValue(value.refund_status).trim() || "PENDING",
    return_inspection_notes: toStringValue(value.return_inspection_notes),
    handover_notes: toStringValue(value.handover_notes),
    contract_terms_snapshot: toStringValue(value.contract_terms_snapshot),
    created_at: toNullableString(value.created_at),
    updated_at: toNullableString(value.updated_at),
  };
}

function normalizeLeaseProfile(raw: unknown): LeaseProfile | null {
  const base = normalizeRentProfile(raw);
  if (!base) return null;
  const value = raw as Record<string, unknown>;
  return {
    ...base,
    buyout_amount:
      value.buyout_amount === null || value.buyout_amount === undefined
        ? null
        : String(value.buyout_amount),
    ownership_transfer_allowed: toBoolean(value.ownership_transfer_allowed),
  };
}

function normalizeAuditEvent(raw: Record<string, unknown>): AuditEvent {
  return {
    id: toNumber(raw.id),
    action_type: toStringValue(raw.action_type).trim() || "UNKNOWN",
    model_name: toStringValue(raw.model_name).trim() || "UnknownModel",
    object_id:
      typeof raw.object_id === "string" || typeof raw.object_id === "number"
        ? raw.object_id
        : null,
    performed_by: toNullableString(raw.performed_by),
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : {},
    created_at: toNullableString(raw.created_at),
  };
}

function normalizeSubscriptionDetail(
  raw: Record<string, unknown>
): SubscriptionDetailRecord {
  const id = toNumber(raw.id);
  const financialSummary = normalizeFinancialSummary(raw.financial_summary, id);
  const winnerStatus = resolveWinnerStatus(
    raw.winner_status,
    financialSummary?.winner_status,
    toObject(raw.winner_summary)?.winner_status
  );

  return {
    id,
    customer_id: toNullableNumber(raw.customer),
    customer_name: toStringValue(raw.customer_name).trim() || "Unknown customer",
    customer_phone: toStringValue(raw.customer_phone).trim() || "—",
    product_id: toNullableNumber(raw.product),
    product_name: toStringValue(raw.product_name).trim() || "Unknown product",
    product_code: toStringValue(raw.product_code).trim() || "—",
    partner_id: toNullableNumber(raw.partner),
    partner_name: toStringValue(raw.partner_name).trim() || null,
    partner_phone: toStringValue(raw.partner_phone).trim() || null,
    batch_id: toNullableNumber(raw.batch),
    batch_code: toStringValue(raw.batch_code).trim() || null,
    batch_status: toStringValue(raw.batch_status).trim() || null,
    lucky_id: toNullableNumber(raw.lucky_id),
    lucky_number: toNullableNumber(raw.lucky_number),
    plan_type: normalizePlanType(raw.plan_type),
    tenure_months: toNumber(raw.tenure_months),
    start_date: toNullableString(raw.start_date),
    total_amount: String(raw.total_amount ?? "0.00"),
    monthly_amount: String(raw.monthly_amount ?? "0.00"),
    status: normalizeSubscriptionStatus(raw.status),
    winner_month: toNullableNumber(raw.winner_month),
    winner_status: winnerStatus,
    waived_amount: String(raw.waived_amount ?? "0.00"),
    fulfillment_status: toNullableString(raw.fulfillment_status),
    delivery_status: toNullableString(raw.delivery_status),
    created_at: toNullableString(raw.created_at),
    emi_count: toNumber(raw.emi_count),
    paid_emi_count: toNumber(raw.paid_emi_count),
    pending_emi_count: toNumber(raw.pending_emi_count),
    waived_emi_count: toNumber(raw.waived_emi_count),
    financial_summary: financialSummary,
    reconciliation_flags: normalizeReconciliationFlags(raw.reconciliation_flags),
    winner_summary: normalizeWinnerSummary(raw.winner_summary),
    delivery_summary:
      raw.delivery_summary === null || raw.delivery_summary === undefined
        ? null
        : normalizeDeliveryRecord(raw.delivery_summary),
    deliveries: toArray<Record<string, unknown>>(raw.deliveries).map(
      normalizeDeliveryRecord
    ),
    emis: toArray<Record<string, unknown>>(raw.emis).map(normalizeEmiRow),
    rent_profile: normalizeRentProfile(raw.rent_profile),
    lease_profile: normalizeLeaseProfile(raw.lease_profile),
    documents: toArray<Record<string, unknown>>(raw.documents).map(normalizeContractDocument),
    activation_readiness: normalizeActivationReadiness(raw.activation_readiness),
  };
}

function normalizeActivationReadiness(raw: unknown): ActivationReadiness | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const categoriesRaw =
    value.readiness_categories && typeof value.readiness_categories === "object"
      ? (value.readiness_categories as Record<string, unknown>)
      : {};

  const normalizedCategories: ActivationReadiness["readiness_categories"] = {};
  for (const [k, v] of Object.entries(categoriesRaw)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const cat = v as Record<string, unknown>;
      normalizedCategories[k] = {
        required: Boolean(cat.required),
        ready: cat.ready === null || cat.ready === undefined ? null : Boolean(cat.ready),
        advisory: Boolean(cat.advisory),
        blocker_codes: Array.isArray(cat.blocker_codes) ? (cat.blocker_codes as string[]) : [],
        details:
          cat.details && typeof cat.details === "object" && !Array.isArray(cat.details)
            ? (cat.details as Record<string, unknown>)
            : {},
      };
    }
  }

  return {
    readiness_status: String(value.readiness_status ?? "BLOCKED"),
    can_activate: Boolean(value.can_activate),
    can_deliver: Boolean(value.can_deliver),
    activation_blockers: Array.isArray(value.activation_blockers)
      ? (value.activation_blockers as ActivationReadiness["activation_blockers"])
      : [],
    handover_blockers: Array.isArray(value.handover_blockers)
      ? (value.handover_blockers as ActivationReadiness["handover_blockers"])
      : [],
    readiness_categories: normalizedCategories,
    advisory_warnings: Array.isArray(value.advisory_warnings)
      ? (value.advisory_warnings as string[])
      : [],
    plan_notes: Array.isArray(value.plan_notes) ? (value.plan_notes as string[]) : [],
    is_direct_sale: Boolean(value.is_direct_sale),
    plan_type: String(value.plan_type ?? ""),
    kyc_verified: Boolean(value.kyc_verified),
    kyc_gating_enabled: Boolean(value.kyc_gating_enabled),
    read_only_notice: String(
      value.read_only_notice ??
        "Read-only readiness evaluation. No payment, receipt, journal, stock movement, or reconciliation record is created from this panel."
    ),
  };
}

export default function AdminSubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const subscriptionId = params?.id;

  const [subscription, setSubscription] = useState<SubscriptionDetailRecord | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [timeline, setTimeline] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!subscriptionId) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [subscriptionRes, paymentsRes, timelineRes] = await Promise.allSettled([
          apiFetch<Record<string, unknown>>(`/admin/subscriptions/${subscriptionId}/`, {
            cache: "no-store",
          }),
          listPayments({ subscription: subscriptionId }),
          apiFetch<Record<string, unknown>>(`/admin/subscriptions/${subscriptionId}/timeline/`, {
            cache: "no-store",
          }),
        ]);

        let subscriptionPayload: Record<string, unknown> | null = null;
        if (subscriptionRes.status === "fulfilled") {
          subscriptionPayload = subscriptionRes.value;
        } else {
          const fallback = await apiFetch<Record<string, unknown>>(
            `/admin/subscriptions/?id=${encodeURIComponent(String(subscriptionId))}`,
            { cache: "no-store" }
          );
          const fallbackRows = toArray<Record<string, unknown>>(fallback.results);
          subscriptionPayload = fallbackRows.find(
            (row) => String(row.id ?? "") === String(subscriptionId)
          ) ?? null;
        }

        if (!subscriptionPayload) {
          throw subscriptionRes.status === "rejected"
            ? subscriptionRes.reason
            : new Error("Subscription detail is unavailable.");
        }

        const nextSubscription = normalizeSubscriptionDetail(subscriptionPayload);
        const nextPayments =
          paymentsRes.status === "fulfilled" ? paymentsRes.value.results ?? [] : [];
        const nextTimeline =
          timelineRes.status === "fulfilled"
            ? toArray<Record<string, unknown>>(timelineRes.value.results)
                .map(normalizeAuditEvent)
                .sort((a, b) => {
                  const aTime = Date.parse(a.created_at || "") || 0;
                  const bTime = Date.parse(b.created_at || "") || 0;
                  return bTime - aTime;
                })
            : [];

        setSubscription(nextSubscription);
        setPayments(nextPayments);
        setTimeline(nextTimeline);
        setError(null);
      } catch (err) {
        setError(parseErrorMessage(err));
        setSubscription(null);
        setPayments([]);
        setTimeline([]);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [subscriptionId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const financialSummary = subscription?.financial_summary;
  const reconciliationFlags = subscription?.reconciliation_flags;
  const winnerSummary = subscription?.winner_summary;
  const currentDelivery = subscription?.delivery_summary;
  const deliveryHistory = subscription?.deliveries ?? [];
  const emis = useMemo(() => subscription?.emis ?? [], [subscription?.emis]);

  const activePayments = useMemo(
    () => payments.filter((payment) => !payment.is_reversed),
    [payments]
  );
  const reversedPayments = useMemo(
    () => payments.filter((payment) => payment.is_reversed),
    [payments]
  );
  const waivedEmis = useMemo(
    () => emis.filter((emi) => emi.status === "WAIVED"),
    [emis]
  );

  const winnerStatus = resolveWinnerStatus(
    subscription?.winner_status,
    winnerSummary?.winner_status,
    financialSummary?.winner_status
  );
  const detailSemantics = useMemo(
    () =>
      buildSubscriptionDetailSemantics({
        contractStatus: subscription?.status,
        winnerStatus,
        winnerMonth: winnerSummary?.winner_month ?? subscription?.winner_month,
        luckyNumber: winnerSummary?.lucky_number ?? subscription?.lucky_number,
        drawId: winnerSummary?.draw_id,
        drawMonth: winnerSummary?.draw_month,
        drawRevealedAt: winnerSummary?.draw_revealed_at,
        waiverScope: winnerSummary?.waiver_scope,
        waivedEmiCount:
          winnerSummary?.waived_emi_count ??
          financialSummary?.emi_count_waived ??
          subscription?.waived_emi_count,
        waivedAmount:
          winnerSummary?.waived_amount ??
          financialSummary?.waived_amount ??
          subscription?.waived_amount,
        remainingAmount:
          financialSummary?.remaining_amount ?? financialSummary?.outstanding_amount,
        outstandingAmount:
          financialSummary?.outstanding_amount ?? financialSummary?.remaining_amount,
      }),
    [
      financialSummary?.emi_count_waived,
      financialSummary?.outstanding_amount,
      financialSummary?.remaining_amount,
      financialSummary?.waived_amount,
      subscription?.lucky_number,
      subscription?.status,
      subscription?.waived_amount,
      subscription?.waived_emi_count,
      subscription?.winner_month,
      winnerStatus,
      winnerSummary?.draw_id,
      winnerSummary?.draw_month,
      winnerSummary?.draw_revealed_at,
      winnerSummary?.lucky_number,
      winnerSummary?.waived_amount,
      winnerSummary?.waived_emi_count,
      winnerSummary?.waiver_scope,
      winnerSummary?.winner_month,
    ]
  );
  const winnerIntegrityIssues = useMemo(
    () =>
      (reconciliationFlags?.warnings ?? []).filter((warning) =>
        /winner|waiv/i.test(warning)
      ),
    [reconciliationFlags]
  );

  const financeWarnings = reconciliationFlags?.warnings ?? [];
  const showReconciliationWarning =
    financeWarnings.length > 0 || !reconciliationFlags?.is_financially_consistent;
  const isEmiSubscription = subscription?.plan_type === "EMI";
  const contractProfile = useMemo(() => {
    if (!subscription) return null;
    if (subscription.plan_type === "RENT") return subscription.rent_profile;
    if (subscription.plan_type === "LEASE") return subscription.lease_profile;
    return null;
  }, [subscription]);
  const contractDocuments = useMemo(
    () => subscription?.documents ?? [],
    [subscription?.documents]
  );
  const contractPdfDocument = useMemo(() => {
    if (!subscription) return null;
    const targetType =
      subscription.plan_type === "RENT"
        ? "RENT_CONTRACT_PDF"
        : subscription.plan_type === "LEASE"
          ? "LEASE_CONTRACT_PDF"
          : null;
    if (!targetType) return null;
    return contractDocuments.find((doc) => doc.document_type === targetType) ?? null;
  }, [contractDocuments, subscription]);

  return (
    <ERPPageShell
      title={
        subscription
          ? `Subscription #${subscription.id}`
          : `Subscription #${subscriptionId ?? "—"}`
      }
      subtitle="Contract, winner, and waiver posture with contract lifecycle, winner benefit, waiver and settlement, finance, and audit context from canonical backend truth."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Subscriptions", href: "/admin/subscriptions" },
        {
          label: subscription
            ? `Subscription #${subscription.id}`
            : `Subscription #${subscriptionId ?? "—"}`,
        },
      ]}
      actions={[
        {
          href: "/admin/subscriptions",
          label: "Back to Register",
          variant: "secondary",
        },
        ...(subscription
          ? [
              {
                href: `/admin/subscriptions/${subscription.id}/lifecycle`,
                label: "Contract Lifecycle",
                variant: "primary" as const,
              },
              {
                href: `/admin/finance/collect?subscription=${subscription.id}`,
                label: "Collect Payment",
                variant: "primary" as const,
              },
              {
                href: `/admin/finance/commissions?subscription=${subscription.id}`,
                label: "Commission Rows",
                variant: "secondary" as const,
              },
              {
                href: `/admin/deliveries?subscription=${subscription.id}&portfolio=${
                  String(subscription.plan_type || "").toUpperCase() === "RENT"
                    ? "RENT"
                    : String(subscription.plan_type || "").toUpperCase() === "LEASE"
                      ? "LEASE"
                      : "ADVANCE_EMI"
                }`,
                label: "Delivery Workspace",
                variant: "secondary" as const,
              },
              {
                href: `/admin/billing/contracts?subscription=${subscription.id}`,
                label: "Billing Contract",
                variant: "secondary" as const,
              },
              {
                href: `/admin/billing/register?subscription=${subscription.id}`,
                label: "Billing Docs",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(subscription?.customer_id != null
          ? [
              {
                href: `/admin/customers/${subscription.customer_id}`,
                label: "Open Customer",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(subscription?.batch_id != null
          ? [
              {
                href: `/admin/batches/${subscription.batch_id}`,
                label: "Open Batch",
                variant: "secondary" as const,
              },
            ]
          : []),
      ]}
      stats={[
        {
          label: "Contract",
          value: detailSemantics.contractStatus || "—",
          tone:
            detailSemantics.contractStatus === "DEFAULTED"
              ? "danger"
              : detailSemantics.contractStatus === "COMPLETED"
              ? "success"
              : detailSemantics.contractStatus === "WON"
              ? "info"
              : undefined,
        },
        {
          label: "Winner Benefit",
          value: detailSemantics.hasWinnerHistory
            ? formatWinnerMonthLabel(detailSemantics.winnerMonth)
            : "Not won",
          tone: detailSemantics.hasWinnerHistory ? "success" : undefined,
        },
        {
          label: "Waived Advance EMI",
          value: String(detailSemantics.waivedEmiCount),
          tone: detailSemantics.hasWaiver ? "success" : undefined,
        },
        {
          label: "Remaining",
          value: financialSummary ? money(financialSummary.remaining_amount) : "—",
          tone:
            reconciliationFlags?.pending_matches_remaining === false ? "danger" : undefined,
        },
      ]}
      statusBadge={{
        label: detailSemantics.contractStatus || "Subscription Detail",
        tone:
          detailSemantics.contractStatus === "DEFAULTED"
            ? "danger"
            : detailSemantics.contractStatus === "COMPLETED"
            ? "success"
            : detailSemantics.contractStatus === "WON"
            ? "info"
            : "info",
      }}
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading subscription detail..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load subscription detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !subscription ? (
          <ERPEmptyState
            title="Subscription not available"
            description="The requested subscription could not be loaded."
          />
        ) : null}

        {!loading && !error && subscription && financialSummary && reconciliationFlags ? (
          <>
            {/* Phase 9B-NF7B — Object detail cockpit: contract source workflow
                ownership. Additive copy only. EMI schedule, winner, and waiver
                semantics are unchanged; money, delivery, and accounting truth
                stay in their owning modules. */}
            <section className="rounded-xl border border-border bg-muted/30 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Sales & Contracts · Contract source workflow
              </p>
              <h2 className="mt-2 text-base font-semibold text-foreground">
                This subscription is the Contract source workflow. EMI schedule, winner, and waiver truth live here; money, delivery, and accounting stay in their owning modules.
              </h2>
              <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Advance EMI uses Lucky ID and batch. Rent/Lease has no Lucky ID and no draw context.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Winner waiver means future EMI waiver only — already-paid installments are never rewritten.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Payment and receipt belong to Collections & Cashier.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Delivery/handover belongs to Delivery & Service.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2 sm:col-span-2">
                  Accounting bridge/reconciliation belongs to Accounting & Reconciliation.
                </li>
              </ul>
            </section>

            <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-900">Process Flow</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {[
                  "Customer",
                  "Batch",
                  "Lucky ID",
                  "Contract",
                  "EMI",
                  "Payment",
                  "Delivery",
                ].map((step, index) => (
                  <div key={`flow-step-${step}-${index}`} className="flex items-center gap-2">
                    <span className="rounded-lg border border-amber-200 bg-card px-2.5 py-1 text-xs font-semibold text-amber-900">
                      {step}
                    </span>
                    {index < 6 ? <span className="text-amber-700">→</span> : null}
                  </div>
                ))}
              </div>
            </section>
            <section className="grid gap-4">
              <div className="surface-glass rounded-[30px] p-5 shadow-lg">
                <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Operational Lens
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                      Contract, winner, and waiver posture
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                      Contract lifecycle, winner benefit, and waiver and settlement posture are shown as separate truths so completed winners stay readable without masking reconciliation issues.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void loadPage("refresh")}
                    disabled={refreshing || loading}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <svg
                      className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    {refreshing ? "Refreshing..." : "Refresh detail"}
                  </button>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
                  <DetailHeroSurface
                    eyebrow="Contract Lifecycle"
                    title={detailSemantics.contractHeadline}
                    description={detailSemantics.contractDescription}
                    tone={detailSemantics.contractTone}
                    badge={<ERPStatusBadge status={subscription.status} size="md" />}
                    meta={
                      <>
                        <DetailMetricTile
                          label="Lifecycle Status"
                          value={detailSemantics.contractStatus}
                          tone={detailSemantics.contractTone}
                        />
                        <DetailMetricTile
                          label="Remaining Amount"
                          value={money(financialSummary.remaining_amount)}
                          hint={
                            reconciliationFlags.pending_matches_remaining
                              ? "Pending rows align with remaining balance."
                              : "Remaining balance needs reconciliation review."
                          }
                          tone={
                            reconciliationFlags.pending_matches_remaining ? "success" : "warning"
                          }
                        />
                        <DetailMetricTile
                          label="Tenure"
                          value={`${subscription.tenure_months} months`}
                          hint={`Start ${formatDate(subscription.start_date)}`}
                        />
                      </>
                    }
                  />

                  <DetailHeroSurface
                    eyebrow="Winner Benefit"
                    title={detailSemantics.winnerHeadline}
                    description={detailSemantics.winnerDescription}
                    tone={detailSemantics.winnerTone}
                    badge={
                      <ERPStatusBadge
                        status={winnerStatus === "WON" ? "WON" : "NOT_WON"}
                        label={winnerStatus === "WON" ? "Winner recorded" : "Not won"}
                        size="md"
                      />
                    }
                    meta={
                      <>
                        <DetailMetricTile
                          label="Winner Month"
                          value={formatWinnerMonthLabel(detailSemantics.winnerMonth)}
                          tone={detailSemantics.winnerTone}
                        />
                        <DetailMetricTile
                          label="Lucky Number"
                          value={formatLuckyNumberLabel(detailSemantics.luckyNumber)}
                          hint={
                            detailSemantics.drawId != null
                              ? `Draw #${detailSemantics.drawId}`
                              : "No draw reference exposed"
                          }
                        />
                        <DetailMetricTile
                          label="Draw Revealed"
                          value={formatDateTime(detailSemantics.drawRevealedAt)}
                          hint={
                            detailSemantics.drawMonth != null
                              ? `Draw month ${detailSemantics.drawMonth}`
                              : "Winner month stored on contract"
                          }
                        />
                      </>
                    }
                  />

                  <DetailHeroSurface
                    eyebrow="Waiver And Settlement"
                    title={detailSemantics.waiverHeadline}
                    description={detailSemantics.waiverDescription}
                    tone={detailSemantics.waiverTone}
                    badge={
                      <ERPStatusBadge
                        status={detailSemantics.isSettled ? "COMPLETED" : "ACTIVE"}
                        label={detailSemantics.isSettled ? "No remaining amount" : "Exposure remains"}
                        size="md"
                      />
                    }
                    meta={
                      <>
                        <DetailMetricTile
                          label="Waived Advance EMI Rows"
                          value={String(detailSemantics.waivedEmiCount)}
                          tone={detailSemantics.hasWaiver ? detailSemantics.waiverTone : "default"}
                        />
                        <DetailMetricTile
                          label="Waived Amount"
                          value={money(detailSemantics.waivedAmount)}
                          tone={detailSemantics.hasWaiver ? detailSemantics.waiverTone : "default"}
                        />
                        <DetailMetricTile
                          label="Waiver Scope"
                          value={detailSemantics.waiverScope || "—"}
                          hint="Winner benefits waive future EMI rows only."
                        />
                      </>
                    }
                  />
                </div>
              </div>

              {winnerIntegrityIssues.length > 0 ? (
                <div className="dashboard-posture-danger rounded-[24px] p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--semantic-danger-fg)]">
                    Winner Integrity Warning
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-card-foreground">
                    {winnerIntegrityIssues.map((warning) => (
                      <li
                        key={warning}
                        className="rounded-xl border border-border/80 bg-card/80 px-4 py-3 text-card-foreground"
                      >
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : detailSemantics.hasWinnerHistory ? (
                <div className="dashboard-posture-success rounded-[24px] p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--semantic-success-fg)]">
                    Winner State Synced
                  </p>
                  <p className="mt-2 text-sm leading-6 text-card-foreground">
                    Winner history, Lucky ID state, and waiver posture are aligned with the canonical backend snapshot for this contract.
                  </p>
                </div>
              ) : null}
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <DetailPanel
                title="Contract overview"
                description="Commercial, customer, product, batch, and assignment context."
                className="rounded-[28px]"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue label="Subscription ID" value={`#${subscription.id}`} />
                  <DetailValue
                    label="Status"
                    value={<ERPStatusBadge status={subscription.status} />}
                  />
                  <DetailValue label="Customer" value={subscription.customer_name} />
                  <DetailValue label="Phone" value={subscription.customer_phone} />
                  <DetailValue label="Product" value={subscription.product_name} />
                  <DetailValue label="Product Code" value={subscription.product_code} />
                  <DetailValue label="Plan Type" value={formatPlanTypeLabel(subscription.plan_type)} />
                  <DetailValue label="Tenure" value={`${subscription.tenure_months} months`} />
                  <DetailValue
                    label="Batch"
                    value={isEmiSubscription ? subscription.batch_code || "—" : "Not applicable"}
                  />
                  <DetailValue
                    label="Batch Status"
                    value={
                      isEmiSubscription && subscription.batch_status ? (
                        <ERPStatusBadge status={subscription.batch_status} />
                      ) : (
                        isEmiSubscription
                          ? "—"
                          : "Not applicable"
                      )
                    }
                  />
                  <DetailValue
                    label="Lucky ID"
                    value={
                      isEmiSubscription
                        ? subscription.lucky_id != null
                          ? `#${subscription.lucky_id}`
                          : "—"
                        : "Not applicable"
                    }
                  />
                  <DetailValue
                    label="Lucky Number"
                    value={isEmiSubscription ? formatLuckyNumberLabel(subscription.lucky_number) : "Not applicable"}
                  />
                  <DetailValue label="Partner" value={isEmiSubscription ? subscription.partner_name || "—" : "Not applicable"} />
                  <DetailValue label="Partner Phone" value={isEmiSubscription ? subscription.partner_phone || "—" : "Not applicable"} />
                  <DetailValue label="Start Date" value={formatDate(subscription.start_date)} />
                  <DetailValue label="Created At" value={formatDateTime(subscription.created_at)} />
                </div>
              </DetailPanel>

              {isEmiSubscription ? (
                <DetailPanel
                  title="Winner / lucky context"
                  description="Winning draw linkage and waived EMI posture."
                  className="rounded-[28px]"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailValue
                      label="Winner Status"
                      value={
                        <ERPStatusBadge
                          status={winnerStatus === "WON" ? "WON" : "NOT_WON"}
                          label={winnerStatus === "WON" ? "Won" : "Not won"}
                        />
                      }
                    />
                    <DetailValue
                      label="Winner Month"
                      value={
                        winnerSummary?.winner_month != null
                          ? `Month ${winnerSummary.winner_month}`
                          : subscription.winner_month != null
                          ? `Month ${subscription.winner_month}`
                          : "—"
                      }
                    />
                    <DetailValue
                      label="Lucky Number"
                      value={formatLuckyNumberLabel(
                        winnerSummary?.lucky_number ?? subscription.lucky_number
                      )}
                    />
                    <DetailValue
                      label="Draw Reference"
                      value={
                        winnerSummary?.draw_id != null
                          ? `Draw #${winnerSummary.draw_id} · Month ${winnerSummary.draw_month ?? "—"}`
                          : "—"
                      }
                    />
                    <DetailValue
                      label="Draw Revealed"
                      value={formatDateTime(winnerSummary?.draw_revealed_at)}
                    />
                    <DetailValue
                      label="Waiver Scope"
                      value={winnerSummary?.waiver_scope || "—"}
                    />
                    <DetailValue
                      label="Waived Advance EMI Count"
                      value={String(winnerSummary?.waived_emi_count ?? financialSummary.emi_count_waived)}
                    />
                    <DetailValue
                      label="Waived Amount"
                      value={money(winnerSummary?.waived_amount ?? financialSummary.waived_amount)}
                    />
                  </div>
                </DetailPanel>
              ) : (
                <DetailPanel
                  title="Rent/Lease profile"
                  description="Security deposit posture, return assessment status, and contract documents."
                  className="rounded-[28px]"
                >
                  {contractProfile ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <DetailValue
                          label="Security Deposit (%)"
                          value={`${contractProfile.security_deposit_percent}%`}
                        />
                        <DetailValue
                          label="Security Deposit (amount)"
                          value={money(contractProfile.security_deposit_amount)}
                        />
                        <DetailValue
                          label="Refundable Deposit"
                          value={money(contractProfile.refundable_security_deposit)}
                        />
                        <DetailValue
                          label="Return Condition"
                          value={<ERPStatusBadge status={contractProfile.return_condition_status} />}
                        />
                        <DetailValue
                          label="Deduction Amount"
                          value={money(contractProfile.deduction_amount)}
                        />
                        <DetailValue
                          label="Refund Amount"
                          value={money(contractProfile.refund_amount)}
                        />
                        <DetailValue
                          label="Refund Status"
                          value={<ERPStatusBadge status={contractProfile.refund_status} />}
                        />
                        {subscription.plan_type === "LEASE" ? (
                          <>
                            <DetailValue
                              label="Buyout Amount"
                              value={
                                subscription.lease_profile?.buyout_amount
                                  ? money(subscription.lease_profile.buyout_amount)
                                  : "—"
                              }
                            />
                            <DetailValue
                              label="Ownership Transfer"
                              value={
                                subscription.lease_profile?.ownership_transfer_allowed
                                  ? "Allowed"
                                  : "Not allowed"
                              }
                            />
                          </>
                        ) : null}
                      </div>

                      {contractPdfDocument?.file_url ? (
                        <div className="mt-5 rounded-xl border border-border bg-card px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Generated contract PDF
                          </div>
                          <a
                            href={contractPdfDocument.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex text-sm font-semibold text-sky-700 hover:underline"
                          >
                            Open {subscription.plan_type} Contract PDF
                          </a>
                        </div>
                      ) : (
                        <div className="mt-5 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                          No contract PDF document is attached yet.
                        </div>
                      )}

                      <div className="mt-5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Documents
                        </div>
                        {contractDocuments.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {contractDocuments.slice(0, 10).map((doc) => (
                              <div
                                key={doc.id}
                                className="flex flex-col gap-1 rounded-xl border border-border bg-background px-4 py-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-medium text-foreground">
                                    {doc.document_type}
                                  </div>
                                  <ERPStatusBadge status={doc.verification_status} size="sm" />
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Uploaded {formatDateTime(doc.created_at)} · {doc.uploaded_by_username || "—"}
                                </div>
                                {doc.file_url ? (
                                  <a
                                    href={doc.file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm font-medium text-sky-700 hover:underline"
                                  >
                                    Open file
                                  </a>
                                ) : null}
                              </div>
                            ))}
                            {contractDocuments.length > 10 ? (
                              <div className="text-xs text-muted-foreground">
                                Showing 10 of {contractDocuments.length} documents.
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                            No documents uploaded yet. Upload KYC ID and signature from the create flow or via subscription documents endpoint.
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                      No rent/lease profile is attached to this subscription.
                    </div>
                  )}
                </DetailPanel>
              )}
            </section>

            {/* Phase 9D/9E — Contract Activation Readiness panel with readiness-gated action gates */}
            <DetailPanel
              title="Contract Activation Readiness"
              description="Read-only readiness evaluation. Activation and handover blockers are separate. Accounting bridge is advisory. No payment, receipt, journal, stock movement, or reconciliation record is created from this panel."
              className="rounded-[28px]"
            >
              {/* Phase 9E — compact activation/handover gate summary before the full panel */}
              <div
                className="mb-5 grid gap-2 sm:grid-cols-2"
                data-testid="readiness-action-gate-summary"
              >
                <ReadinessGatedActionBanner
                  stage="activation"
                  readiness={subscription.activation_readiness}
                />
                <ReadinessGatedActionBanner
                  stage="handover"
                  readiness={subscription.activation_readiness}
                />
              </div>
              <ContractActivationReadinessPanel readiness={subscription.activation_readiness} />
            </DetailPanel>

            {!isEmiSubscription ? (
              <section className="grid gap-6 xl:grid-cols-2">
                <DetailPanel
                  title="Document vault readiness"
                  description="P3A read-only per-document status for this subscription. Upload, verify, and reject actions are deferred."
                  className="rounded-[28px]"
                >
                  <DocumentReadinessPanel subscriptionId={subscription.id} />
                </DetailPanel>

                <DetailPanel
                  title="Rental asset readiness"
                  description="P3B read-only asset linkage and activation readiness. Reserve, hand-over, and return actions are deferred."
                  className="rounded-[28px]"
                >
                  <RentalAssetReadinessPanel subscriptionId={subscription.id} />
                </DetailPanel>
              </section>
            ) : null}

            <DetailPanel
              title="Delivery tracking"
              description="Current fulfillment path, receiver details, and historical delivery records for this subscription."
              className="rounded-[28px]"
            >
              {currentDelivery ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <DetailValue label="Fulfillment Status" value={subscription.fulfillment_status || "—"} />
                    <DetailValue label="Current Delivery Status" value={currentDelivery.status} />
                    <DetailValue label="Delivery Reference" value={currentDelivery.delivery_reference} />
                    <DetailValue label="Scheduled Date" value={formatDate(currentDelivery.scheduled_date)} />
                    <DetailValue label="Dispatched At" value={formatDateTime(currentDelivery.dispatched_at)} />
                    <DetailValue
                      label="Out for Delivery"
                      value={formatDateTime(currentDelivery.out_for_delivery_at)}
                    />
                    <DetailValue label="Delivered At" value={formatDateTime(currentDelivery.delivered_at)} />
                    <DetailValue label="Receiver" value={currentDelivery.receiver_name || "—"} />
                    <DetailValue label="Receiver Phone" value={currentDelivery.receiver_phone || "—"} />
                    <DetailValue
                      label="Address Snapshot"
                      value={currentDelivery.delivery_address_snapshot || "—"}
                    />
                    <DetailValue label="Notes" value={currentDelivery.notes || "—"} />
                    <DetailValue label="Failure Reason" value={currentDelivery.failure_reason || "—"} />
                  </div>

                  {/* Phase 9E — handover readiness gate before delivery action links */}
                  <div className="mt-4 space-y-3">
                    <ReadinessGatedActionBanner
                      stage="handover"
                      readiness={subscription.activation_readiness}
                    />
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/admin/deliveries/${currentDelivery.id}`}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                      >
                        Open Delivery Detail
                      </Link>
                      <Link
                        href={`/admin/deliveries?subscription=${subscription.id}&portfolio=${
                          String(subscription.plan_type || "").toUpperCase() === "RENT"
                            ? "RENT"
                            : String(subscription.plan_type || "").toUpperCase() === "LEASE"
                              ? "LEASE"
                              : "ADVANCE_EMI"
                        }`}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                      >
                        Open Delivery Workspace
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <ReadinessGatedActionBanner
                    stage="handover"
                    readiness={subscription.activation_readiness}
                  />
                  <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    No delivery record exists for this subscription yet. Create one from the delivery workspace when the item is ready for scheduling or dispatch.
                  </div>
                </div>
              )}

              {deliveryHistory.length > 0 ? (
                <DataTableShell className="mt-6">
                  <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        {["Reference", "Status", "Scheduled", "Delivered", "Receiver"].map((label) => (
                          <th
                            key={label}
                            className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryHistory.map((row) => (
                        <tr key={row.id}>
                          <td className="border-b border-border px-4 py-3 text-sm">
                            <Link
                              href={`/admin/deliveries/${row.id}`}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {row.delivery_reference}
                            </Link>
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm">
                            <ERPStatusBadge status={row.status} />
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm">
                            {formatDate(row.scheduled_date)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm">
                            {formatDateTime(row.delivered_at)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm">
                            {row.receiver_name || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </DataTableShell>
              ) : null}
            </DetailPanel>

            <DetailPanel
              title="Financial position"
              description="Canonical ledger-aware finance summary for this subscription."
              className="rounded-[28px]"
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue label="Total Contract Value" value={money(financialSummary.total_amount)} />
                <DetailValue label="Advance EMI Schedule Total" value={money(financialSummary.total_emi_amount)} />
                <DetailValue label="Paid Amount" value={money(financialSummary.paid_amount)} />
                <DetailValue label="Reversed Amount" value={money(financialSummary.reversed_amount)} />
                <DetailValue label="Waived Amount" value={money(financialSummary.waived_amount)} />
                <DetailValue label="Pending Amount" value={money(financialSummary.pending_amount)} />
                <DetailValue label="Remaining Amount" value={money(financialSummary.remaining_amount)} />
                <DetailValue label="Monthly Amount" value={money(subscription.monthly_amount)} />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue label="Stored Waived Amount" value={money(financialSummary.stored_waived_amount)} />
                <DetailValue label="Waiver Ledger Amount" value={money(financialSummary.waiver_ledger_amount)} />
                <DetailValue label="Active Payments" value={String(activePayments.length)} />
                <DetailValue label="Reversed Payments" value={String(reversedPayments.length)} />
              </div>
            </DetailPanel>

            <DetailPanel
              title="Reconciliation status"
              description="Backend flags for remaining balance alignment, reversals, waivers, and warning conditions."
              className="rounded-[28px]"
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue
                  label="Financially Consistent"
                  value={reconciliationFlags.is_financially_consistent ? "Yes" : "No"}
                />
                <DetailValue
                  label="Pending Matches Remaining"
                  value={reconciliationFlags.pending_matches_remaining ? "Yes" : "No"}
                />
                <DetailValue
                  label="Reversal History"
                  value={reconciliationFlags.has_reversal_history ? "Yes" : "No"}
                />
                <DetailValue
                  label="Waiver History"
                  value={reconciliationFlags.has_waiver_history ? "Yes" : "No"}
                />
              </div>

              {showReconciliationWarning ? (
                <div className="dashboard-posture-danger mt-4 rounded-xl px-4 py-4 text-sm">
                  <div className="font-semibold text-[var(--semantic-danger-fg)]">Review required</div>
                  <ul className="mt-3 space-y-2 text-card-foreground">
                    {financeWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="dashboard-posture-success mt-4 rounded-xl px-4 py-3 text-sm text-card-foreground">
                  Pending, waived, reversed, and remaining amounts align with the canonical backend summary.
                </div>
              )}
            </DetailPanel>

            {isEmiSubscription ? (
              <DetailPanel
                title="Advance EMI schedule"
                description="Paid, waived, reversed, and pending exposure by installment from the canonical detail payload."
                className="rounded-[28px]"
              >
              {emis.length === 0 ? (
                <ERPEmptyState
                  title="No Advance EMI schedule found"
                  description="This subscription does not currently expose EMI rows."
                />
              ) : (
                <DataTableShell>
                  <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Month
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Due Date
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Amount
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Paid
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Reversed
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Waived
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Balance
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Status
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {emis.map((emi) => (
                        <tr key={emi.id} className="align-top">
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            Month {emi.month_no}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {formatDate(emi.due_date)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {money(emi.amount)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {money(emi.paid_amount)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {money(emi.reversed_amount)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {money(emi.waived_amount)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {money(emi.balance_amount)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <ERPStatusBadge
                              status={emi.status}
                              isOverdue={emi.is_overdue}
                            />
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
                            <div className="space-y-1">
                              {emi.is_overdue ? <div>Overdue</div> : null}
                              {!emi.is_status_consistent ? (
                                <div>
                                  Derived finance state suggests {emi.derived_status}.
                                </div>
                              ) : null}
                              {emi.warnings.map((warning) => (
                                <div key={warning}>{warning}</div>
                              ))}
                              {emi.warnings.length === 0 && emi.is_status_consistent ? "—" : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </DataTableShell>
              )}
              </DetailPanel>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-2">
              {isEmiSubscription ? (
                <DetailPanel
                  title="Waived Advance EMI rows"
                  description="Future waived rows should be visible distinctly and never rewrite already paid installments."
                  className="rounded-[28px]"
                >
                  {waivedEmis.length === 0 ? (
                    <ERPEmptyState
                      title="No waived EMI rows"
                      description="No waived EMI rows are currently visible for this subscription."
                    />
                  ) : (
                    <div className="space-y-3">
                      {waivedEmis.map((emi) => (
                        <div
                          key={emi.id}
                          className="rounded-xl border border-blue-200 bg-blue-50 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-blue-900">
                                Month {emi.month_no}
                              </div>
                              <div className="mt-1 text-xs text-blue-800">
                                Due {formatDate(emi.due_date)}
                              </div>
                              <div className="mt-1 text-xs text-blue-800">
                                Waiver ledger: {money(emi.waiver_ledger_amount)}
                              </div>
                            </div>
                            <div className="text-right text-sm font-semibold text-blue-900">
                              <div>{money(emi.amount)}</div>
                              {emi.warnings.length > 0 ? (
                                <div className="mt-1 text-xs font-normal text-blue-800">
                                  {emi.warnings.join(" ")}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </DetailPanel>
              ) : null}

              <DetailPanel
                title="Recent payments"
                description="Operational payment visibility with reversed rows clearly marked."
                className="rounded-[28px]"
              >
                {payments.length === 0 ? (
                  <ERPEmptyState
                    title="No payments recorded"
                    description="No payment rows are currently visible for this subscription."
                  />
                ) : (
                  <div className="space-y-3">
                    {payments.slice(0, 10).map((payment) => (
                      <div
                        key={payment.id}
                        className="rounded-xl border border-border bg-muted/40 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              Payment #{payment.id} · {money(payment.amount)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {payment.method} · {formatDate(payment.payment_date)}
                              {payment.emi_month_no != null
                                ? ` · Advance EMI Month ${payment.emi_month_no}`
                                : ""}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Ref: {payment.reference_no || "—"} · Collected by:{" "}
                              {payment.collected_by_username || "—"}
                            </div>
                          </div>

                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                              payment.is_reversed ? "chip-tone-danger" : "chip-tone-success"
                            )}
                          >
                            {payment.is_reversed ? "REVERSED" : "ACTIVE"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DetailPanel>
            </section>

            <DetailPanel
              title="Audit timeline"
              description="Chronological audit visibility for subscription and EMI actions."
              className="rounded-[28px]"
            >
              {timeline.length === 0 ? (
                <ERPEmptyState
                  title="No audit events"
                  description="No audit trail entries are currently visible for this subscription."
                />
              ) : (
                <Timeline>
                  {timeline.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-muted/30 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-foreground">
                          {item.action_type}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(item.created_at)}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {item.model_name} #{item.object_id ?? "—"} · by{" "}
                        {item.performed_by || "system"}
                      </div>
                    </div>
                  ))}
                </Timeline>
              )}
            </DetailPanel>
          </>
        ) : null}

        {/* Guarantor / co-applicant section */}
        {subscription ? (
          <div className="mt-6">
            <GuarantorSection subscriptionId={subscription.id} />
          </div>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
