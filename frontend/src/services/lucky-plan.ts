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
}

export const luckyPlanService = new LuckyPlanService()
