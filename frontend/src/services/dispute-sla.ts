/**
 * Dispute SLA tracking API service
 * Handles SLA compliance monitoring and escalation
 */

export interface DisputeSLAStatus {
  dispute_ref: string;
  stage: string;
  is_sla_compliant: boolean;
  is_sla_breached: boolean;
  days_since_creation: number;
  open_due_at: string | null;
  review_due_at: string | null;
  resolve_due_at: string | null;
  review_started_at: string | null;
}

export interface DisputeWithSLA {
  id: number;
  dispute_ref: string;
  customer_id: number;
  customer_name: string;
  dispute_type: string;
  subject: string;
  stage: string;
  priority: string;
  is_sla_compliant: boolean;
  is_sla_breached: boolean;
  days_since_creation: number;
  open_due_at: string | null;
  review_due_at: string | null;
  resolve_due_at: string | null;
  created_at: string;
}

export async function getDisputeSLAStatus(disputeId: number): Promise<DisputeSLAStatus> {
  const response = await fetch(`/api/v1/admin/crm/disputes/${disputeId}/sla-status/`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Failed to fetch SLA status: ${response.statusText}`);
  return response.json();
}

export async function getBreachedSLADisputes(): Promise<{ count: number; results: DisputeWithSLA[] }> {
  const response = await fetch(`/api/v1/admin/crm/disputes/sla-breached/`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Failed to fetch breached disputes: ${response.statusText}`);
  return response.json();
}

export async function getPendingEscalationDisputes(): Promise<{ count: number; results: DisputeWithSLA[] }> {
  const response = await fetch(`/api/v1/admin/crm/disputes/pending-escalation/`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Failed to fetch pending escalation disputes: ${response.statusText}`);
  return response.json();
}

export async function moveDisputeToReview(disputeId: number, assignedToId?: number): Promise<DisputeWithSLA> {
  const response = await fetch(`/api/v1/admin/crm/disputes/${disputeId}/move-to-review/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ assigned_to_id: assignedToId }),
  });
  if (!response.ok) throw new Error(`Failed to move to review: ${response.statusText}`);
  return response.json();
}

export async function escalateDispute(disputeId: number): Promise<DisputeWithSLA> {
  const response = await fetch(`/api/v1/admin/crm/disputes/${disputeId}/escalate/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Failed to escalate dispute: ${response.statusText}`);
  return response.json();
}

export function formatSLAStatus(status: DisputeSLAStatus): {
  label: string;
  color: string;
  daysRemaining: number | null;
  deadline: string | null;
} {
  if (status.is_sla_breached) {
    return {
      label: 'SLA Breached',
      color: 'bg-red-100 text-red-700',
      daysRemaining: null,
      deadline: null,
    };
  }

  if (!status.is_sla_compliant) {
    return {
      label: 'SLA At Risk',
      color: 'bg-yellow-100 text-yellow-700',
      daysRemaining: null,
      deadline: null,
    };
  }

  let deadline = null;
  let daysRemaining = null;

  if (status.stage === 'OPEN' && status.open_due_at) {
    deadline = status.open_due_at;
    const daysLeft = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    daysRemaining = daysLeft > 0 ? daysLeft : 0;
  } else if (status.stage === 'UNDER_REVIEW' && status.review_due_at) {
    deadline = status.review_due_at;
    const daysLeft = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    daysRemaining = daysLeft > 0 ? daysLeft : 0;
  }

  return {
    label: 'SLA On Track',
    color: 'bg-green-100 text-green-700',
    daysRemaining,
    deadline,
  };
}
