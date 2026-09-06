import { apiFetch } from "@/lib/api";
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
  return apiFetch(`/admin/recovery-cases/${caseId}/settlement/`);
}

export async function requestSettlement(
  caseId: number,
  settlementNotes: string
): Promise<{ status: string; settlement_requested_at: string; settlement_requested_by: string }> {
  return apiFetch(`/admin/recovery-cases/${caseId}/settlement/`, {
    method: "POST",
    body: JSON.stringify({
      action: 'request',
      settlement_notes: settlementNotes,
    }),
  });
}

export async function approveSettlement(
  caseId: number,
  settlementType: 'FULL' | 'PARTIAL',
  settledAmount: number,
  approvalNotes: string
): Promise<{ status: string; settlement_type: string; settled_amount: string; settlement_approved_by: string }> {
  return apiFetch(`/admin/recovery-cases/${caseId}/settlement/`, {
    method: "POST",
    body: JSON.stringify({
      action: 'approve',
      settlement_type: settlementType,
      settled_amount: settledAmount,
      approval_notes: approvalNotes,
    }),
  });
}
