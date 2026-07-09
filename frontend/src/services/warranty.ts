/**
 * Warranty & Service management API
 */

export interface WarrantyClaim {
  id: number;
  service_case_id: number;
  product_id: number;
  product_name: string;
  warranty_type: string;
  warranty_end_date: string;
  is_in_warranty: boolean;
  defect_description: string;
  defect_classification: string;
  claim_status: string;
  claim_submitted_at: string;
  recommended_remedy: string;
  total_cost: string;
}

export interface WarrantyEligibility {
  is_in_warranty: boolean;
  warranty_end_date: string | null;
  days_to_deadline: number;
  is_claim_eligible: boolean;
  status: string;
}

export interface ServicePricing {
  product_id: number;
  product_name: string;
  warranty_labor_cost: number;
  out_of_warranty_labor_cost: number;
  home_service_charge: number;
  travel_charge_beyond_5km: number;
  home_visit_days: number;
  service_completion_days: number;
}

export interface ExtendedWarrantyPlan {
  id: number;
  subscription_id: number;
  product_id: number;
  product_name: string;
  plan_duration_months: number;
  plan_cost: string;
  coverage_start_date: string;
  coverage_end_date: string;
  payment_status: string;
  is_active: boolean;
}

export async function listWarrantyClaims(filters?: {
  status?: string;
  product_id?: number;
  in_warranty?: boolean;
}): Promise<{ count: number; results: WarrantyClaim[] }> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.product_id) params.set('product_id', String(filters.product_id));
  if (filters?.in_warranty !== undefined) params.set('in_warranty', String(filters.in_warranty));

  const response = await fetch(`/api/v1/admin/warranty-claims/?${params}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to list warranty claims');
  return response.json();
}

export async function getWarrantyClaimDetail(claimId: number): Promise<WarrantyClaim & { eligibility: WarrantyEligibility }> {
  const response = await fetch(`/api/v1/admin/warranty-claims/${claimId}/`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch warranty claim');
  return response.json();
}

export async function assessWarrantyClaim(
  claimId: number,
  classification: string,
  assessment_notes: string
): Promise<WarrantyClaim> {
  const response = await fetch(`/api/v1/admin/warranty-claims/${claimId}/assess/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ classification, assessment_notes }),
  });
  if (!response.ok) throw new Error('Failed to assess claim');
  return response.json();
}

export async function approveWarrantyClaim(
  claimId: number,
  remedy: string,
  cost_labor: number,
  cost_parts: number,
  cost_travel: number = 0
): Promise<WarrantyClaim> {
  const response = await fetch(`/api/v1/admin/warranty-claims/${claimId}/approve/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ remedy, cost_labor, cost_parts, cost_travel }),
  });
  if (!response.ok) throw new Error('Failed to approve claim');
  return response.json();
}

export async function rejectWarrantyClaim(
  claimId: number,
  rejection_reason: string
): Promise<{ status: string }> {
  const response = await fetch(`/api/v1/admin/warranty-claims/${claimId}/reject/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ rejection_reason }),
  });
  if (!response.ok) throw new Error('Failed to reject claim');
  return response.json();
}

export async function resolveWarrantyClaim(claimId: number): Promise<{ status: string }> {
  const response = await fetch(`/api/v1/admin/warranty-claims/${claimId}/resolve/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to resolve claim');
  return response.json();
}

export async function getServicePricing(productId: number): Promise<ServicePricing> {
  const response = await fetch(`/api/v1/admin/service-pricing/${productId}/`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch service pricing');
  return response.json();
}

export async function listExtendedWarranties(subscriptionId?: number): Promise<{ count: number; results: ExtendedWarrantyPlan[] }> {
  const params = new URLSearchParams();
  if (subscriptionId) params.set('subscription_id', String(subscriptionId));

  const response = await fetch(`/api/v1/admin/extended-warranty/?${params}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to list warranty plans');
  return response.json();
}

export async function enrollExtendedWarranty(
  subscriptionId: number,
  productId: number
): Promise<ExtendedWarrantyPlan> {
  const response = await fetch('/api/v1/admin/extended-warranty/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ subscription_id: subscriptionId, product_id: productId }),
  });
  if (!response.ok) throw new Error('Failed to enroll in extended warranty');
  return response.json();
}

export async function markWarrantyPlanPaid(planId: number): Promise<{ id: number; payment_status: string; paid_at: string }> {
  const response = await fetch(`/api/v1/admin/extended-warranty/${planId}/mark-paid/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to mark plan as paid');
  return response.json();
}
