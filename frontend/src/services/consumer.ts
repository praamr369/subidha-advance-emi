import { apiFetch } from '@/lib/api'

// --- Return requests (CTRL-CONS-3) ---

export interface ReturnRequest {
  id: number
  subscription: number
  subscription_number?: string
  customer_name?: string
  status: 'FILED' | 'WITHIN_WINDOW' | 'OUTSIDE_WINDOW' | 'CPA_OVERRIDE' | 'APPROVED' | 'REJECTED' | 'REFUNDED'
  reason: string
  defect_claim?: number | null
  filed_at: string
  refund_deadline: string | null
  cpa_override_authorised_by?: string | null
  created_at: string
}

export async function listReturnRequests(): Promise<ReturnRequest[]> {
  const d = await apiFetch('/api/v1/admin/consumer/return-requests/')
  return Array.isArray(d) ? (d as ReturnRequest[]) : ((d as { results?: ReturnRequest[] })?.results ?? [])
}

export async function actOnReturnRequest(id: number, action: string): Promise<unknown> {
  return apiFetch(`/api/v1/admin/consumer/return-requests/${id}/${action}/`, { method: 'POST' })
}

export async function cpaOverrideReturnRequest(id: number, reason: string): Promise<unknown> {
  return apiFetch(`/api/v1/admin/consumer/return-requests/${id}/cpa-override/`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

// --- Defect claims (CTRL-CONS-1) ---

export interface DefectClaim {
  id: number
  subscription: number
  subscription_number?: string
  customer_name?: string
  severity: 'MINOR' | 'MAJOR' | 'DANGEROUS'
  status: 'FILED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'RESOLVED'
  defect_description: string
  product_name?: string
  filed_at: string
  reviewed_at: string | null
  resolution_notes: string
  replacement_dispatched: boolean
  refund_issued: boolean
}

export async function listDefectClaims(): Promise<DefectClaim[]> {
  const d = await apiFetch('/api/v1/admin/consumer/defect-claims/')
  return Array.isArray(d) ? (d as DefectClaim[]) : ((d as { results?: DefectClaim[] })?.results ?? [])
}

export async function advanceDefectClaim(id: number, action: string): Promise<unknown> {
  return apiFetch(`/api/v1/admin/consumer/defect-claims/${id}/${action}/`, { method: 'POST' })
}

// --- Repossessions (CTRL-RENT-8) ---

export interface Repossession {
  id: number
  subscription: number
  subscription_number?: string
  customer_name?: string
  status: 'NOTICE_ISSUED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  notice_issued_at: string
  notice_reference: string
  response_deadline: string
  initiated_at: string | null
  completed_at: string | null
  outstanding_balance_at_repossession: string | null
  asset_condition_on_return: string
}

export async function listRepossessions(): Promise<Repossession[]> {
  const d = await apiFetch('/api/v1/admin/repossessions/')
  return Array.isArray(d) ? (d as Repossession[]) : ((d as { results?: Repossession[] })?.results ?? [])
}

export async function advanceRepossession(id: number, action: string): Promise<unknown> {
  return apiFetch(`/api/v1/admin/repossessions/${id}/${action}/`, { method: 'POST' })
}
