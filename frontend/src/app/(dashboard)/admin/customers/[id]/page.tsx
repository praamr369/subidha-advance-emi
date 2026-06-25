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
  Check,
  Search,
  X,
  RefreshCw,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { CustomerRiskPanel } from "@/components/customer-intelligence/CustomerRiskPanel";
import { CustomerTimelinePanel } from "@/components/customer-intelligence/CustomerTimelinePanel";
import KycDocumentPanel from "@/components/kyc/KycDocumentPanel";
import { DetailPanel, KpiCard, QuickActionGrid } from "@/components/ui/operations";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { DetailItem as DetailValue, WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import OtpDeliveryReadinessCard from "@/domains/customers/components/OtpDeliveryReadinessCard";
import {
  buildForgotPasswordHref,
  resolvePasswordResetEmail,
} from "@/lib/auth/password-reset";
import { apiFetch, toArray } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import type { CollectionPrimaryAction } from "@/services/receivables";

// =====================================================
// TYPES
// =====================================================
type CustomerStatus = "ACTIVE" | "INACTIVE" | "UNKNOWN";
type KycStatus =
  | "NOT_PROVIDED"
  | "PENDING"
  | "SUBMITTED"
  | "VERIFIED"
  | "APPROVED"
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
  // Phase 1 additive fields
  customer_source?: string | null;
  customer_code?: string | null;
  profile_photo_url?: string | null;
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
  is_active_collection?: boolean;
};

type ContractReferenceSourceType =
  | "ADVANCE_EMI"
  | "RENT"
  | "LEASE"
  | "DIRECT_SALE";

type ContractReferenceOperationalRow = {
  contract_reference_id: number | null;
  source_type: ContractReferenceSourceType;
  source_id: number | null;
  reference_no: string;
  display_reference: string;
  customer_id: number | null;
  customer_name: string;
  phone_masked: string;
  product_summary: string;
  due_amount: string;
  overdue_amount: string;
  next_due_date?: string | null;
  status: string;
  primary_action: CollectionPrimaryAction;
  allowed_actions: string[];
  disabled_reason?: string | null;
  collection_route: string;
};

type DirectSaleOperationalRow = {
  id: number;
  sale_no?: string | null;
  sale_date?: string | null;
  status?: string;
  branch_name?: string | null;
  billing_invoice_no?: string | null;
  grand_total: string;
  received_total: string;
  balance_total: string;
  active_outstanding_total?: string;
  is_history_only?: boolean;
};

type ReceiptOperationalRow = {
  id: number;
  receipt_no?: string | null;
  receipt_type?: string | null;
  receipt_date?: string | null;
  amount: string;
  finance_account_name?: string | null;
};

type InvoiceOperationalRow = {
  id: number;
  document_no?: string | null;
  invoice_date?: string | null;
  status?: string | null;
  billing_channel?: string | null;
  direct_sale_id?: number | null;
  direct_sale_no?: string | null;
  subscription_id?: number | null;
  grand_total: string;
  received_total: string;
  balance_total: string;
};

type DocumentOperationalRow = {
  id: number;
  subscription_number?: string;
  document_type?: string | null;
  verification_status?: string | null;
  created_at?: string | null;
};

type LeadOperationalRow = {
  id: number;
  name: string;
  phone: string;
  status?: string | null;
  intent?: string | null;
  source?: string | null;
  interested_product?: string | null;
  follow_up_required: boolean;
  follow_up_on?: string | null;
  follow_up_note?: string | null;
  converted_customer_id?: number | null;
  converted_subscription_id?: number | null;
  converted_direct_sale_id?: number | null;
  converted_direct_sale_no?: string | null;
  created_at?: string | null;
  converted_at?: string | null;
  admin_notes?: string | null;
  notes?: string | null;
};

type PartnerLinkageRow = {
  partner_id?: number | null;
  partner_name?: string | null;
  subscription_count: number;
};

type CustomerOperationalProfile = {
  overview: {
    subscription_count: number;
    active_subscriptions: number;
    historical_subscriptions?: number;
    active_contract_value?: string;
    historical_contract_value?: string;
    subscription_outstanding_amount?: string;
    direct_sale_count: number;
    active_direct_sale_count?: number;
    returned_direct_sale_count?: number;
    direct_sale_outstanding_count: number;
    direct_sale_outstanding_total: string;
    receipt_count: number;
    receipt_total: string;
    invoice_count: number;
    active_invoice_count?: number;
    historical_invoice_count?: number;
    invoice_outstanding_total: string;
    lead_count: number;
    lead_open_count: number;
    quotation_estimate_count: number;
  };
  direct_sales: {
    summary: {
      total_count: number;
      active_count?: number;
      history_count?: number;
      outstanding_count: number;
      gross_total: string;
      received_total: string;
      outstanding_total: string;
      historical_total?: string;
    };
    rows: DirectSaleOperationalRow[];
  };
  contract_references: {
    summary: {
      total_count: number;
      advance_emi_count: number;
      rent_count: number;
      lease_count: number;
      direct_sale_count: number;
    };
    rows: ContractReferenceOperationalRow[];
  };
  ledger_summary: {
    entry_count: number;
    total_credits: string;
    total_debits: string;
    net_subscription_collections: string;
    active_ledger_credits?: string;
    active_ledger_debits?: string;
    direct_sale_receivable_total: string;
  };
  receipts_documents: {
    summary: {
      receipt_count: number;
      receipt_total: string;
      active_receipt_count?: number;
      active_receipt_total?: string;
      document_count: number;
      invoice_count: number;
      invoice_posted_count: number;
      invoice_total: string;
      invoice_outstanding_total: string;
    };
    receipts: ReceiptOperationalRow[];
    invoices: InvoiceOperationalRow[];
    documents: DocumentOperationalRow[];
  };
  leads: {
    summary: {
      total_count: number;
      open_count: number;
      converted_count: number;
      quotation_count: number;
      estimate_count: number;
      follow_up_required_count: number;
      follow_up_due_count: number;
    };
    rows: LeadOperationalRow[];
  };
  quotation_estimates: {
    summary: {
      total_count: number;
      quotation_count: number;
      estimate_count: number;
    };
    rows: LeadOperationalRow[];
  };
  partner_linkages: {
    count: number;
    rows: PartnerLinkageRow[];
  };
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
  if (status === "SUBMITTED") return "SUBMITTED";
  if (status === "VERIFIED") return "VERIFIED";
  if (status === "APPROVED") return "APPROVED";
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

function normalizeContractReferenceSourceType(
  value: unknown
): ContractReferenceSourceType {
  const sourceType = String(value || "").toUpperCase();
  if (sourceType === "RENT") return "RENT";
  if (sourceType === "LEASE") return "LEASE";
  if (sourceType === "DIRECT_SALE") return "DIRECT_SALE";
  return "ADVANCE_EMI";
}

function normalizeContractReferencePrimaryAction(
  value: unknown
): CollectionPrimaryAction {
  const v = String(value || "").toUpperCase();
  if (v === "COLLECT_DIRECT_SALE") return "COLLECT_DIRECT_SALE";
  if (v === "VIEW_ONLY") return "VIEW_ONLY";
  if (v === "DISABLED") return "DISABLED";
  return "COLLECT_EMI";
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
    is_active_collection: raw.is_active_collection === true || !isReversed,
  };
}

function normalizeCustomerOperationalProfile(
  raw: Record<string, unknown>
): CustomerOperationalProfile {
  const overview = toObject(raw.overview) ?? {};
  const directSales = toObject(raw.direct_sales) ?? {};
  const directSaleSummary = toObject(directSales.summary) ?? {};
  const contractReferences = toObject(raw.contract_references) ?? {};
  const contractReferenceSummary = toObject(contractReferences.summary) ?? {};
  const ledgerSummary = toObject(raw.ledger_summary) ?? {};
  const receiptsDocuments = toObject(raw.receipts_documents) ?? {};
  const receiptsSummary = toObject(receiptsDocuments.summary) ?? {};
  const leads = toObject(raw.leads) ?? {};
  const leadsSummary = toObject(leads.summary) ?? {};
  const quotationEstimates = toObject(raw.quotation_estimates) ?? {};
  const quotationEstimateSummary = toObject(quotationEstimates.summary) ?? {};
  const partnerLinkages = toObject(raw.partner_linkages) ?? {};

  return {
    overview: {
      subscription_count: toNumber(overview.subscription_count),
      active_subscriptions: toNumber(overview.active_subscriptions),
      historical_subscriptions: toNumber(overview.historical_subscriptions),
      active_contract_value: toMoneyString(overview.active_contract_value),
      historical_contract_value: toMoneyString(overview.historical_contract_value),
      subscription_outstanding_amount: toMoneyString(overview.subscription_outstanding_amount),
      direct_sale_count: toNumber(overview.direct_sale_count),
      active_direct_sale_count: toNumber(overview.active_direct_sale_count),
      returned_direct_sale_count: toNumber(overview.returned_direct_sale_count),
      direct_sale_outstanding_count: toNumber(
        overview.direct_sale_outstanding_count
      ),
      direct_sale_outstanding_total: toMoneyString(
        overview.direct_sale_outstanding_total
      ),
      receipt_count: toNumber(overview.receipt_count),
      receipt_total: toMoneyString(overview.receipt_total),
      invoice_count: toNumber(overview.invoice_count),
      active_invoice_count: toNumber(overview.active_invoice_count),
      historical_invoice_count: toNumber(overview.historical_invoice_count),
      invoice_outstanding_total: toMoneyString(overview.invoice_outstanding_total),
      lead_count: toNumber(overview.lead_count),
      lead_open_count: toNumber(overview.lead_open_count),
      quotation_estimate_count: toNumber(overview.quotation_estimate_count),
    },
    direct_sales: {
      summary: {
        total_count: toNumber(directSaleSummary.total_count),
        active_count: toNumber(directSaleSummary.active_count),
        history_count: toNumber(directSaleSummary.history_count),
        outstanding_count: toNumber(directSaleSummary.outstanding_count),
        gross_total: toMoneyString(directSaleSummary.gross_total),
        received_total: toMoneyString(directSaleSummary.received_total),
        outstanding_total: toMoneyString(directSaleSummary.outstanding_total),
        historical_total: toMoneyString(directSaleSummary.historical_total),
      },
      rows: extractNestedArray(directSales, ["rows"]).map((row) => ({
        id: toNumber(row.id),
        sale_no: toNullableString(row.sale_no),
        sale_date: toNullableString(row.sale_date),
        status: toStringValue(row.status) || "UNKNOWN",
        branch_name:
          toNullableString(row.branch_name) ?? toNullableString(row.branch_code),
        billing_invoice_no: toNullableString(row.billing_invoice_no),
        grand_total: toMoneyString(row.grand_total),
        received_total: toMoneyString(row.received_total),
        balance_total: toMoneyString(row.balance_total),
        active_outstanding_total: toMoneyString(
          row.active_outstanding_total ?? row.balance_total
        ),
        is_history_only: row.is_history_only === true,
      })),
    },
    contract_references: {
      summary: {
        total_count: toNumber(contractReferenceSummary.total_count),
        advance_emi_count: toNumber(contractReferenceSummary.advance_emi_count),
        rent_count: toNumber(contractReferenceSummary.rent_count),
        lease_count: toNumber(contractReferenceSummary.lease_count),
        direct_sale_count: toNumber(contractReferenceSummary.direct_sale_count),
      },
      rows: extractNestedArray(contractReferences, ["rows"]).map((row) => ({
        contract_reference_id: toNullableNumber(row.contract_reference_id) ?? null,
        source_type: normalizeContractReferenceSourceType(row.source_type),
        source_id: toNullableNumber(row.source_id) ?? null,
        reference_no: toStringValue(row.reference_no),
        display_reference:
          toStringValue(row.display_reference) || toStringValue(row.reference_no),
        customer_id: toNullableNumber(row.customer_id) ?? null,
        customer_name: toStringValue(row.customer_name),
        phone_masked: toStringValue(row.phone_masked),
        product_summary: toStringValue(row.product_summary),
        due_amount: toMoneyString(row.due_amount),
        overdue_amount: toMoneyString(row.overdue_amount),
        next_due_date: toNullableString(row.next_due_date),
        status: toStringValue(row.status),
        primary_action: normalizeContractReferencePrimaryAction(row.primary_action),
        allowed_actions: Array.isArray(row.allowed_actions)
          ? row.allowed_actions.filter(
              (item): item is string => typeof item === "string"
            )
          : [],
        disabled_reason: toNullableString(row.disabled_reason),
        collection_route: toStringValue(row.collection_route),
      })),
    },
    ledger_summary: {
      entry_count: toNumber(ledgerSummary.entry_count),
      total_credits: toMoneyString(ledgerSummary.total_credits),
      total_debits: toMoneyString(ledgerSummary.total_debits),
      net_subscription_collections: toMoneyString(
        ledgerSummary.net_subscription_collections
      ),
      active_ledger_credits: toMoneyString(ledgerSummary.active_ledger_credits),
      active_ledger_debits: toMoneyString(ledgerSummary.active_ledger_debits),
      direct_sale_receivable_total: toMoneyString(
        ledgerSummary.direct_sale_receivable_total
      ),
    },
    receipts_documents: {
      summary: {
        receipt_count: toNumber(receiptsSummary.receipt_count),
        receipt_total: toMoneyString(receiptsSummary.receipt_total),
        active_receipt_count: toNumber(receiptsSummary.active_receipt_count),
        active_receipt_total: toMoneyString(receiptsSummary.active_receipt_total),
        document_count: toNumber(receiptsSummary.document_count),
        invoice_count: toNumber(receiptsSummary.invoice_count),
        invoice_posted_count: toNumber(receiptsSummary.invoice_posted_count),
        invoice_total: toMoneyString(receiptsSummary.invoice_total),
        invoice_outstanding_total: toMoneyString(receiptsSummary.invoice_outstanding_total),
      },
      receipts: extractNestedArray(receiptsDocuments, ["receipts"]).map((row) => ({
        id: toNumber(row.id),
        receipt_no: toNullableString(row.receipt_no),
        receipt_type: toNullableString(row.receipt_type),
        receipt_date: toNullableString(row.receipt_date),
        amount: toMoneyString(row.amount),
        finance_account_name: toNullableString(row.finance_account_name),
      })),
      invoices: extractNestedArray(receiptsDocuments, ["invoices"]).map((row) => ({
        id: toNumber(row.id),
        document_no: toNullableString(row.document_no),
        invoice_date: toNullableString(row.invoice_date),
        status: toNullableString(row.status),
        billing_channel: toNullableString(row.billing_channel),
        direct_sale_id: toNullableNumber(row.direct_sale_id),
        direct_sale_no: toNullableString(row.direct_sale_no),
        subscription_id: toNullableNumber(row.subscription_id),
        grand_total: toMoneyString(row.grand_total),
        received_total: toMoneyString(row.received_total),
        balance_total: toMoneyString(row.balance_total),
      })),
      documents: extractNestedArray(receiptsDocuments, ["documents"]).map((row) => ({
        id: toNumber(row.id),
        subscription_number: toStringValue(row.subscription_number) || undefined,
        document_type: toNullableString(row.document_type),
        verification_status: toNullableString(row.verification_status),
        created_at: toNullableString(row.created_at),
      })),
    },
    leads: {
      summary: {
        total_count: toNumber(leadsSummary.total_count),
        open_count: toNumber(leadsSummary.open_count),
        converted_count: toNumber(leadsSummary.converted_count),
        quotation_count: toNumber(leadsSummary.quotation_count),
        estimate_count: toNumber(leadsSummary.estimate_count),
        follow_up_required_count: toNumber(leadsSummary.follow_up_required_count),
        follow_up_due_count: toNumber(leadsSummary.follow_up_due_count),
      },
      rows: extractNestedArray(leads, ["rows"]).map((row) => ({
        id: toNumber(row.id),
        name: toStringValue(row.name) || `Lead #${toNumber(row.id)}`,
        phone: toStringValue(row.phone),
        status: toNullableString(row.status),
        intent: toNullableString(row.intent),
        source: toNullableString(row.source),
        interested_product: toNullableString(row.interested_product),
        follow_up_required: row.follow_up_required === true,
        follow_up_on: toNullableString(row.follow_up_on),
        follow_up_note: toNullableString(row.follow_up_note),
        converted_customer_id: toNullableNumber(row.converted_customer_id),
        converted_subscription_id: toNullableNumber(row.converted_subscription_id),
        converted_direct_sale_id: toNullableNumber(row.converted_direct_sale_id),
        converted_direct_sale_no: toNullableString(row.converted_direct_sale_no),
        created_at: toNullableString(row.created_at),
        converted_at: toNullableString(row.converted_at),
        admin_notes: toNullableString(row.admin_notes),
        notes: toNullableString(row.notes),
      })),
    },
    quotation_estimates: {
      summary: {
        total_count: toNumber(quotationEstimateSummary.total_count),
        quotation_count: toNumber(quotationEstimateSummary.quotation_count),
        estimate_count: toNumber(quotationEstimateSummary.estimate_count),
      },
      rows: extractNestedArray(quotationEstimates, ["rows"]).map((row) => ({
        id: toNumber(row.id),
        name: toStringValue(row.name) || `Lead #${toNumber(row.id)}`,
        phone: toStringValue(row.phone),
        status: toNullableString(row.status),
        intent: toNullableString(row.intent),
        source: toNullableString(row.source),
        interested_product: toNullableString(row.interested_product),
        follow_up_required: row.follow_up_required === true,
        follow_up_on: toNullableString(row.follow_up_on),
        follow_up_note: toNullableString(row.follow_up_note),
        converted_customer_id: toNullableNumber(row.converted_customer_id),
        converted_subscription_id: toNullableNumber(row.converted_subscription_id),
        converted_direct_sale_id: toNullableNumber(row.converted_direct_sale_id),
        converted_direct_sale_no: toNullableString(row.converted_direct_sale_no),
        created_at: toNullableString(row.created_at),
        converted_at: toNullableString(row.converted_at),
        admin_notes: toNullableString(row.admin_notes),
        notes: toNullableString(row.notes),
      })),
    },
    partner_linkages: {
      count: toNumber(partnerLinkages.count),
      rows: extractNestedArray(partnerLinkages, ["rows"]).map((row) => ({
        partner_id: toNullableNumber(row.partner_id),
        partner_name: toNullableString(row.partner_name),
        subscription_count: toNumber(row.subscription_count),
      })),
    },
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

function contractReferenceLabel(sourceType: ContractReferenceSourceType): string {
  if (sourceType === "ADVANCE_EMI") return "Advance EMI";
  if (sourceType === "DIRECT_SALE") return "Direct Sale";
  return sourceType.charAt(0) + sourceType.slice(1).toLowerCase();
}

function contractReferenceTone(
  sourceType: ContractReferenceSourceType
): "success" | "warning" | "danger" | "info" | "default" {
  if (sourceType === "ADVANCE_EMI") return "success";
  if (sourceType === "DIRECT_SALE") return "warning";
  if (sourceType === "RENT") return "info";
  return "default";
}

function ContractReferenceList({
  rows,
  emptyTitle,
  emptyDescription,
}: {
  rows: ContractReferenceOperationalRow[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const key = `${row.source_type}-${row.source_id ?? row.reference_no}`;
        const route = row.collection_route?.trim() || "";
        const canCollectEmi =
          row.primary_action === "COLLECT_EMI" && Boolean(route);
        const canCollectDirectSale =
          row.primary_action === "COLLECT_DIRECT_SALE" && Boolean(route);
        const disabledReason =
          row.disabled_reason || "Collection is not available for this contract.";

        return (
          <div
            key={key}
            className="rounded-xl border border-border bg-background p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    status={contractReferenceLabel(row.source_type)}
                    tone={contractReferenceTone(row.source_type)}
                  />
                  <span className="break-all text-sm font-semibold text-foreground">
                    {row.display_reference || row.reference_no}
                  </span>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {row.product_summary || "No product summary"} · Status {row.status || "—"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {row.customer_name || "Customer"} · {row.phone_masked || "Phone masked"}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
                <div className="rounded-xl border border-border bg-muted/50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Due
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {formatRupee(row.due_amount)}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Overdue
                  </div>
                  <div className="mt-1 text-sm font-semibold text-amber-900">
                    {formatRupee(row.overdue_amount)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted/50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Next Due
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {formatDate(row.next_due_date)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {canCollectEmi ? (
                <Link
                  href={route}
                  title="Opens the collection desk using the canonical route from ContractReference."
                  className="inline-flex items-center rounded-md border border-emerald-900 bg-emerald-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800"
                >
                  Collect EMI
                </Link>
              ) : null}

              {canCollectDirectSale ? (
                <Link
                  href={route}
                  title="Opens the collection desk using the canonical route from ContractReference."
                  className="inline-flex items-center rounded-md border border-amber-900 bg-amber-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800"
                >
                  Collect Direct-Sale Balance
                </Link>
              ) : null}

              {!canCollectEmi && !canCollectDirectSale ? (
                <span
                  title={disabledReason}
                  className="inline-flex cursor-not-allowed items-center rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground"
                >
                  {row.primary_action === "VIEW_ONLY" ? "View only" : "Collection disabled"}
                </span>
              ) : null}
            </div>

            {!canCollectEmi && !canCollectDirectSale ? (
              <div className="mt-2 text-xs text-muted-foreground">{disabledReason}</div>
            ) : null}
          </div>
        );
      })}
    </div>
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
              const isActiveContract =
                row.status === "ACTIVE" ||
                row.status === "PENDING";
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
                      {formatRupee(row.total_amount)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      EMI {formatRupee(row.monthly_amount)}
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
                        {isActiveContract ? "Payments" : "Payment History"}
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
                  {formatRupee(row.amount)}
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

async function adminChangeUserUsername(
  userId: number,
  payload: { new_username: string; reason: string }
): Promise<{ username: string; changed: boolean; requires_relogin: boolean }> {
  return apiFetch<{ username: string; changed: boolean; requires_relogin: boolean }>(
    `/admin/users/${userId}/username/`,
    {
      method: "PATCH",
      body: payload,
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
  const [operationalProfile, setOperationalProfile] =
    useState<CustomerOperationalProfile | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKyc, setSavingKyc] = useState(false);
  const [kycReason, setKycReason] = useState("");
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycSuccess, setKycSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [usernameReason, setUsernameReason] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!customerId) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [customerResult, subscriptionResult, paymentResult, operationalResult] =
          await Promise.allSettled([
            apiFetch<Record<string, unknown>>(`/admin/customers/${customerId}/`),
            apiFetch<unknown>(`/admin/subscriptions/?customer=${customerId}`),
            apiFetch<unknown>(`/admin/payments/?customer=${customerId}`),
            apiFetch<Record<string, unknown>>(
              `/admin/customers/${customerId}/operational-profile/`
            ),
          ]);

        if (customerResult.status !== "fulfilled") {
          throw customerResult.reason;
        }

        const basePayload = customerResult.value;
        const nextWarnings: string[] = [];

        const normalizedCustomer = normalizeCustomerDetail(basePayload);

        let nextSubscriptions: SubscriptionPreviewRow[] = [];
        let nextPayments: PaymentPreviewRow[] = [];
        let nextOperationalProfile: CustomerOperationalProfile | null = null;

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

        if (operationalResult.status === "fulfilled") {
          nextOperationalProfile = normalizeCustomerOperationalProfile(
            operationalResult.value
          );
        } else {
          nextWarnings.push(
            "Operational profile sections could not be loaded from the dedicated customer operations endpoint."
          );
        }

        setCustomer(normalizedCustomer);
        setSubscriptions(nextSubscriptions);
        setPayments(nextPayments);
        setOperationalProfile(nextOperationalProfile);
        setWarnings(nextWarnings);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setCustomer(null);
          setSubscriptions([]);
          setPayments([]);
          setOperationalProfile(null);
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
    () =>
      operationalProfile?.overview.active_subscriptions ??
      subscriptions.filter((row) => row.status === "ACTIVE").length,
    [operationalProfile, subscriptions]
  );

  const totalContractValue = useMemo(
    () => Number(operationalProfile?.overview.active_contract_value || 0),
    [operationalProfile]
  );

  const historicalContractValue = useMemo(
    () => Number(operationalProfile?.overview.historical_contract_value || 0),
    [operationalProfile]
  );

  const activePayments = useMemo(
    () => payments.filter((row) => row.is_active_collection !== false && !row.is_reversed),
    [payments]
  );

  const latestSubscription = useMemo(
    () => subscriptions.find((row) => row.status === "ACTIVE") ?? null,
    [subscriptions]
  );

  const activeLinkedSubscriptions = useMemo(
    () => subscriptions.filter((row) => row.status === "ACTIVE" || row.status === "PENDING"),
    [subscriptions]
  );

  const historicalLinkedSubscriptions = useMemo(
    () => subscriptions.filter((row) => row.status !== "ACTIVE" && row.status !== "PENDING"),
    [subscriptions]
  );

  const draftDirectSales = useMemo(
    () =>
      operationalProfile?.direct_sales.rows.filter((row) => row.status === "DRAFT") ?? [],
    [operationalProfile]
  );

  const receivableDirectSales = useMemo(
    () =>
      operationalProfile?.direct_sales.rows.filter(
        (row) =>
          row.is_history_only !== true &&
          row.status === "INVOICED" &&
          Number(row.active_outstanding_total || 0) > 0
      ) ?? [],
    [operationalProfile]
  );

  const firstOutstandingDirectSale = useMemo(
    () => receivableDirectSales[0] ?? null,
    [receivableDirectSales]
  );

  const contractReferenceRows = useMemo(
    () => operationalProfile?.contract_references.rows ?? [],
    [operationalProfile]
  );
  const advanceEmiReferenceRows = useMemo(
    () => contractReferenceRows.filter((row) => row.source_type === "ADVANCE_EMI"),
    [contractReferenceRows]
  );
  const rentLeaseReferenceRows = useMemo(
    () =>
      contractReferenceRows.filter(
        (row) => row.source_type === "RENT" || row.source_type === "LEASE"
      ),
    [contractReferenceRows]
  );
  const dueReferenceRows = useMemo(
    () =>
      contractReferenceRows.filter(
        (row) => Number(row.due_amount || 0) > 0 || Number(row.overdue_amount || 0) > 0
      ),
    [contractReferenceRows]
  );

  const latestPayment = useMemo(
    () => payments.find((row) => row.is_active_collection !== false) ?? null,
    [payments]
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
        href: `/admin/subscriptions/advance-emi/create?customer=${customer.id}`,
        label: "Create Subscription",
        variant: "secondary",
      });
      nextActions.push({
        href: `/admin/billing/direct-sales?customer=${customer.id}`,
        label: "Direct Sale Desk",
        variant: "secondary",
      });
      nextActions.push({
        href: `/admin/collections?customer=${customer.id}`,
        label: "Collections",
        variant: "secondary",
      });
    }

    if (firstOutstandingDirectSale) {
      nextActions.push({
        href: `/admin/finance/collect?workflow=direct-sale&sale_id=${firstOutstandingDirectSale.id}`,
        label: "Collect Direct Sale",
        variant: "primary",
      });
    }

    if (latestSubscription) {
      nextActions.push({
        href: `/admin/finance/collect?subscription=${latestSubscription.id}`,
        label: "Collect Subscription",
        variant: "secondary",
      });
    }

    return nextActions;
  }, [customer, firstOutstandingDirectSale, latestSubscription]);

  async function handleKycDecision(
    status: "APPROVED" | "VERIFIED" | "REJECTED" | "PENDING" | "SUBMITTED"
  ) {
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
        status: status as "VERIFIED" | "REJECTED",
        reason: kycReason.trim() || undefined,
      });

      setCustomer((current) =>
        current
          ? {
              ...current,
              kyc_status: response.kyc_status as KycStatus,
              kyc_reviewed_by_username: response.kyc_reviewed_by_username ?? null,
              kyc_reviewed_at: response.kyc_reviewed_at ?? null,
              kyc_rejection_reason: response.kyc_rejection_reason ?? null,
            }
          : current
      );

      setKycSuccess(
        status === "APPROVED" || status === "VERIFIED"
          ? "KYC approved successfully."
          : status === "REJECTED"
          ? "KYC rejected successfully."
          : "KYC status updated."
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

  async function handleAdminUsernameChange() {
    if (!customer?.user_id) {
      setUsernameError("No linked login user found.");
      return;
    }
    setUsernameSaving(true);
    setUsernameError(null);
    setUsernameSuccess(null);
    try {
      const response = await adminChangeUserUsername(customer.user_id, {
        new_username: newUsername.trim(),
        reason: usernameReason.trim(),
      });
      setUsernameSuccess(
        response.changed ? "Username updated. User must sign in again." : "Username unchanged."
      );
      setNewUsername("");
      setUsernameReason("");
      await loadPage("refresh");
    } catch (err) {
      setUsernameError(toErrorMessage(err));
    } finally {
      setUsernameSaving(false);
    }
  }

  const kycTone: "success" | "warning" | "danger" | "default" =
    customer?.kyc_status === "VERIFIED" || customer?.kyc_status === "APPROVED"
      ? "success"
      : customer?.kyc_status === "REJECTED"
      ? "danger"
      : customer?.kyc_status === "SUBMITTED"
      ? "warning"
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
    <ERPPageShell
      title={customer?.name || `Customer #${customerId ?? "—"}`}
      subtitle="Inspect KYC state, direct-sale exposure, subscription contracts, collections, receipts, and partner linkage from one operational customer workspace."
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
          label: "Active Contract Value",
          value: formatRupee(totalContractValue),
          tone: "success",
        },
        {
          label: "Historical Contract Value",
          value: formatRupee(historicalContractValue),
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
        <DetailPanel
          title="Workspace controls"
          description="Refresh customer truth from the server without leaving this profile."
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </DetailPanel>

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
            {/* Phase 9B-NF7A — Object detail cockpit: module-ownership posture.
                Additive copy only. This page is the identity source; money,
                collection, contract, and accounting truth stay in their owning
                modules and are reached by navigation, never posted from here. */}
            <section className="rounded-xl border border-border bg-muted/30 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Profiles & Parties · Customer profile source
              </p>
              <h2 className="mt-2 text-base font-semibold text-foreground">
                This page is the Customer profile source. It owns customer identity and KYC only — financial truth lives in the modules below and is never posted from this profile.
              </h2>
              <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Money posture belongs to Finance Operations. This page links to outstandings and advances; it does not create payments or journals.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Collections belong to Collections & Cashier. Receipts and cashier close are recorded there, not from this profile.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Contracts belong to Sales & Contracts. Subscriptions and direct sales are created and amended in that module.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Accounting bridge and reconciliation evidence belong to Accounting & Reconciliation.
                </li>
              </ul>
            </section>

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
            <QuickActionGrid className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard
                label="Active subscriptions"
                value={String(activeSubscriptionCount)}
                helper="Subscriptions with status ACTIVE"
              />
              <KpiCard
                label="Active contract value"
                value={formatRupee(totalContractValue)}
                helper="Excludes cancelled/history-only subscriptions"
              />
              <KpiCard
                label="Historical contract value"
                value={formatRupee(historicalContractValue)}
                helper="Cancelled/archived contracts preserved for audit"
              />
              <KpiCard
                label="Active payments"
                value={String(activePayments.length)}
                helper="Non-reversed payments in preview"
              />
              <KpiCard
                label="KYC status"
                value={customer.kyc_status}
                helper={
                  customer.kyc_status === "VERIFIED" || customer.kyc_status === "APPROVED"
                    ? "Verified or approved"
                    : customer.kyc_status === "REJECTED"
                      ? "Rejected — review required"
                      : "Compliance posture"
                }
              />
              <KpiCard
                label="Active direct-sale outstanding"
                value={formatRupee(
                  operationalProfile?.direct_sales.summary.outstanding_total || "0.00"
                )}
                helper={`Open receivables ${operationalProfile?.direct_sales.summary.outstanding_count ?? 0} (active only)`}
              />
              <KpiCard
                label="Receipts / invoices"
                value={`${operationalProfile?.receipts_documents.summary.receipt_count ?? 0} / ${operationalProfile?.receipts_documents.summary.invoice_count ?? 0}`}
                helper="Retail receipts and invoices linked to this profile"
              />
            </QuickActionGrid>

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
                  {customer.customer_source && (
                    <DetailValue label="Source" value={customer.customer_source} />
                  )}
                  {customer.customer_code && (
                    <DetailValue label="Customer Code" value={customer.customer_code} />
                  )}
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

                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  This changes login username only. Customer/partner IDs and financial history remain unchanged.
                </div>
                {usernameError ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {usernameError}
                  </div>
                ) : null}
                {usernameSuccess ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {usernameSuccess}
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input
                    value={newUsername}
                    onChange={(event) => setNewUsername(event.target.value)}
                    placeholder="New username"
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  />
                  <input
                    value={usernameReason}
                    onChange={(event) => setUsernameReason(event.target.value)}
                    placeholder="Reason (required)"
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAdminUsernameChange()}
                    disabled={
                      usernameSaving ||
                      !customer.user_id ||
                      !newUsername.trim() ||
                      !usernameReason.trim()
                    }
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {usernameSaving ? "Changing username..." : "Change Username"}
                  </button>
                </div>

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
                      onClick={() => void handleKycDecision("APPROVED")}
                      disabled={savingKyc}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Check className="h-4 w-4" />
                      {savingKyc ? "Saving..." : "Approve KYC"}
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

                    <button
                      type="button"
                      onClick={() => void handleKycDecision("PENDING")}
                      disabled={savingKyc}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reset to Pending
                    </button>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/subscriptions/advance-emi/create?customer=${customer.id}`}
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

            <KycDocumentPanel mode="admin" owner="customer" ownerId={customer.id} />

            <SectionCard
              title="Customer Risk Profile"
              description="P3C read-only risk band and reason codes computed from operational history. No write actions are available."
            >
              <CustomerRiskPanel customerId={customer.id} />
            </SectionCard>

            <SectionCard
              title="Customer Operational Timeline"
              description="P3D aggregated read-only event history for this customer — newest first. Sensitive KYC file URLs are not exposed."
            >
              <CustomerTimelinePanel customerId={customer.id} />
            </SectionCard>

            {operationalProfile ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <SectionCard
                  title="Customer Workflow Rails"
                  description="Keep retail direct-sale operations and subscription-sale operations visible together while preserving separate posting, collection, and reconciliation paths."
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                        Direct Sale
                      </div>
                      <div className="mt-2 text-lg font-semibold text-amber-950">
                        {operationalProfile.direct_sales.summary.active_count ?? operationalProfile.direct_sales.summary.total_count} active bill(s)
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-amber-900">
                        <div>
                          Outstanding {formatRupee(operationalProfile.direct_sales.summary.outstanding_total)}
                        </div>
                        <div>
                          Collected {formatRupee(operationalProfile.direct_sales.summary.received_total)}
                        </div>
                        <div>
                          Draft sales {draftDirectSales.length}
                        </div>
                        <div>
                          Open receivables {receivableDirectSales.length}
                        </div>
                        <div>
                          History-only bills {operationalProfile.direct_sales.summary.history_count ?? 0}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={`/admin/billing/direct-sales?customer=${customer.id}`}
                          className="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 shadow-sm transition hover:bg-amber-100/60"
                        >
                          Open Direct Sales
                        </Link>
                        {firstOutstandingDirectSale ? (
                          <Link
                            href={`/admin/finance/collect?workflow=direct-sale&sale_id=${firstOutstandingDirectSale.id}`}
                            className="inline-flex items-center rounded-md border border-amber-900 bg-amber-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800"
                          >
                            Collect Direct-Sale Balance
                          </Link>
                        ) : draftDirectSales.length > 0 ? (
                          <Link
                            href={`/admin/billing/direct-sales?focus_sale=${draftDirectSales[0].id}`}
                            className="inline-flex items-center rounded-md border border-orange-700 bg-orange-700 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600"
                          >
                            Open direct-sale draft
                          </Link>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground">
                            No active receivable action
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        Subscription Sale
                      </div>
                      <div className="mt-2 text-lg font-semibold text-emerald-950">
                        {operationalProfile.overview.active_subscriptions} active contract(s)
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-emerald-900">
                        <div>
                          Active contracts {operationalProfile.overview.active_subscriptions}
                        </div>
                        <div>
                          Historical contracts {operationalProfile.overview.historical_subscriptions ?? 0}
                        </div>
                        <div>
                          Net collections {formatRupee(operationalProfile.ledger_summary.net_subscription_collections)}
                        </div>
                        <div>
                          Latest payment {latestPayment ? formatRupee(latestPayment.amount) : "—"}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={`/admin/subscriptions?customer=${customer.id}`}
                          className="inline-flex items-center rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-950 shadow-sm transition hover:bg-emerald-100/60"
                        >
                          Open Subscriptions
                        </Link>
                        <Link
                          href={`/admin/subscriptions/advance-emi/create?customer=${customer.id}`}
                          className="inline-flex items-center rounded-md border border-emerald-900 bg-emerald-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800"
                        >
                          Create Subscription
                        </Link>
                        {latestSubscription ? (
                          <Link
                            href={`/admin/finance/collect?subscription=${latestSubscription.id}`}
                            className="inline-flex items-center rounded-md border border-emerald-900 bg-white px-3 py-2 text-sm font-medium text-emerald-950 shadow-sm transition hover:bg-emerald-100/60"
                          >
                            Collect EMI
                          </Link>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground">
                            No active EMI collect action
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Operational Finance Summary"
                  description="Unified customer view across subscription contracts, direct-sale receivables, receipts, and ledger-backed collections."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailValue
                      label="Active subscription contracts"
                      value={String(operationalProfile.overview.active_subscriptions)}
                    />
                    <DetailValue
                      label="Historical subscription contracts"
                      value={String(operationalProfile.overview.historical_subscriptions ?? 0)}
                    />
                    <DetailValue
                      label="Active direct sales"
                      value={String(operationalProfile.overview.active_direct_sale_count ?? 0)}
                    />
                    <DetailValue
                      label="Returned/reversed direct sales"
                      value={String(operationalProfile.overview.returned_direct_sale_count ?? 0)}
                    />
                    <DetailValue
                      label="Active direct-sale outstanding"
                      value={formatRupee(
                        operationalProfile.overview.direct_sale_outstanding_total
                      )}
                    />
                    <DetailValue
                      label="Active receipts"
                      value={`${operationalProfile.receipts_documents.summary.active_receipt_count ?? 0} receipt(s)`}
                    />
                    <DetailValue
                      label="Historical receipts / invoices"
                      value={`${operationalProfile.receipts_documents.summary.receipt_count} / ${operationalProfile.receipts_documents.summary.invoice_count}`}
                    />
                    <DetailValue
                      label="Active invoice outstanding"
                      value={formatRupee(
                        operationalProfile.receipts_documents.summary.invoice_outstanding_total
                      )}
                    />
                    <DetailValue
                      label="Open leads"
                      value={String(operationalProfile.leads.summary.open_count)}
                    />
                    <DetailValue
                      label="Quotation / estimate"
                      value={`${operationalProfile.quotation_estimates.summary.quotation_count} / ${operationalProfile.quotation_estimates.summary.estimate_count}`}
                    />
                    <DetailValue
                      label="Active ledger credits"
                      value={formatRupee(operationalProfile.ledger_summary.active_ledger_credits)}
                    />
                    <DetailValue
                      label="Active net collections"
                      value={formatRupee(
                        operationalProfile.ledger_summary.net_subscription_collections
                      )}
                    />
                  </div>

                  <div className="mt-4 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    Direct-sale receivables remain operationally separate from subscription EMI ledger entries. The unified customer profile keeps both visible without mixing their posting rules.
                  </div>
                </SectionCard>

                <SectionCard
                  title="Partner Linkage"
                  description="Partner or referral linkage visible from subscription-side activity."
                >
                  {operationalProfile.partner_linkages.rows.length === 0 ? (
                    <EmptyState
                      title="No partner linkage"
                      description="No partner-linked subscriptions were returned for this customer."
                    />
                  ) : (
                    <div className="space-y-3">
                      {operationalProfile.partner_linkages.rows.map((row) => (
                        <div
                          key={`${row.partner_id ?? "unknown"}-${row.partner_name ?? "partner"}`}
                          className="rounded-xl border border-border bg-background px-4 py-3"
                        >
                          <div className="text-sm font-semibold text-foreground">
                            {row.partner_name || `Partner ${row.partner_id ?? "—"}`}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.subscription_count} linked subscription(s)
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>
            ) : null}

            {operationalProfile ? (
              <>
                <SectionCard
                  title="Contracts"
                  description="Search/display references across Advance EMI, rent, lease, and direct sale. These rows are index records only; financial truth remains in the source ledgers."
                >
                  <div className="mb-4 grid gap-3 sm:grid-cols-5">
                    <DetailValue
                      label="Total"
                      value={String(operationalProfile.contract_references.summary.total_count)}
                    />
                    <DetailValue
                      label="Advance EMI"
                      value={String(operationalProfile.contract_references.summary.advance_emi_count)}
                    />
                    <DetailValue
                      label="Rent"
                      value={String(operationalProfile.contract_references.summary.rent_count)}
                    />
                    <DetailValue
                      label="Lease"
                      value={String(operationalProfile.contract_references.summary.lease_count)}
                    />
                    <DetailValue
                      label="Direct Sale"
                      value={String(operationalProfile.contract_references.summary.direct_sale_count)}
                    />
                  </div>
                  <ContractReferenceList
                    rows={contractReferenceRows}
                    emptyTitle="No contract references"
                    emptyDescription="No ContractReference rows were returned for this customer. Run the backfill command if historical contracts have not been indexed yet."
                  />
                </SectionCard>

                <div className="grid gap-6 xl:grid-cols-2">
                  <SectionCard
                    title="Advance EMI / Lucky IDs"
                    description="Advance EMI references include batch and Lucky ID snapshots for quick counter lookup."
                  >
                    <ContractReferenceList
                      rows={advanceEmiReferenceRows}
                      emptyTitle="No Advance EMI references"
                      emptyDescription="No Advance EMI ContractReference rows were returned for this customer."
                    />
                  </SectionCard>

                  <SectionCard
                    title="Rent / Lease"
                    description="Rent and lease references are indexed for search. Collection remains disabled here until a production-safe posting service is available."
                  >
                    <ContractReferenceList
                      rows={rentLeaseReferenceRows}
                      emptyTitle="No rent or lease references"
                      emptyDescription="No rent or lease ContractReference rows were returned for this customer."
                    />
                  </SectionCard>
                </div>

                <SectionCard
                  title="Dues / Overdue"
                  description="Due and overdue values are read from EMI, rent/lease demand, or direct-sale billing truth; ContractReference does not calculate balances."
                >
                  <ContractReferenceList
                    rows={dueReferenceRows}
                    emptyTitle="No current dues"
                    emptyDescription="No indexed contract returned a positive due or overdue amount."
                  />
                </SectionCard>
              </>
            ) : null}

            <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-sky-900">
              <p className="font-semibold">Contract readiness is evaluated on each subscription detail.</p>
              <p className="mt-1 text-xs">
                Open an individual subscription to see its activation and handover readiness, blockers,
                and category status. No readiness aggregation is performed here — each contract&apos;s
                readiness is subscription-level and backend-evaluated.
              </p>
            </div>

            <SectionCard
              title="Active Linked Subscriptions"
              description="Operationally active subscription context for this customer."
              actionHref={`/admin/subscriptions?customer=${customer.id}`}
              actionLabel="View All"
            >
              <SubscriptionsTable rows={activeLinkedSubscriptions} />
            </SectionCard>

            <SectionCard
              title="Subscription History"
              description="Cancelled/archived/completed/defaulted records remain visible for audit history."
              actionHref={`/admin/subscriptions?customer=${customer.id}`}
              actionLabel="View All"
            >
              <SubscriptionsTable rows={historicalLinkedSubscriptions} />
            </SectionCard>

            <SectionCard
              title="Payment History"
              description="Recent payment activity linked to this customer."
              actionHref={`/admin/payments?customer=${customer.id}`}
              actionLabel="View All"
            >
              <PaymentsTable rows={payments} />
            </SectionCard>

            {operationalProfile ? (
              <>
                <SectionCard
                  title="Direct Sale History"
                  description="Retail direct-sale bills linked to this customer, including current outstanding balances for later collection."
                  actionHref={`/admin/billing/direct-sales?customer=${customer.id}`}
                  actionLabel="Open Direct Sales"
                >
                  {operationalProfile.direct_sales.rows.length === 0 ? (
                    <EmptyState
                      title="No direct-sale history"
                      description="No direct-sale records were returned for this customer."
                    />
                  ) : (
                    <div className="space-y-3">
                      {operationalProfile.direct_sales.rows.map((row) => (
                        <div
                          key={row.id}
                          className="rounded-xl border border-border bg-background p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-foreground">
                                {row.sale_no || `SALE-${row.id}`} · {row.billing_invoice_no || "No invoice no."}
                              </div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {row.branch_name || "Primary branch"} · {formatDate(row.sale_date)}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Status {row.status || "UNKNOWN"}
                              </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-3">
                              <div className="rounded-xl border border-border bg-muted/50 px-3 py-2">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grand Total</div>
                                <div className="mt-1 text-sm font-semibold text-foreground">{formatRupee(row.grand_total)}</div>
                              </div>
                              <div className="rounded-xl border border-border bg-muted/50 px-3 py-2">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Collected</div>
                                <div className="mt-1 text-sm font-semibold text-foreground">{formatRupee(row.received_total)}</div>
                              </div>
                              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Outstanding</div>
                                <div className="mt-1 text-sm font-semibold text-amber-900">
                                  {row.is_history_only ? "₹0.00" : formatRupee(row.active_outstanding_total || row.balance_total)}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Link
                              href={`/admin/billing/direct-sales?focus_sale=${row.id}`}
                              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                            >
                              Open Direct Sale
                            </Link>
                            <Link
                              href={`/admin/billing/receipts?direct_sale=${row.id}`}
                              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                            >
                              Receipts
                            </Link>
                            {row.is_history_only ? (
                              <span className="inline-flex items-center rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground">
                                History only
                              </span>
                            ) : row.status === "INVOICED" && Number(row.active_outstanding_total || row.balance_total || 0) > 0 ? (
                              <Link
                                href={`/admin/finance/collect?workflow=direct-sale&sale_id=${row.id}`}
                                className="inline-flex items-center rounded-md border border-amber-900 bg-amber-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800"
                              >
                                Collect Direct-Sale Balance
                              </Link>
                            ) : row.status === "DRAFT" ? (
                              <Link
                                href={`/admin/billing/direct-sales?focus_sale=${row.id}`}
                                className="inline-flex items-center rounded-md border border-orange-700 bg-orange-700 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600"
                              >
                                Open draft
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Lead / Quotation History"
                  description="Walk-in, online, quotation, and estimate lead records linked to this customer identity."
                  actionHref={ROUTES.admin.leads}
                  actionLabel="Lead Inbox"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <DetailValue
                      label="Total Leads"
                      value={String(operationalProfile.leads.summary.total_count)}
                    />
                    <DetailValue
                      label="Open Leads"
                      value={String(operationalProfile.leads.summary.open_count)}
                    />
                    <DetailValue
                      label="Quotation / Estimate"
                      value={`${operationalProfile.quotation_estimates.summary.quotation_count} / ${operationalProfile.quotation_estimates.summary.estimate_count}`}
                    />
                  </div>

                  {operationalProfile.leads.rows.length === 0 ? (
                    <div className="mt-4">
                      <EmptyState
                        title="No lead history"
                        description="No lead, quotation, or estimate records were returned for this customer."
                      />
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {operationalProfile.leads.rows.map((lead) => (
                        <div
                          key={lead.id}
                          className="rounded-xl border border-border bg-background px-4 py-3"
                        >
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-foreground">
                                Lead #{lead.id} · {lead.name || "Unnamed"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {lead.phone || "No phone"} · {lead.intent || "GENERAL"} · {lead.status || "NEW"} ·{" "}
                                {lead.source || "UNKNOWN_SOURCE"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {lead.interested_product || "No product context"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Created {formatDateTime(lead.created_at)}{" "}
                                {lead.converted_at ? `· Converted ${formatDateTime(lead.converted_at)}` : ""}
                              </div>
                              {lead.follow_up_required ? (
                                <div className="mt-1 text-xs text-amber-700">
                                  Follow-up required {lead.follow_up_on ? `on ${formatDate(lead.follow_up_on)}` : ""}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link
                                href={`${ROUTES.admin.leads}/${lead.id}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
                              >
                                Open Lead
                              </Link>
                              {typeof lead.converted_subscription_id === "number" ? (
                                <Link
                                  href={`${ROUTES.admin.subscriptions}/${lead.converted_subscription_id}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
                                >
                                  Subscription
                                </Link>
                              ) : null}
                              {typeof lead.converted_direct_sale_id === "number" ? (
                                <Link
                                  href={`${ROUTES.admin.billingDirectSales}?focus_sale=${lead.converted_direct_sale_id}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
                                >
                                  Direct Sale
                                </Link>
                              ) : null}
                            </div>
                          </div>

                          {(lead.notes || lead.admin_notes || lead.follow_up_note) ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              {lead.notes ? (
                                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                  <div className="font-semibold uppercase tracking-wide text-[10px]">
                                    Lead note
                                  </div>
                                  <div className="mt-1 whitespace-pre-wrap">{lead.notes}</div>
                                </div>
                              ) : null}
                              {lead.admin_notes ? (
                                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                  <div className="font-semibold uppercase tracking-wide text-[10px]">
                                    Admin remark
                                  </div>
                                  <div className="mt-1 whitespace-pre-wrap">{lead.admin_notes}</div>
                                </div>
                              ) : null}
                              {lead.follow_up_note ? (
                                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                  <div className="font-semibold uppercase tracking-wide text-[10px]">
                                    Follow-up note
                                  </div>
                                  <div className="mt-1 whitespace-pre-wrap">{lead.follow_up_note}</div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Receipts & Documents"
                  description="Retail receipts and subscription documents visible from the unified customer operations surface."
                >
                  <div className="grid gap-6 xl:grid-cols-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Receipts</h3>
                      <div className="mt-3 space-y-3">
                        {operationalProfile.receipts_documents.receipts.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No billing receipts were returned for this customer.</p>
                        ) : (
                          operationalProfile.receipts_documents.receipts.map((receipt) => (
                            <div key={receipt.id} className="rounded-xl border border-border bg-background px-4 py-3">
                              <div className="text-sm font-semibold text-foreground">
                                {receipt.receipt_no || `Receipt #${receipt.id}`}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {receipt.receipt_type || "Receipt"} · {formatDate(receipt.receipt_date)}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {receipt.finance_account_name || "Finance account not labeled"} · {formatRupee(receipt.amount)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Invoices</h3>
                      <div className="mt-3 space-y-3">
                        {operationalProfile.receipts_documents.invoices.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No billing invoices were returned for this customer.
                          </p>
                        ) : (
                          operationalProfile.receipts_documents.invoices.map((invoice) => (
                            <div key={invoice.id} className="rounded-xl border border-border bg-background px-4 py-3">
                              <div className="text-sm font-semibold text-foreground">
                                {invoice.document_no || `Invoice #${invoice.id}`}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {invoice.status || "DRAFT"} · {formatDate(invoice.invoice_date)} ·{" "}
                                {invoice.billing_channel || "DIRECT_SALE"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Total {formatRupee(invoice.grand_total)} · Received {formatRupee(invoice.received_total)} ·
                                Balance {formatRupee(invoice.balance_total)}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Link
                                  href={`${ROUTES.admin.billingDocuments}/${invoice.id}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                                >
                                  Open Invoice
                                </Link>
                                {typeof invoice.direct_sale_id === "number" ? (
                                  <Link
                                    href={`${ROUTES.admin.billingDirectSales}?focus_sale=${invoice.direct_sale_id}`}
                                    className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                                  >
                                    Direct Sale
                                  </Link>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Documents</h3>
                      <div className="mt-3 space-y-3">
                        {operationalProfile.receipts_documents.documents.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No subscription documents were returned for this customer.</p>
                        ) : (
                          operationalProfile.receipts_documents.documents.map((document) => (
                            <div key={document.id} className="rounded-xl border border-border bg-background px-4 py-3">
                              <div className="text-sm font-semibold text-foreground">
                                {document.document_type || "Document"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {document.subscription_number || "Subscription"} · {document.verification_status || "PENDING"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Uploaded {formatDateTime(document.created_at)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
