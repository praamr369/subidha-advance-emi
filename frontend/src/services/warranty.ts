import { apiFetch } from '@/lib/api'

export interface WarrantyClaim {
  id: string
  product_id: string
  subscription_id: string
  status: 'FILED' | 'ASSESSING' | 'APPROVED' | 'REJECTED' | 'SCHEDULED' | 'COMPLETED'
  defect_description: string
  defect_type: 'MECHANICAL' | 'ELECTRICAL' | 'COSMETIC'
  filed_at: string
  assessment_result?: string
  service_appointment?: {
    date: string
    time: string
    technician: string
  }
}

export interface WarrantyStatus {
  product_id: string
  manufacturing_days_remaining: number
  structural_days_remaining: number
  extended_enrolled: boolean
  extended_expiry?: string
}

class WarrantyService {
  async checkWarranty(productId: string): Promise<WarrantyStatus> {
    return apiFetch(`/api/v1/warranty/check/${productId}/`) as Promise<WarrantyStatus>
  }

  async fileClaim(
    productId: string,
    defectDescription: string,
    defectType: string,
    photos: File[]
  ): Promise<unknown> {
    const formData = new FormData()
    formData.append('product_id', productId)
    formData.append('defect_description', defectDescription)
    formData.append('defect_type', defectType)
    photos.forEach((photo) => formData.append('photos', photo))
    return fetch('/api/v1/warranty/claim/', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }).then((r) => r.json())
  }

  async getClaimStatus(claimId: string): Promise<WarrantyClaim> {
    return apiFetch(`/api/v1/warranty/claim-status/${claimId}/`) as Promise<WarrantyClaim>
  }

  async getServiceHistory(limit = 20, offset = 0): Promise<{ count: number; results: unknown[] }> {
    const d = await apiFetch(`/api/v1/warranty/service-history/?limit=${limit}&offset=${offset}`)
    return d as { count: number; results: unknown[] }
  }

  async enrollExtendedWarranty(productId: string, planType: string): Promise<unknown> {
    return apiFetch('/api/v1/warranty/enroll-extended/', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, plan_type: planType }),
    })
  }
}

export const warrantyService = new WarrantyService()
