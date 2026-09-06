import { apiFetch } from '@/lib/api'

// ── Deliveries: Handover Receipts ──

export async function fetchCustomerHandoverReceipts(): Promise<unknown> {
  return apiFetch('/api/v1/deliveries/handover-receipts/')
}

// ── Contracts ──

export function customerRentContractPdfUrl(subscriptionId: number | string): string {
  return `/api/v1/customer/rent-contracts/${subscriptionId}/pdf/`
}

export function customerLeaseContractPdfUrl(subscriptionId: number | string): string {
  return `/api/v1/customer/lease-contracts/${subscriptionId}/pdf/`
}

// ── Receipts ──

export function customerReceiptPdfUrl(receiptId: number | string): string {
  return `/api/v1/customer/receipts/${receiptId}/pdf/`
}

// ── Returns ──

export async function fetchCustomerReturns(): Promise<unknown> {
  return apiFetch('/api/v1/customer/returns/')
}

export async function submitCustomerReturn(data: { subscription: number; reason: string }): Promise<unknown> {
  return apiFetch('/api/v1/customer/returns/', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ── Refunds ──

export async function fetchActiveSubscriptionsForRefund(): Promise<unknown> {
  return apiFetch('/api/v1/customer/subscriptions/?status=ACTIVE&page_size=50')
}

export async function submitRefundRequest(data: {
  subscription_id: string
  reason: string
  notes: string
  pickup_address: string
}): Promise<unknown> {
  return apiFetch('/api/v1/refunds/request/', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function fetchRefundHistory(): Promise<unknown> {
  return apiFetch('/api/v1/refunds/history/')
}

export async function fetchRefundStatus(id: string | number): Promise<unknown> {
  return apiFetch(`/api/v1/refunds/status/${id}/`)
}

export async function fetchDamageAssessment(refundRequestId: string | number): Promise<unknown> {
  return apiFetch(`/api/v1/refunds/assess-damage/?refund_request=${refundRequestId}`)
}

export async function submitDamageAssessment(data: {
  refund_request: string | number
  condition: string
  notes: string
}): Promise<unknown> {
  return apiFetch('/api/v1/refunds/assess-damage/', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ── Communication Preferences ──

export async function fetchCustomerCommsPreferences(): Promise<unknown> {
  return apiFetch('/api/v1/privacy/communication-preferences/')
}

export async function saveCustomerCommsPreferences(prefs: unknown): Promise<unknown> {
  return apiFetch('/api/v1/privacy/communication-preferences/', {
    method: 'POST',
    body: JSON.stringify(prefs),
  })
}

// ── Subscriptions: Security Deposits ──

export async function fetchCustomerDeposits(): Promise<unknown> {
  return apiFetch('/api/v1/subscriptions/deposits/')
}

// ── Documents: Consent History ──

export async function fetchCustomerDocumentConsents(): Promise<unknown> {
  return apiFetch('/api/v1/customers/document-consents/')
}
