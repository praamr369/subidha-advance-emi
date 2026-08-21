import { apiFetch } from '@/lib/api'

export interface Consent {
  id: string
  consent_type: string
  status: 'GIVEN' | 'WITHDRAWN' | 'EXPIRED' | 'PENDING'
  given_at?: string
  withdrawn_at?: string
  purpose_text: string
}

export interface DataAccessRequest {
  id: string
  request_type: 'ACCESS' | 'CORRECTION' | 'ERASURE' | 'PORTABILITY' | 'RESTRICT'
  status: 'RECEIVED' | 'UNDER_REVIEW' | 'APPROVED' | 'COMPLETED' | 'REJECTED'
  requested_at: string
  due_date: string
  completed_at?: string
}

export interface Grievance {
  id: string
  grievance_type: string
  status: 'FILED' | 'UNDER_REVIEW' | 'RESOLVED'
  filed_at: string
  stage_1_due: string
  stage_2_due?: string
}

class PrivacyService {
  async getConsents(): Promise<Consent[]> {
    const d = await apiFetch('/api/v1/privacy/consents/')
    return Array.isArray(d) ? (d as Consent[]) : ((d as { results?: Consent[] })?.results ?? [])
  }

  async withdrawConsent(consentId: string): Promise<unknown> {
    return apiFetch(`/api/v1/privacy/consent/${consentId}/withdraw/`, { method: 'POST' })
  }

  async requestDataAccess(requestType: string, description: string, format: string): Promise<unknown> {
    return apiFetch('/api/v1/privacy/data-access-request/', {
      method: 'POST',
      body: JSON.stringify({ request_type: requestType, description, response_format: format }),
    })
  }

  async getDataAccessRequests(limit = 20, offset = 0): Promise<{ count: number; results: DataAccessRequest[] }> {
    const d = await apiFetch(`/api/v1/privacy/data-access-request/?limit=${limit}&offset=${offset}`)
    return d as { count: number; results: DataAccessRequest[] }
  }

  async exportData(categories: string[]): Promise<unknown> {
    return apiFetch('/api/v1/privacy/data-export/', {
      method: 'POST',
      body: JSON.stringify({ categories }),
    })
  }

  async submitGrievance(
    grievanceType: string,
    title: string,
    description: string,
    evidence?: File[]
  ): Promise<unknown> {
    const formData = new FormData()
    formData.append('grievance_type', grievanceType)
    formData.append('title', title)
    formData.append('description', description)
    if (evidence) {
      evidence.forEach((file) => formData.append('evidence', file))
    }
    return apiFetch('/api/v1/privacy/grievance/', {
      method: 'POST',
      body: formData,
    })
  }

  async getGrievances(limit = 20, offset = 0): Promise<{ count: number; results: Grievance[] }> {
    const d = await apiFetch(`/api/v1/privacy/grievance/?limit=${limit}&offset=${offset}`)
    return d as { count: number; results: Grievance[] }
  }

  async getAuditLog(limit = 50, offset = 0): Promise<{ count: number; results: unknown[] }> {
    const d = await apiFetch(`/api/v1/privacy/audit-log/?limit=${limit}&offset=${offset}`)
    return d as { count: number; results: unknown[] }
  }
}

export const privacyService = new PrivacyService()
