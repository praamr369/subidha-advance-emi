import { apiFetch } from '@/lib/api'

export interface Payment {
  id: string
  subscription_id: string
  amount: number
  method: 'CASH' | 'UPI' | 'BANK' | 'CARD'
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
  reference_id?: string
  created_at: string
  completed_at?: string
}

export interface Receipt {
  id: string
  payment_id: string
  amount: number
  date: string
  method: string
  reference_id: string
  customer_name: string
  customer_email: string
  customer_phone: string
  subscription_id: string
}

// ── EMI Collection types ───────────────────────────────────────────────────────
export type PaymentMethod = 'CASH' | 'UPI' | 'BANK' | 'CARD'

export interface AdminSubscriptionCollectionCandidate {
  id: number
  subscription_number: string
  customer_name: string
  customer_phone?: string | null
  product_name?: string | null
  status?: string
  outstanding_amount?: string | number | null
  batch_code?: string | null
  monthly_amount?: string | number | null
  tenure_months?: number | null
}

export interface AdminEmiCollectionCandidate {
  id: number
  status: string
  due_date?: string
  amount?: string | number | null
  outstanding_amount?: string | number | null
  paid_amount?: string | number | null
  installment_number?: number | null
  total_installments?: number | null
  installment_no?: number | null
  month_no?: number | null
  waived_amount?: string | number | null
  installment_label?: string | null
}

export interface PaymentCollectionResult {
  payment: {
    id: number
    amount: string | number
    method?: string
    payment_method?: string
    status?: string
  }
  emi: {
    id: number
    status?: string
    outstanding_amount?: string | number | null
  }
  receipt?: { id: number; receipt_no?: string } | null
  subscription?: { id?: number; status?: string } | null
  finance_account?: { id?: number; name?: string; kind?: string } | null
  reconciliation_status?: string | null
}

export type PaymentCollectionPayload = {
  emi: number
  amount: string | number
  payment_method: PaymentMethod
  payment_date: string
  finance_account_id?: number
  branch_id?: number
  cash_counter_id?: number
  reference_no?: string
  notes?: string
}

export type PaymentReversePayload = {
  reason: string
  notes?: string
}

export type PaymentReverseResponse = {
  detail?: string
  payment_id?: number
  id?: number
  payment?: { id?: number; status?: string } | null
  emi?: { id?: number; status?: string } | null
  subscription?: { id?: number; status?: string } | null
  status?: string
}

// ── Payment timeline types ─────────────────────────────────────────────────────
export type PaymentTimelineLedgerEntry = {
  id: number
  emi_id: number | null
  amount: string
  entry_type: string
  entry_direction: string
  allocation_context?: Record<string, unknown>
  created_at: string
}

export type PaymentTimelineAuditEntry = {
  id: number
  action_type: string
  performed_by: string | null
  metadata?: Record<string, unknown>
  created_at: string
}

export type PaymentTimelineUnifiedEntry = {
  kind: 'ledger' | 'reversal_ledger' | 'audit'
  timestamp: string
  payload: Record<string, unknown>
}

export type PaymentTimelineResponse = {
  payment: PaymentRecord
  flags?: { is_reversed?: boolean }
  reversal?: {
    is_reversed?: boolean
    reason?: string
    reversed_by_id?: number | null
    reversed_by_username?: string | null
  }
  ledger_entries?: PaymentTimelineLedgerEntry[]
  reversal_ledger_entries?: PaymentTimelineLedgerEntry[]
  audit_logs?: PaymentTimelineAuditEntry[]
  timeline?: PaymentTimelineUnifiedEntry[]
}

// ── Admin payment record (DRF decimal fields are returned as strings) ──────────
export interface PaymentRecord {
  id: number
  amount: string
  method: string
  status?: string
  payment_date: string
  created_at?: string
  reference_id?: string
  reference_no?: string | null
  is_reversed?: boolean
  emi_month_no?: number | null
  collected_by_username?: string | null
  verified_by_username?: string | null
  subscription: number
  subscription_status?: string
  customer?: number | null
  customer_name?: string | null
  customer_phone?: string | null
  batch_code?: string | null
  lucky_number?: number | null
  emi?: number | null
  allocation_metadata?: Record<string, unknown> | null
}

// ── Admin payment register types ───────────────────────────────────────────────
export interface PaymentRegisterRow {
  id: number
  subscription_number: string
  customer_name: string
  amount: string | number
  method: string
  status: string
  created_at: string
  reference_id?: string
  is_reversed?: boolean
  payment_date?: string | null
  customer_phone?: string | null
  reference_no?: string | null
  subscription?: number | string | null
  batch_code?: string | null
  lucky_number?: number | null
  emi?: number | string | null
  collected_by_username?: string | null
  verified_by_username?: string | null
  branch_name?: string | null
  branch_code?: string | null
}

export interface PaymentRegisterSummary {
  gross_amount: string | number
  net_collected_amount: string | number
  active_amount: string | number
  reversed_amount: string | number
  active_payments: number
  visible_payments: number
  reversed_payments: number
  num_pages?: number | null
  has_next?: boolean | null
  has_previous?: boolean | null
}

// ── PaymentService (legacy helper) ───────────────────────────────────────────
class PaymentService {
  async getPaymentHistory(limit = 20, offset = 0): Promise<{ count: number; results: Payment[] }> {
    const d = await apiFetch(`/api/v1/payments/history/?limit=${limit}&offset=${offset}`)
    return d as { count: number; results: Payment[] }
  }

  async getReceipt(paymentId: string): Promise<Receipt> {
    return apiFetch(`/api/v1/payments/receipt/${paymentId}/`) as Promise<Receipt>
  }

  async downloadReceipt(paymentId: string): Promise<Blob> {
    const response = await fetch(`/api/v1/payments/receipt/${paymentId}/download/`, {
      credentials: 'include',
    })
    return response.blob()
  }

  async getBalance(subscriptionId: string): Promise<{ outstanding: number; due: number; past_due: number }> {
    return apiFetch(`/api/v1/subscriptions/${subscriptionId}/balance/`) as Promise<{
      outstanding: number
      due: number
      past_due: number
    }>
  }
}

export const paymentService = new PaymentService()

// ── Admin collection functions ─────────────────────────────────────────────────
export async function getAdminSubscriptionForCollection(
  id: number | string
): Promise<AdminSubscriptionCollectionCandidate> {
  return apiFetch(`/api/v1/subscriptions/${id}/`) as Promise<AdminSubscriptionCollectionCandidate>
}

export async function listSubscriptionEmisForCollection(
  subscriptionId: number
): Promise<AdminEmiCollectionCandidate[]> {
  const d = await apiFetch(`/api/v1/subscriptions/${subscriptionId}/emis/`)
  return Array.isArray(d)
    ? (d as AdminEmiCollectionCandidate[])
    : ((d as { results?: AdminEmiCollectionCandidate[] })?.results ?? [])
}

export async function searchAdminSubscriptionsForCollection(
  q: string
): Promise<AdminSubscriptionCollectionCandidate[]> {
  const d = await apiFetch(`/api/v1/subscriptions/?search=${encodeURIComponent(q)}`)
  return Array.isArray(d)
    ? (d as AdminSubscriptionCollectionCandidate[])
    : ((d as { results?: AdminSubscriptionCollectionCandidate[] })?.results ?? [])
}

export async function collectPayment(data: PaymentCollectionPayload): Promise<PaymentCollectionResult> {
  return apiFetch('/admin/payments/collect/', {
    method: 'POST',
    body: JSON.stringify(data),
  }) as Promise<PaymentCollectionResult>
}

export async function reversePayment(
  paymentId: number | string,
  payload: PaymentReversePayload
): Promise<PaymentReverseResponse> {
  return apiFetch(`/admin/payments/${paymentId}/reverse/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<PaymentReverseResponse>
}

export async function getPayment(id: number | string): Promise<PaymentRecord> {
  return apiFetch(`/admin/payments/${id}/`) as Promise<PaymentRecord>
}

export async function getPaymentTimeline(id: number | string): Promise<PaymentTimelineResponse> {
  return apiFetch(`/admin/payments/${id}/timeline/`) as Promise<PaymentTimelineResponse>
}

export async function getAdminPaymentRegister(
  params?: Record<string, string | number | undefined>
): Promise<{
  count: number
  results: PaymentRegisterRow[]
  summary: PaymentRegisterSummary
  num_pages: number
  has_next: boolean
  has_previous: boolean
}> {
  const filtered: Record<string, string> = {}
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') filtered[k] = String(v)
  }
  const query = new URLSearchParams(filtered).toString()
  const d = await apiFetch(`/admin/payments/${query ? `?${query}` : ''}`)
  return d as {
    count: number
    results: PaymentRegisterRow[]
    summary: PaymentRegisterSummary
    num_pages: number
    has_next: boolean
    has_previous: boolean
  }
}

export async function listPayments(
  paramsOrId?: number | string | Record<string, string | number | undefined>
): Promise<{ count: number; results: PaymentRecord[] }> {
  let url: string
  if (typeof paramsOrId === 'number' || typeof paramsOrId === 'string') {
    url = `/admin/payments/?subscription=${paramsOrId}`
  } else if (paramsOrId && typeof paramsOrId === 'object') {
    const filtered: Record<string, string> = {}
    for (const [k, v] of Object.entries(paramsOrId)) {
      if (v !== undefined && v !== null && v !== '') filtered[k] = String(v)
    }
    const query = new URLSearchParams(filtered).toString()
    url = `/admin/payments/${query ? `?${query}` : ''}`
  } else {
    url = '/admin/payments/'
  }
  const d = await apiFetch(url)
  if (Array.isArray(d)) {
    return { count: (d as PaymentRecord[]).length, results: d as PaymentRecord[] }
  }
  return d as { count: number; results: PaymentRecord[] }
}
