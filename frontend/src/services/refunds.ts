import { apiFetch } from '@/lib/api'

export interface RefundRequest {
  id: string
  subscription_id: string
  product_id: string
  reason: string
  condition: 'GOOD' | 'MINOR_DAMAGE' | 'SEVERE_DAMAGE'
  damage_notes?: string
  status: 'REQUESTED' | 'APPROVED' | 'INSPECTING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED'
  requested_at: string
  approved_at?: string
  completed_at?: string
  refund_amount: number
  deductions?: number
  final_amount: number
}

class RefundService {
  async requestRefund(
    subscriptionId: string,
    productId: string,
    reason: string,
    condition: string,
    notes?: string
  ): Promise<unknown> {
    return apiFetch('/api/v1/refunds/request/', {
      method: 'POST',
      body: JSON.stringify({
        subscription_id: subscriptionId,
        product_id: productId,
        reason,
        condition,
        damage_notes: notes,
      }),
    })
  }

  async assessDamage(refundId: string, photos: File[], deductionPercent: number): Promise<unknown> {
    const formData = new FormData()
    photos.forEach((photo) => formData.append('photos', photo))
    formData.append('deduction_percent', deductionPercent.toString())
    return fetch(`/api/v1/refunds/assess-damage/${refundId}/`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }).then((r) => r.json())
  }

  async getRefundStatus(refundId: string): Promise<RefundRequest> {
    return apiFetch(`/api/v1/refunds/status/${refundId}/`) as Promise<RefundRequest>
  }

  async getRefundHistory(limit = 20, offset = 0): Promise<{ count: number; results: RefundRequest[] }> {
    const d = await apiFetch(`/api/v1/refunds/history/?limit=${limit}&offset=${offset}`)
    return d as { count: number; results: RefundRequest[] }
  }
}

export const refundService = new RefundService()
