/**
 * Dispute SLA tracking API service
 * Handles SLA compliance monitoring and escalation
 *
 * Uses apiFetch, not raw fetch. These functions previously called fetch()
 * directly with `credentials: 'include'` and no Authorization header. The
 * backend authenticates with JWT only (DEFAULT_AUTHENTICATION_CLASSES is
 * JWTAuthentication), which reads the bearer token from the header and ignores
 * cookies — so every one of these returned 401 and the whole SLA surface was
 * dead. The endpoints themselves were fine.
 */
import { apiFetch } from "@/lib/api";

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
  return apiFetch(`/admin/crm/disputes/${disputeId}/sla-status/`) as Promise<DisputeSLAStatus>;
}

export async function getBreachedSLADisputes(): Promise<{ count: number; results: DisputeWithSLA[] }> {
  return apiFetch(`/admin/crm/disputes/sla-breached/`) as Promise<{
    count: number;
    results: DisputeWithSLA[];
  }>;
}

export async function getPendingEscalationDisputes(): Promise<{ count: number; results: DisputeWithSLA[] }> {
  return apiFetch(`/admin/crm/disputes/pending-escalation/`) as Promise<{
    count: number;
    results: DisputeWithSLA[];
  }>;
}

export async function moveDisputeToReview(disputeId: number, assignedToId?: number): Promise<DisputeWithSLA> {
  return apiFetch(`/admin/crm/disputes/${disputeId}/move-to-review/`, {
    method: "POST",
    body: JSON.stringify({ assigned_to_id: assignedToId }),
  }) as Promise<DisputeWithSLA>;
}

export async function escalateDispute(disputeId: number): Promise<DisputeWithSLA> {
  return apiFetch(`/admin/crm/disputes/${disputeId}/escalate/`, {
    method: "POST",
  }) as Promise<DisputeWithSLA>;
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
