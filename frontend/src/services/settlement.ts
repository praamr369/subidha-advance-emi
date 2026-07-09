/**
 * Settlement workflow API service
 * Handles recovery case settlement request/approval
 */

export interface SettlementDetails {
  id: number;
  subscription_id: number;
  customer_name: string;
  overdue_amount: string;
  overdue_emis: number;
  stage: string;
  settlement_requested: boolean;
  settlement_requested_at: string | null;
  settlement_requested_by: string | null;
  settlement_notes: string;
  settlement_approved: boolean;
  settlement_approved_at: string | null;
  settlement_approved_by: string | null;
  settlement_type: string;
  settled_amount: string;
  settlement_approval_notes: string;
  settled_at: string | null;
}

export async function getSettlementDetails(caseId: number): Promise<SettlementDetails> {
  const response = await fetch(`/api/v1/admin/recovery-cases/${caseId}/settlement/`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Failed to fetch settlement details: ${response.statusText}`);
  return response.json();
}

export async function requestSettlement(
  caseId: number,
  settlementNotes: string
): Promise<{ status: string; settlement_requested_at: string; settlement_requested_by: string }> {
  const response = await fetch(`/api/v1/admin/recovery-cases/${caseId}/settlement/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action: 'request',
      settlement_notes: settlementNotes,
    }),
  });
  if (!response.ok) throw new Error(`Failed to request settlement: ${response.statusText}`);
  return response.json();
}

export async function approveSettlement(
  caseId: number,
  settlementType: 'FULL' | 'PARTIAL',
  settledAmount: number,
  approvalNotes: string
): Promise<{ status: string; settlement_type: string; settled_amount: string; settlement_approved_by: string }> {
  const response = await fetch(`/api/v1/admin/recovery-cases/${caseId}/settlement/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      action: 'approve',
      settlement_type: settlementType,
      settled_amount: settledAmount,
      approval_notes: approvalNotes,
    }),
  });
  if (!response.ok) throw new Error(`Failed to approve settlement: ${response.statusText}`);
  return response.json();
}
