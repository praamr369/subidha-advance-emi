import { apiFetch } from '@/lib/api'

export interface EligibilityResponse {
  is_eligible: boolean
  current_batch_id?: string
  lucky_id?: string
  reason?: string
  subscription_status: string
  paid_amount: number
  overdue_amount: number
}

export interface DrawResult {
  id: string
  batch_id: string
  batch_name: string
  draw_date: string
  created_at: string
  seed_hash: string
  total_participants: number
  winners_count: number
  winner_details?: {
    customer_id: string
    customer_name: string
    lucky_id: string
    prize_amount: number
    location: string
  }[]
  is_customer_winner: boolean
  customer_waiver_amount?: number
}

export interface WaiverHistory {
  id: string
  draw_id: string
  draw_date: string
  emi_amount: number
  waiver_amount: number
  settlement_status: string
  settled_at?: string
  refund_amount: number
}

export interface LuckyIDTracker {
  current_lucky_id: string
  current_batch_id: string
  batch_name: string
  allocated_at: string
  next_draw_date: string
  previous_lucky_ids: {
    lucky_id: string
    batch_name: string
    allocated_at: string
    draw_result: string
  }[]
  win_probability?: number
}

export interface DrawAudit {
  id: number
  batch_number: string
  draw_date: string
  commit_hash: string
  reveal_seed: string | null
  winner_lucky_id: string | null
  winner_customer: string | null
  waiver_amount: number
  verified: boolean
  total_eligible: number
}

export interface DrawAuthorisation {
  id: number
  batch: number
  batch_code?: string
  draw_month: number
  status: "PENDING" | "AUTHORISED" | "REJECTED" | "REVOKED"
  requested_by_name?: string
  authorised_by_name?: string
  authorised_at: string | null
  rejection_reason: string
  snapshot: Record<string, unknown>
  created_at: string
}

export interface WaiverSettlement {
  id: number
  subscription: number
  subscription_number?: string
  customer_name?: string
  batch: number
  batch_code?: string
  draw_month: number
  waiver_amount: string
  remaining_emi_count: number
  settlement_status: "PENDING" | "APPROVED" | "PAID" | "CANCELLED"
  settlement_date: string | null
  payment_reference: string
  created_at: string
}

class LuckyPlanService {
  async checkEligibility(): Promise<EligibilityResponse> {
    return apiFetch('/api/v1/lucky-plan/eligibility/') as Promise<EligibilityResponse>
  }

  async getDrawResults(limit = 10, offset = 0): Promise<{ count: number; results: DrawResult[] }> {
    const d = await apiFetch(`/api/v1/lucky-plan/draw-results/?limit=${limit}&offset=${offset}`)
    return d as { count: number; results: DrawResult[] }
  }

  async getWaiverHistory(limit = 10, offset = 0): Promise<{ count: number; results: WaiverHistory[] }> {
    const d = await apiFetch(`/api/v1/lucky-plan/waiver-history/?limit=${limit}&offset=${offset}`)
    return d as { count: number; results: WaiverHistory[] }
  }

  async getLuckyIDTracker(): Promise<LuckyIDTracker> {
    return apiFetch('/api/v1/lucky-plan/lucky-id/') as Promise<LuckyIDTracker>
  }

  async getDrawDetails(drawId: string): Promise<DrawResult> {
    return apiFetch(`/api/v1/lucky-plan/draw-results/${drawId}/`) as Promise<DrawResult>
  }

  async verifySeed(batchId: string, seed: string): Promise<{
    is_valid: boolean
    hash: string
    batch_name: string
    draw_date: string
    participants_count: number
  }> {
    const d = await apiFetch(
      `/api/v1/public/lucky-plan/verify-seed/?batch_id=${encodeURIComponent(batchId)}&seed=${encodeURIComponent(seed)}`
    )
    return d as {
      is_valid: boolean
      hash: string
      batch_name: string
      draw_date: string
      participants_count: number
    }
  }

  async getDrawAudit(): Promise<DrawAudit[]> {
    const d = await apiFetch('/api/v1/lucky-plan/draw-audit/')
    return Array.isArray(d) ? (d as DrawAudit[]) : ((d as { results?: DrawAudit[] })?.results ?? [])
  }

  async verifyDrawAuditSeed(payload: {
    commit_hash: string
    reveal_seed: string
    batch_id: number
  }): Promise<{ valid?: boolean }> {
    return apiFetch('/api/v1/public/lucky-plan/verify-seed/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ valid?: boolean }>
  }

  async getDrawAuthorisations(): Promise<DrawAuthorisation[]> {
    const d = await apiFetch('/api/v1/admin/lucky-plan/draw-authorisations/')
    return Array.isArray(d) ? (d as DrawAuthorisation[]) : ((d as { results?: DrawAuthorisation[] })?.results ?? [])
  }

  async actOnDrawAuthorisation(
    id: number,
    action: 'authorise' | 'reject',
    reason?: string
  ): Promise<unknown> {
    return apiFetch(`/api/v1/admin/lucky-plan/draw-authorisations/${id}/${action}/`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? '' }),
    })
  }

  async getWaiverSettlements(): Promise<WaiverSettlement[]> {
    const d = await apiFetch('/api/v1/admin/lucky-plan/waiver-settlements/')
    return Array.isArray(d) ? (d as WaiverSettlement[]) : ((d as { results?: WaiverSettlement[] })?.results ?? [])
  }

  async approveWaiverSettlement(id: number): Promise<unknown> {
    return apiFetch(`/api/v1/admin/lucky-plan/waiver-settlements/${id}/approve/`, { method: 'POST' })
  }

  // Path helpers for pages that page through results themselves via a
  // generic `fetchAllPagedRows`-style helper (follows the paginator's
  // `next` link), rather than a single apiFetch call.
  adminLuckyDrawsPath(): string {
    return '/api/v1/admin/lucky-draws/'
  }

  adminBatchesPath(): string {
    return '/api/v1/admin/batches/'
  }

  adminLuckyIdsPath(pageSize = 200): string {
    return `/api/v1/admin/lucky-ids/?page_size=${pageSize}`
  }
}

export const luckyPlanService = new LuckyPlanService()
