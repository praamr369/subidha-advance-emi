/**
 * CRM Pipeline Service
 * PublicLead → OnlineRequest → ProductRequest/SubscriptionRequest → Subscription/Sale
 */

import { apiFetch } from '@/lib/api';

// Types
export interface PublicLead {
  id: number;
  name: string;
  phone: string;
  email: string;
  city: string;
  product?: number;
  product_name?: string;
  interested_product: string;
  preferred_emi_amount?: number;
  notes: string;
  status: 'NEW' | 'IN_PROGRESS' | 'CONTACTED' | 'CONVERTED' | 'CLOSED';
  status_display: string;
  intent: string;
  intent_display: string;
  source: string;
  assigned_to?: number;
  assigned_to_name?: string;
  converted_to?: Array<{ type: string; id: number }>;
  created_at: string;
  converted_at?: string;
}

export interface PublicLeadDetail extends PublicLead {
  conversion_history: ConversionStage[];
}

export interface ConversionStage {
  stage: string;
  timestamp?: string;
  description: string;
  id?: number;
}

export interface OnlineRequest {
  id: number;
  request_number: string;
  customer?: number;
  customer_name?: string;
  product: number;
  product_name: string;
  request_type: 'ADVANCE_EMI' | 'DIRECT_SALE' | 'RENT' | 'LEASE';
  status: string;
  unit_price?: number;
  total_amount?: number;
  source_public_lead?: number;
  converted_product_request?: number;
  converted_subscription_request?: number;
  created_at: string;
}

// Public API - Create Lead (no auth required)
export async function createPublicLead(data: {
  name: string;
  phone: string;
  email: string;
  city: string;
  interested_product?: string;
  preferred_emi_amount?: number;
  notes?: string;
}) {
  const response = await fetch('/api/v1/crm-pipeline/leads/public/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to create public lead');
  }

  return response.json();
}

// Admin APIs - Manage Leads
export async function listPublicLeads(params?: {
  status?: string;
  q?: string;
  page?: number;
}) {
  const query = new URLSearchParams();
  if (params?.status) query.append('status', params.status);
  if (params?.q) query.append('q', params.q);
  if (params?.page) query.append('page', params.page.toString());

  return apiFetch(`/crm-pipeline/leads/public/?${query.toString()}`);
}

export async function getPublicLead(id: number) {
  return apiFetch(`/crm-pipeline/leads/public/${id}/`);
}

export async function updatePublicLead(
  id: number,
  data: Partial<PublicLead>
) {
  return apiFetch(`/crm-pipeline/leads/public/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Convert PublicLead → OnlineRequest
export async function convertLeadToOnlineRequest(
  leadId: number,
  data: {
    request_type: 'ADVANCE_EMI' | 'DIRECT_SALE' | 'RENT' | 'LEASE';
    quantity?: number;
    preferred_tenure?: number;
    preferred_lucky_number?: number;
    unit_price?: number;
  }
) {
  return apiFetch(`/crm-pipeline/leads/public/${leadId}/convert-to-online-request/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Get conversion history
export async function getPublicLeadConversionHistory(leadId: number) {
  return apiFetch(`/crm-pipeline/leads/public/${leadId}/conversion-history/`);
}

// Accept OnlineRequest Quote → Create ProductRequest/SubscriptionRequest
export async function acceptOnlineRequestQuote(
  onlineRequestId: number,
  data: {
    request_target_type: 'product_request' | 'subscription_request';
    batch_id?: number;
  }
) {
  return apiFetch(
    `/crm-pipeline/requests/online/${onlineRequestId}/accept-quote/`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

// Batch operations
export async function bulkAssignLeads(
  leadIds: number[],
  assignToUserId: number
) {
  return apiFetch('/crm-pipeline/leads/public/bulk-assign/', {
    method: 'POST',
    body: JSON.stringify({
      lead_ids: leadIds,
      assign_to: assignToUserId,
    }),
  });
}

export async function bulkConvertLeads(
  leadIds: number[],
  requestType: string
) {
  return apiFetch('/crm-pipeline/leads/public/bulk-convert/', {
    method: 'POST',
    body: JSON.stringify({
      lead_ids: leadIds,
      request_type: requestType,
    }),
  });
}
