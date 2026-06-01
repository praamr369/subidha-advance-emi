import { apiFetch } from "@/lib/api";

type Money = string;

export type FinanceFilter = {
  dateFrom?: string;
  dateTo?: string;
  paymentMethod?: string;
  contractType?: string;
  status?: string;
  branch?: number | string;
};

function toQuery(params?: FinanceFilter): string {
  if (!params) return "";
  const search = new URLSearchParams();
  if (params.dateFrom) search.set("date_from", params.dateFrom);
  if (params.dateTo) search.set("date_to", params.dateTo);
  if (params.paymentMethod) search.set("payment_method", params.paymentMethod);
  if (params.contractType) search.set("contract_type", params.contractType);
  if (params.status) search.set("status", params.status);
  if (params.branch !== undefined && params.branch !== null && params.branch !== "") {
    search.set("branch", String(params.branch));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type AdminFinanceDashboardResponse = {
  filters_applied: Record<string, unknown>;
  cards: {
    today_total_collection: Money;
    today_cash_collection: Money;
    today_upi_collection: Money;
    today_bank_collection: Money;
    pending_dues: Money;
    overdue_payments: Money;
    advance_emi_collection: Money;
    rent_lease_monthly_collection: Money;
    rent_monthly_invoices_pending?: number;
    lease_monthly_invoices_pending?: number;
    rent_lease_overdue?: number;
    deposits_held?: Money;
    deposit_refunds_pending?: Money;
    deposit_deductions?: Money;
    rent_lease_income?: Money;
    upcoming_rent_lease_due_dates?: number;
    contracts_nearing_return_date?: number;
    return_inspections_pending?: number;
    waiver_loss_exposure: Money;
    direct_sale_revenue: Money;
    direct_sale_outstanding: Money;
    unreconciled_transactions: number;
    receipts_generated_today: number;
    invoices_pending: number;
  };
  payment_method_split_today: Array<{ payment_method: string; count: number; amount: Money }>;
  payment_method_split_range: Array<{ payment_method: string; count: number; amount: Money }>;
  overdue_aging: Array<{ bucket: string; count: number; amount: Money }>;
};

export type FinanceInvoiceRow = {
  id: number;
  invoice_no: string | null;
  invoice_date: string;
  status: string;
  document_type: string;
  customer_id: number | null;
  customer_name: string;
  subscription_id: number | null;
  subscription_number: string | null;
  direct_sale_id: number | null;
  direct_sale_no: string | null;
  grand_total: Money;
  received_total: Money;
  balance_total: Money;
  billing_channel: string;
};

export type FinanceReceiptRow = {
  id: number;
  receipt_no: string | null;
  receipt_date: string;
  status: string;
  receipt_type?: string;
  amount: Money;
  customer_id: number | null;
  customer_name: string;
  subscription_id: number | null;
  subscription_number: string | null;
  plan_type?: string | null;
  invoice_id: number | null;
  invoice_no: string | null;
  direct_sale_id: number | null;
  direct_sale_no: string | null;
  payment_id: number | null;
  payment_method: string | null;
  reference_no: string;
};

export type FinanceDocumentRow = {
  id: number;
  subscription_id: number;
  subscription_number: string | null;
  document_type: string;
  document_version: number;
  verification_status: string;
  generated_by: string | null;
  uploaded_by: string | null;
  generated_at: string;
  regeneration_reason: string;
  file_name: string;
  file_url: string | null;
};

export async function getAdminFinanceDashboard(params?: FinanceFilter) {
  return apiFetch<AdminFinanceDashboardResponse>(`/admin/finance/dashboard/${toQuery(params)}`);
}

export async function listAdminFinanceInvoices(params?: FinanceFilter) {
  return apiFetch<{ count: number; results: FinanceInvoiceRow[] }>(`/admin/invoices/${toQuery(params)}`);
}

export async function listAdminFinanceReceipts(params?: FinanceFilter) {
  return apiFetch<{ count: number; results: FinanceReceiptRow[] }>(`/admin/receipts/${toQuery(params)}`);
}

export async function listAdminFinanceDocuments(subscriptionId?: number | string) {
  const query = subscriptionId ? `?subscription=${subscriptionId}` : "";
  return apiFetch<{ count: number; results: FinanceDocumentRow[] }>(`/admin/documents/${query}`);
}

export type AdminDepositActionPosture = {
  can_collect?: boolean;
  can_deduct?: boolean;
  can_approve_refund?: boolean;
  can_record_refund?: boolean;
  disabled_reason?: string | null;
};

export type AdminDepositLatestTransaction = {
  transaction_id?: number;
  transaction_type?: string;
  amount?: Money;
  reason?: string;
  reference_no?: string;
  payment_method?: string;
  payment_date?: string | null;
  created_at?: string | null;
};

export type AdminDepositRow = AdminDepositActionPosture & {
  demand_id: number;
  reference_key: string;
  subscription_id: number;
  subscription_number: string | null;
  plan_type: string;
  customer_name: string;
  customer_phone?: string;
  product_name: string;
  deposit_amount: Money;
  collected_amount: Money;
  held_amount: Money;
  refundable_amount: Money;
  deducted_amount: Money;
  refunded_amount?: Money;
  refund_status?: string;
  status: string;
  due_date: string;
  latest_transaction?: AdminDepositLatestTransaction | null;
};

export async function listAdminDepositRegister(subscriptionId?: number | string) {
  const query = subscriptionId ? `?subscription_id=${subscriptionId}` : "";
  return apiFetch<{ count: number; results: AdminDepositRow[] }>(`/admin/finance/deposits/${query}`);
}

export async function createAdminDepositDeduction(input: {
  subscription_id: number;
  amount: string | number;
  reason: string;
}) {
  return apiFetch<{ detail: string }>(`/admin/finance/deposits/deduct/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function approveAdminDepositRefund(input: {
  subscription_id: number;
  amount: string | number;
}) {
  return apiFetch<{ detail: string; transaction_id: number }>(`/admin/finance/deposits/refund-approve/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function recordAdminDepositRefund(input: {
  subscription_id: number;
  amount: string | number;
  approval_transaction_id?: number;
}) {
  return apiFetch<{ detail: string }>(`/admin/finance/deposits/refund/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type AdminRentLeaseAccountMappingPayload = {
  mapping: Record<string, unknown> | null;
  chart_accounts: Array<Record<string, unknown>>;
  finance_accounts: Array<Record<string, unknown>>;
  posting_boundary_note?: string;
};

export async function getAdminRentLeaseAccountMapping() {
  return apiFetch<AdminRentLeaseAccountMappingPayload>(`/admin/finance/account-mapping/`);
}

export async function saveAdminRentLeaseAccountMapping(input: Record<string, unknown>) {
  return apiFetch<{ detail: string; mapping_id: number; posting_boundary_note?: string }>(`/admin/finance/account-mapping/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function regenerateAdminDocument(documentId: number, reason = "") {
  return apiFetch<{
    detail: string;
    document: {
      id: number;
      document_type: string;
      document_version: number;
      file_url: string | null;
      regeneration_reason: string;
    };
  }>(`/admin/documents/${documentId}/regenerate/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function getAdminCustomerStatement(customerId: number | string, params?: FinanceFilter) {
  return apiFetch<{
    summary: Record<string, Money>;
    payments: Array<Record<string, unknown>>;
    receipts: Array<Record<string, unknown>>;
    invoices: Array<Record<string, unknown>>;
  }>(`/admin/customer/${customerId}/statement/${toQuery(params)}`);
}

export async function getCustomerFinanceSummary() {
  return apiFetch<{
    customer_id: number;
    summary: Record<string, unknown>;
    payment_method_split: Array<{ payment_method: string; count: number; amount: Money }>;
    deposit_summary?: Array<Record<string, unknown>>;
  }>("/customer/finance/summary/");
}

export async function listCustomerInvoices() {
  return apiFetch<{ count: number; results: FinanceInvoiceRow[] }>("/customer/invoices/");
}

export async function listCustomerReceipts() {
  return apiFetch<{ count: number; results: FinanceReceiptRow[] }>("/customer/receipts/");
}

export async function listCustomerDocuments() {
  return apiFetch<{ count: number; results: FinanceDocumentRow[] }>("/customer/documents/");
}

export async function getCustomerPaymentSchedule() {
  return apiFetch<{ count: number; results: Array<Record<string, unknown>> }>("/customer/payment-schedule/");
}

export async function getCustomerAccountStatement(params?: FinanceFilter) {
  return apiFetch<{
    summary: Record<string, Money>;
    payments: Array<Record<string, unknown>>;
    receipts: Array<Record<string, unknown>>;
    invoices: Array<Record<string, unknown>>;
  }>(`/customer/account-statement/${toQuery(params)}`);
}

export async function getPartnerFinanceSummary() {
  return apiFetch<{
    summary: Record<string, unknown>;
    payment_method_split: Array<{ payment_method: string; count: number; amount: Money }>;
  }>("/partner/finance/summary/");
}

export async function listPartnerLinkedCustomerPayments() {
  return apiFetch<{ count: number; results: Array<Record<string, unknown>> }>(
    "/partner/linked-customer-payments/"
  );
}

export async function listPartnerReceipts() {
  return apiFetch<{ count: number; results: FinanceReceiptRow[] }>("/partner/receipts/");
}
