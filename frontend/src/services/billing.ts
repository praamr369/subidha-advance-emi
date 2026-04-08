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

export type BillingInvoice = {
  id: number;
  document_no?: string | null;
  invoice_date: string;
  financial_year: string;
  customer?: number | null;
  customer_name?: string | null;
  subscription?: number | null;
  billing_channel: string;
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
  finance_account?: number | null;
  finance_account_name?: string | null;
  billing_invoice?: number | null;
  customer?: number | null;
  subscription?: number | null;
  payment?: number | null;
  amount: string;
  customer_name_snapshot?: string;
  customer_phone_snapshot?: string;
  notes?: string;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
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
