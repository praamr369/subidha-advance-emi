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

// Helper to extract array from paginated or plain array responses
function extractArray<T>(d: unknown): T[] {
  return Array.isArray(d) ? (d as T[]) : ((d as { results?: T[] })?.results ?? [])
}

class PrivacyService {
  // ── Customer: Consents ──

  async getConsents(): Promise<Consent[]> {
    const d = await apiFetch('/api/v1/privacy/consents/')
    return extractArray<Consent>(d)
  }

  async withdrawConsent(consentId: string): Promise<unknown> {
    return apiFetch(`/api/v1/privacy/consent/${consentId}/withdraw/`, { method: 'POST' })
  }

  async withdrawConsentById(consentId: number): Promise<unknown> {
    return apiFetch('/api/v1/privacy/consent/withdraw/', {
      method: 'POST',
      body: JSON.stringify({ consent_id: consentId }),
    })
  }

  async grantConsent(consentType: string): Promise<unknown> {
    return apiFetch('/api/v1/privacy/consent/grant/', {
      method: 'POST',
      body: JSON.stringify({ consent_type: consentType }),
    })
  }

  // ── Customer: Data Access Requests ──

  async requestDataAccess(requestType: string, description: string, format: string): Promise<unknown> {
    return apiFetch('/api/v1/privacy/data-access-request/', {
      method: 'POST',
      body: JSON.stringify({ request_type: requestType, description, response_format: format }),
    })
  }

  async submitDataAccessRequest(data: { request_type: string; notes: string }): Promise<unknown> {
    return apiFetch('/api/v1/privacy/data-access-request/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getDataAccessRequests(limit = 20, offset = 0): Promise<{ count: number; results: DataAccessRequest[] }> {
    const d = await apiFetch(`/api/v1/privacy/data-access-request/?limit=${limit}&offset=${offset}`)
    return d as { count: number; results: DataAccessRequest[] }
  }

  async getDataAccessRequestsList(): Promise<unknown[]> {
    const d = await apiFetch('/api/v1/privacy/data-access-request/')
    return extractArray<unknown>(d)
  }

  // ── Customer: Data Export ──

  async exportData(categories: string[], format?: string): Promise<unknown> {
    return apiFetch('/api/v1/privacy/data-export/', {
      method: 'POST',
      body: JSON.stringify(format ? { categories, format } : { categories }),
    })
  }

  // ── Customer: Grievances ──

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

  async submitGrievanceJson(data: { grievance_type: string; subject: string; description: string }): Promise<unknown> {
    return apiFetch('/api/v1/privacy/grievance/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getGrievances(limit = 20, offset = 0): Promise<{ count: number; results: Grievance[] }> {
    const d = await apiFetch(`/api/v1/privacy/grievance/?limit=${limit}&offset=${offset}`)
    return d as { count: number; results: Grievance[] }
  }

  async getGrievancesList(): Promise<unknown[]> {
    const d = await apiFetch('/api/v1/privacy/grievance/')
    return extractArray<unknown>(d)
  }

  // ── Customer: Audit Log ──

  async getAuditLog(limit = 50, offset = 0): Promise<{ count: number; results: unknown[] }> {
    const d = await apiFetch(`/api/v1/privacy/audit-log/?limit=${limit}&offset=${offset}`)
    return d as { count: number; results: unknown[] }
  }

  // ── Customer: Cookie Consent ──

  async getCookieConsent(): Promise<unknown> {
    return apiFetch('/api/v1/privacy/cookie-consent/')
  }

  async updateCookieConsent(prefs: unknown): Promise<unknown> {
    return apiFetch('/api/v1/privacy/cookie-consent/', {
      method: 'POST',
      body: JSON.stringify(prefs),
    })
  }

  // ── Customer: Dashboard Summary ──

  async getDashboardSummary(): Promise<unknown> {
    return apiFetch('/api/v1/privacy/dashboard-summary/')
  }

  // ── Customer: Communication Preferences ──

  async getCommPreferences(): Promise<unknown> {
    return apiFetch('/api/v1/privacy/communication-preferences/')
  }

  async updateCommPreferences(prefs: unknown): Promise<unknown> {
    return apiFetch('/api/v1/privacy/communication-preferences/', {
      method: 'POST',
      body: JSON.stringify(prefs),
    })
  }

  // ── Admin: Grievances ──

  async adminGetGrievances(): Promise<unknown[]> {
    const d = await apiFetch('/api/v1/privacy/admin-grievances/')
    return extractArray<unknown>(d)
  }

  async adminResolveGrievance(id: number, resolutionNotes: string): Promise<unknown> {
    return apiFetch(`/api/v1/privacy/grievance/${id}/resolve/`, {
      method: 'POST',
      body: JSON.stringify({ resolution_notes: resolutionNotes }),
    })
  }

  // ── Admin: Data Retention Policies ──

  async adminGetRetentionPolicies(): Promise<unknown[]> {
    const d = await apiFetch('/api/v1/privacy/retention-policies/')
    return extractArray<unknown>(d)
  }

  async adminPurgeRetentionPolicy(id: number): Promise<unknown> {
    return apiFetch(`/api/v1/privacy/retention-policies/${id}/purge/`, { method: 'POST' })
  }

  // ── Admin: Data Breaches ──

  async adminGetDataBreaches(): Promise<unknown[]> {
    const d = await apiFetch('/api/v1/privacy/data-breaches/')
    return extractArray<unknown>(d)
  }

  async adminCreateDataBreach(data: { title: string; severity: string; description: string; affected_records: number }): Promise<unknown> {
    return apiFetch('/api/v1/privacy/data-breaches/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async adminNotifyBreach(id: number): Promise<unknown> {
    return apiFetch(`/api/v1/privacy/data-breaches/${id}/notify/`, { method: 'POST' })
  }

  // ── Admin: Retention Schedule ──

  async adminGetRetentionSchedule(): Promise<unknown[]> {
    const d = await apiFetch('/api/v1/admin/privacy/retention-schedule/')
    return extractArray<unknown>(d)
  }

  async adminRetentionScheduleAction(id: number, action: string): Promise<unknown> {
    return apiFetch(`/api/v1/admin/privacy/retention-schedule/${id}/${action}/`, { method: 'POST' })
  }

  // ── Admin: Breach Notifications ──

  async adminGetBreachNotifications(): Promise<unknown[]> {
    const d = await apiFetch('/api/v1/admin/privacy/breach-notifications/')
    return extractArray<unknown>(d)
  }

  async adminCreateBreachNotification(data: {
    description: string
    severity: string
    data_categories_affected: string[]
    detected_at: string
  }): Promise<unknown> {
    return apiFetch('/api/v1/admin/privacy/breach-notifications/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async adminBreachNotificationAction(id: number, action: string, body?: object): Promise<unknown> {
    return apiFetch(`/api/v1/admin/privacy/breach-notifications/${id}/${action}/`, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  }
}

export const privacyService = new PrivacyService()
