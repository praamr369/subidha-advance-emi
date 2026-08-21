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
    return apiFetch('/api/v1/warranty/claim/', {
      method: 'POST',
      body: formData,
    })
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

  async getExtendedPlans(productId: number | string): Promise<unknown[]> {
    const d = await apiFetch(`/api/v1/warranty/extended-plans/${productId}/`)
    if (Array.isArray(d)) return d
    return (d as { plans?: unknown[] })?.plans ?? []
  }

  async enrollExtendedBySubscription(subscriptionId: string, months: number): Promise<unknown> {
    return apiFetch('/api/v1/warranty/enroll-extended/', {
      method: 'POST',
      body: JSON.stringify({ subscription_id: subscriptionId, months }),
    })
  }

  async fileClaimForm(data: {
    subscription_id: string
    product_id?: number
    defect_type: string
    description: string
    preferred_service_date?: string | null
  }): Promise<unknown> {
    return apiFetch('/api/v1/warranty/claim/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // --- Admin methods ---

  async adminGetClaims(queryString = ''): Promise<unknown[]> {
    const d = await apiFetch(`/api/v1/warranty/admin-claims/?${queryString}`)
    if (Array.isArray(d)) return d
    return (d as { results?: unknown[] })?.results ?? []
  }

  async adminApproveClaim(claimId: number): Promise<unknown> {
    return apiFetch(`/api/v1/warranty/claim/${claimId}/approve/`, { method: 'POST' })
  }

  async adminScheduleClaim(
    claimId: number,
    data: { scheduled_date: string; technician_name: string }
  ): Promise<unknown> {
    return apiFetch(`/api/v1/warranty/claim/${claimId}/schedule/`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async adminGetServiceSchedule(): Promise<unknown[]> {
    const d = await apiFetch('/api/v1/warranty/service-schedule/')
    if (Array.isArray(d)) return d
    return (d as { results?: unknown[] })?.results ?? []
  }

  async adminCompleteServiceCall(jobId: number): Promise<unknown> {
    return apiFetch(`/api/v1/warranty/service-call/${jobId}/complete/`, { method: 'POST' })
  }
}

export const warrantyService = new WarrantyService()
