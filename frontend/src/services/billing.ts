import { apiFetch } from "@/lib/api";

type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type QueryValue = string | number | undefined | null;

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type BillingInvoiceLine = {
  id?: number;
  product?: number | null;
  product_code?: string;
  inventory_item?: number | null;
  inventory_item_sku?: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  taxable_value: string;
  gst_rate?: string | null;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  line_total: string;
  hsn_sac_code?: string;
};

export type DirectSaleLine = {
  id?: number;
  product: number;
  product_code?: string;
  inventory_item?: number | null;
  inventory_item_sku?: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  taxable_value: string;
  gst_rate?: string | null;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  line_total: string;
  product_code_snapshot?: string;
  sku_snapshot?: string;
  unit_of_measure_snapshot?: string;
  hsn_sac_code?: string;
  create_purchase_requirement?: boolean;
  requirement_quantity?: string | null;
  requirement_note?: string;
};

export type DirectSale = {
  id: number;
  sale_no?: string | null;
  sale_date: string;
  financial_year: string;
  customer?: number | null;
  customer_name?: string | null;
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  cash_counter?: number | null;
  cash_counter_code?: string | null;
  cash_counter_name?: string | null;
  status: "DRAFT" | "CONFIRMED" | "DELIVERED" | "INVOICED" | "CANCELLED";
  tax_mode: "GST" | "NON_GST";
  tax_calculation_mode?: "NON_GST" | "GST_INCLUSIVE" | "GST_EXCLUSIVE";
  customer_gst_type?: "UNREGISTERED_CONSUMER" | "REGISTERED_BUSINESS";
  finance_account?: number | null;
  finance_account_name?: string | null;
  delivery_required: boolean;
  delivery_reference?: string;
  delivered_at?: string | null;
  confirmed_by?: number | null;
  confirmed_by_username?: string | null;
  confirmed_at?: string | null;
  invoiced_at?: string | null;
  subtotal: string;
  discount_total: string;
  taxable_total: string;
  tax_total: string;
  grand_total: string;
  received_total: string;
  balance_total: string;
  customer_name_snapshot?: string;
  customer_phone_snapshot?: string;
  customer_snapshot_email?: string;
  customer_snapshot_billing_address_line1?: string;
  customer_snapshot_billing_address_line2?: string;
  customer_snapshot_city?: string;
  customer_snapshot_district?: string;
  customer_snapshot_state?: string;
  customer_snapshot_pincode?: string;
  customer_gstin?: string | null;
  customer_snapshot_place_of_supply?: string;
  delivery_snapshot_address_line1?: string;
  delivery_snapshot_address_line2?: string;
  delivery_snapshot_city?: string;
  delivery_snapshot_district?: string;
  delivery_snapshot_state?: string;
  delivery_snapshot_pincode?: string;
  notes?: string;
  billing_invoice_id?: number | null;
  billing_invoice_no?: string | null;
  billing_invoice_status?: string | null;
  lines: DirectSaleLine[];
};

export type DirectSalePayload = {
  sale_date: string;
  customer?: number | null;
  branch?: number | null;
  cash_counter?: number | null;
  tax_mode?: "GST" | "NON_GST";
  tax_calculation_mode?: "NON_GST" | "GST_INCLUSIVE" | "GST_EXCLUSIVE";
  customer_gst_type?: "UNREGISTERED_CONSUMER" | "REGISTERED_BUSINESS";
  finance_account?: number | null;
  delivery_required?: boolean;
  delivery_reference?: string;
  subtotal: string;
  discount_total: string;
  taxable_total: string;
  tax_total: string;
  grand_total: string;
  received_total: string;
  balance_total: string;
  customer_name_snapshot?: string;
  customer_phone_snapshot?: string;
  customer_snapshot_email?: string;
  customer_snapshot_billing_address_line1?: string;
  customer_snapshot_billing_address_line2?: string;
  customer_snapshot_city?: string;
  customer_snapshot_district?: string;
  customer_snapshot_state?: string;
  customer_snapshot_pincode?: string;
  customer_gstin?: string | null;
  customer_snapshot_place_of_supply?: string;
  delivery_snapshot_address_line1?: string;
  delivery_snapshot_address_line2?: string;
  delivery_snapshot_city?: string;
  delivery_snapshot_district?: string;
  delivery_snapshot_state?: string;
  delivery_snapshot_pincode?: string;
  customer_mode?: "EXISTING" | "NEW" | "WALK_IN";
  walkin_create_customer_profile?: boolean;
  new_customer_name?: string;
  new_customer_phone?: string;
  new_customer_email?: string;
  new_customer_billing_address_line1?: string;
  new_customer_billing_address_line2?: string;
  new_customer_city?: string;
  new_customer_district?: string;
  new_customer_state?: string;
  new_customer_pincode?: string;
  new_customer_gstin?: string;
  new_customer_type?: "UNREGISTERED_CONSUMER" | "REGISTERED_BUSINESS";
  notes?: string;
  terms?: string;
  lines: DirectSaleLine[];
};

export type DirectSaleCollectionPayload = {
  amount: string;
  receipt_date?: string;
  finance_account_id?: number;
  branch_id?: number;
  cash_counter_id?: number;
  reference_no?: string;
  notes?: string;
};

export type DirectSaleCollectionResponse = {
  created: boolean;
  direct_sale: DirectSale;
  invoice: BillingInvoice;
  receipt: ReceiptDocument;
  outstanding_before: string;
  outstanding_after: string;
};

export type BillingInvoice = {
  id: number;
  document_no?: string | null;
  invoice_date: string;
  financial_year: string;
  document_type?: "INVOICE" | "PROFORMA" | "DEMAND_NOTE";
  customer?: number | null;
  customer_name?: string | null;
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  subscription?: number | null;
  direct_sale?: number | null;
  direct_sale_no?: string | null;
  billing_channel: string;
  source_type?: string;
  source_reference?: string;
  tax_mode: string;
  status: "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED" | "VOID";
  finance_account?: number | null;
  finance_account_name?: string | null;
  subtotal: string;
  discount_total: string;
  taxable_total: string;
  tax_total: string;
  grand_total: string;
  received_total: string;
  balance_total: string;
  customer_name_snapshot?: string;
  customer_phone_snapshot?: string;
  customer_gstin?: string | null;
  notes?: string;
  terms?: string;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  lines: BillingInvoiceLine[];
};

export type BillingNoteLine = {
  id?: number;
  inventory_item?: number | null;
  inventory_item_sku?: string;
  description: string;
  quantity: string;
  taxable_value: string;
  tax_amount: string;
  line_total: string;
};

export type BillingCreditNote = {
  id: number;
  note_no?: string | null;
  note_date: string;
  original_invoice: number;
  original_invoice_no?: string | null;
  reason?: string;
  stock_effect: boolean;
  taxable_adjustment: string;
  tax_adjustment: string;
  total_adjustment: string;
  status: "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED" | "VOID";
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  lines: BillingNoteLine[];
};

export type BillingDebitNote = BillingCreditNote;

export type ReceiptDocument = {
  id: number;
  receipt_no?: string | null;
  receipt_type: "RETAIL_RECEIPT" | "EMI_PAYMENT_RECEIPT";
  status: "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED" | "VOID";
  receipt_date: string;
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  cash_counter?: number | null;
  cash_counter_code?: string | null;
  cash_counter_name?: string | null;
  finance_account?: number | null;
  finance_account_name?: string | null;
  billing_invoice?: number | null;
  direct_sale?: number | null;
  direct_sale_no?: string | null;
  customer?: number | null;
  subscription?: number | null;
  payment?: number | null;
  source_type?: string;
  source_reference?: string;
  amount: string;
  customer_name_snapshot?: string;
  customer_phone_snapshot?: string;
  notes?: string;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
};

export type BillingInstallmentMirror = {
  id: number;
  billing_profile: number;
  subscription_id: number;
  customer_id: number;
  product_id: number;
  emi: number;
  month_no: number;
  due_date: string;
  amount: string;
  status_snapshot: string;
  paid_amount_snapshot: string;
  waived_amount_snapshot: string;
  outstanding_amount_snapshot: string;
  payment_count_snapshot: number;
  last_payment_date?: string | null;
};

export type BillingSyncEvent = {
  id: number;
  billing_profile: number;
  source_model: string;
  source_id: string;
  event_type: string;
  status: "SYNCED" | "SKIPPED" | "FAILED";
  idempotency_key?: string | null;
  payload: Record<string, unknown>;
  synced_at: string;
  performed_by?: number | null;
  performed_by_username?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BillingProfile = {
  id: number;
  subscription: number;
  customer: number;
  customer_name?: string;
  product: number;
  product_name?: string;
  product_code?: string;
  activation_state: "PENDING_DELIVERY" | "READY" | "ACTIVE" | "RETURN_HOLD" | "COMPLETED" | "CANCELLED";
  activation_state_label?: string;
  delivery_gate_required: boolean;
  delivery_gate_status: string;
  invoice_eligible: boolean;
  contract_reference_snapshot?: string;
  contract_start_date: string;
  tenure_months: number;
  contract_total: string;
  monthly_amount: string;
  paid_amount_snapshot: string;
  waived_amount_snapshot: string;
  remaining_amount_snapshot: string;
  next_due_date?: string | null;
  next_due_amount: string;
  product_code_snapshot?: string;
  product_name_snapshot?: string;
  activated_at?: string | null;
  last_synced_at: string;
  last_synced_event?: string;
  latest_sync_event?: BillingSyncEvent | null;
  installments: BillingInstallmentMirror[];
};

export type BillingDailyBookRow = {
  invoice_id: number;
  document_no?: string | null;
  invoice_date: string;
  customer_name?: string | null;
  billing_channel: string;
  tax_mode: string;
  grand_total: string;
  tax_total: string;
  journal_entry_id: number;
  journal_entry_no: string;
};

export type BillingCashBookRow = {
  finance_account_id: number;
  finance_account_name: string;
  kind: string;
  journal_entry_id: number;
  entry_no: string;
  entry_date: string;
  memo?: string | null;
  source_model?: string | null;
  source_id?: string | null;
  description?: string | null;
  debit_amount: string;
  credit_amount: string;
};

export type BillingDailyBookReport = {
  start_date: string | null;
  end_date: string | null;
  rows: BillingDailyBookRow[];
};

export type BillingCashBookReport = {
  start_date: string | null;
  end_date: string | null;
  finance_account_kinds: string[];
  rows: BillingCashBookRow[];
};

export function listBillingInvoices(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<BillingInvoice>>(`/billing/invoices/${buildQuery(params)}`);
}

export function getBillingInvoice(id: number | string) {
  return apiFetch<BillingInvoice>(`/billing/invoices/${id}/`);
}

export function listDirectSales(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<DirectSale>>(`/billing/direct-sales/${buildQuery(params)}`);
}

export function getDirectSale(id: number | string) {
  return apiFetch<DirectSale>(`/billing/direct-sales/${id}/`);
}

export function createDirectSale(payload: DirectSalePayload, options: { idempotencyKey?: string } = {}) {
  return apiFetch<DirectSale>("/billing/direct-sales/", {
    method: "POST",
    headers: options.idempotencyKey
      ? { "Idempotency-Key": options.idempotencyKey }
      : undefined,
    body: JSON.stringify(payload),
  });
}

export function updateDirectSale(id: number, payload: Partial<DirectSalePayload>) {
  return apiFetch<DirectSale>(`/billing/direct-sales/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function confirmDirectSale(id: number) {
  return apiFetch<{ updated: boolean; direct_sale: DirectSale }>(
    `/billing/direct-sales/${id}/confirm/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function markDirectSaleDelivered(id: number, delivery_reference = "") {
  return apiFetch<{ updated: boolean; direct_sale: DirectSale }>(
    `/billing/direct-sales/${id}/mark-delivered/`,
    {
      method: "POST",
      body: JSON.stringify({ delivery_reference }),
    }
  );
}

export function collectDirectSalePayment(
  id: number,
  payload: DirectSaleCollectionPayload
) {
  return apiFetch<DirectSaleCollectionResponse>(`/billing/direct-sales/${id}/collect/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function approveBillingInvoice(id: number) {
  return apiFetch<{ updated: boolean; invoice: BillingInvoice }>(
    `/billing/invoices/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postBillingInvoice(id: number) {
  return apiFetch<{ updated: boolean; invoice: BillingInvoice }>(
    `/billing/invoices/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function listBillingCreditNotes(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<BillingCreditNote>>(
    `/billing/credit-notes/${buildQuery(params)}`
  );
}

export function approveBillingCreditNote(id: number) {
  return apiFetch<{ updated: boolean; credit_note: BillingCreditNote }>(
    `/billing/credit-notes/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postBillingCreditNote(id: number) {
  return apiFetch<{ updated: boolean; credit_note: BillingCreditNote }>(
    `/billing/credit-notes/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function listBillingDebitNotes(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<BillingDebitNote>>(
    `/billing/debit-notes/${buildQuery(params)}`
  );
}

export function approveBillingDebitNote(id: number) {
  return apiFetch<{ updated: boolean; debit_note: BillingDebitNote }>(
    `/billing/debit-notes/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postBillingDebitNote(id: number) {
  return apiFetch<{ updated: boolean; debit_note: BillingDebitNote }>(
    `/billing/debit-notes/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function listReceiptDocuments(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<ReceiptDocument>>(`/billing/receipts/${buildQuery(params)}`);
}

export function listBillingProfiles(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<BillingProfile>>(`/billing/profiles/${buildQuery(params)}`);
}

export function listBillingInstallments(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<BillingInstallmentMirror>>(
    `/billing/installments/${buildQuery(params)}`
  );
}

export function listBillingSyncEvents(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<BillingSyncEvent>>(`/billing/sync-events/${buildQuery(params)}`);
}

export function syncBillingProfile(id: number) {
  return apiFetch<{
    updated: boolean;
    event_created: boolean;
    billing_profile: BillingProfile;
    billing_sync_event_id: number;
  }>(`/billing/profiles/${id}/sync/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function syncBillingPayment(paymentId: number) {
  return apiFetch<{
    created: boolean;
    billing_profile: BillingProfile;
    billing_sync_event_id: number;
  }>(`/billing/payments/${paymentId}/sync/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function generateEmiReceipt(paymentId: number, financeAccountId: number) {
  return apiFetch<{ created: boolean; receipt: ReceiptDocument }>(
    `/billing/receipts/emi-payment/${paymentId}/generate/`,
    {
      method: "POST",
      body: JSON.stringify({ finance_account_id: financeAccountId }),
    }
  );
}

export function voidReceiptDocument(id: number, reason: string) {
  return apiFetch<{ updated: boolean; receipt: ReceiptDocument }>(`/billing/receipts/${id}/void/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function getBillingDailyBook(params: Record<string, QueryValue> = {}) {
  return apiFetch<BillingDailyBookReport>(`/billing/dailybook/${buildQuery(params)}`);
}

export function getBillingCashBook(params: Record<string, QueryValue> = {}) {
  return apiFetch<BillingCashBookReport>(`/billing/cashbook/${buildQuery(params)}`);
}
