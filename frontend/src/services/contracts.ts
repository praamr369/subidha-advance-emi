/**
 * Phase 3 Contract Lifecycle API client.
 * Covers approve/activate/cancel/close, amendments, possession, and return inspection.
 * All calls target the /api/v1/admin/contracts/* namespace.
 */

import { apiFetch } from "@/lib/api";

// ---------- shared types ----------

export type ContractStatus =
  | "DRAFT"
  | "REQUESTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "ACTIVE"
  | "PAYMENT_PENDING"
  | "DELIVERY_PENDING"
  | "DELIVERED"
  | "HANDED_OVER"
  | "COMPLETED"
  | "CANCELLED"
  | "DEFAULTED"
  | "RETURN_PENDING"
  | "RETURNED"
  | "CLOSED";

export type ContractLifecycleResult = {
  id: number;
  status: ContractStatus;
  subscription_number: string | null;
  terms_locked_at: string | null;
};

// ---------- lifecycle ----------

export async function approveContract(subscriptionId: number): Promise<ContractLifecycleResult> {
  return apiFetch<ContractLifecycleResult>(`/admin/contracts/${subscriptionId}/approve/`, {
    method: "POST",
    body: "{}",
  });
}

export async function activateContract(subscriptionId: number): Promise<ContractLifecycleResult> {
  return apiFetch<ContractLifecycleResult>(`/admin/contracts/${subscriptionId}/activate/`, {
    method: "POST",
    body: "{}",
  });
}

export async function cancelContract(subscriptionId: number, reason: string): Promise<ContractLifecycleResult> {
  return apiFetch<ContractLifecycleResult>(`/admin/contracts/${subscriptionId}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function closeContract(subscriptionId: number): Promise<ContractLifecycleResult> {
  return apiFetch<ContractLifecycleResult>(`/admin/contracts/${subscriptionId}/close/`, {
    method: "POST",
    body: "{}",
  });
}

// ---------- rent/lease settlement (deposit refund + close/cancel) ----------

export type ContractSettleAction = "CLOSE" | "CANCEL";

export type ContractSettlementPreview = {
  applicable: boolean;
  reason?: string;
  status?: ContractStatus;
  allowed_actions?: ContractSettleAction[];
  recommended_action?: ContractSettleAction | null;
  blockers?: string[];
  goods_with_customer?: boolean;
  goods_went_out?: boolean;
  returned_on?: string | null;
  months_to_cancel?: number;
  months_to_cancel_amount?: string;
  unpaid_rent_months?: Array<{
    demand_id: number;
    reference_key: string;
    period_start: string | null;
    amount: string;
    collected: string;
    balance: string;
  }>;
  unpaid_rent_amount?: string;
  deposit_refundable?: string;
  deposit_held?: string;
};

export type ContractSettleInput = {
  action: ContractSettleAction;
  reason?: string;
  waive_unpaid_rent?: boolean;
  deduction_amount?: string;
  deduction_reason?: string;
  finance_account_id?: number;
  payment_method?: string;
  payment_date?: string;
  reference_no?: string;
};

export type ContractSettleResult = {
  action: ContractSettleAction;
  previous_status: ContractStatus;
  status: ContractStatus;
  cancelled_demand_ids: number[];
  waived_demand_ids: number[];
  waived_rent_amount: string;
  deposit_deducted: string;
  deposit_refunded: string;
  refund_reference: string;
};

export async function getContractSettlementPreview(subscriptionId: number): Promise<ContractSettlementPreview> {
  return apiFetch<ContractSettlementPreview>(`/admin/contracts/${subscriptionId}/settle/`, { cache: "no-store" });
}

export async function settleContract(subscriptionId: number, input: ContractSettleInput): Promise<ContractSettleResult> {
  return apiFetch<ContractSettleResult>(`/admin/contracts/${subscriptionId}/settle/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ---------- amendments ----------

export type ContractAmendmentStatus = "REQUESTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "IMPLEMENTED" | "CANCELLED" | "APPLIED";
export type ContractAmendmentType =
  | "ADDRESS_CHANGE"
  | "CONTACT_CORRECTION"
  | "LEGAL_DOCUMENT_CORRECTION"
  | "TENURE_EXTENSION"
  | "SCHEDULE_CORRECTION"
  | "PRODUCT_CHANGE"
  | "LUCKY_ID_CHANGE"
  | "BATCH_CHANGE"
  | "DEPOSIT_ADJUSTMENT"
  | "EMI_AMOUNT_CHANGE"
  | "CONTRACT_PRICE_CHANGE"
  | "RENT_AMOUNT_CHANGE"
  | "LEASE_TERM_CHANGE"
  | "OTHER"
  | "PRODUCT_UPGRADE";

export type ContractAmendment = {
  id: number;
  subscription: number;
  amendment_type: ContractAmendmentType;
  status: ContractAmendmentStatus;
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  reason: string;
  rejection_reason: string | null;
  notes: string;
  requested_by: number | null;
  approved_by: number | null;
  approved_at: string | null;
  applied_at: string | null;
  created_at: string;
};

export async function listContractAmendments(subscriptionId: number): Promise<ContractAmendment[]> {
  const data = await apiFetch<ContractAmendment[] | { results: ContractAmendment[] }>(
    `/admin/contracts/${subscriptionId}/amendments/`
  );
  if (Array.isArray(data)) return data;
  if (data && "results" in data) return data.results;
  return [];
}

export async function createContractAmendment(
  subscriptionId: number,
  payload: {
    amendment_type: ContractAmendmentType;
    previous_values: Record<string, unknown>;
    new_values: Record<string, unknown>;
    reason: string;
    notes?: string;
  }
): Promise<ContractAmendment> {
  return apiFetch<ContractAmendment>(`/admin/contracts/${subscriptionId}/amendments/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveAmendment(amendmentId: number): Promise<ContractAmendment> {
  return apiFetch<ContractAmendment>(`/admin/contracts/amendments/${amendmentId}/approve/`, {
    method: "POST",
    body: "{}",
  });
}

export async function rejectAmendment(amendmentId: number, rejection_reason: string): Promise<ContractAmendment> {
  return apiFetch<ContractAmendment>(`/admin/contracts/amendments/${amendmentId}/reject/`, {
    method: "POST",
    body: JSON.stringify({ rejection_reason }),
  });
}

export async function applyAmendment(amendmentId: number): Promise<ContractAmendment> {
  return apiFetch<ContractAmendment>(`/admin/contracts/amendments/${amendmentId}/apply/`, {
    method: "POST",
    body: "{}",
  });
}

// ---------- possession ----------

export type PossessionStatus =
  | "PENDING_HANDOVER"
  | "WITH_CUSTOMER"
  | "RETURN_DUE"
  | "RETURNED"
  | "UNDER_INSPECTION"
  | "MAINTENANCE"
  | "CLOSED";

export type ProductPossession = {
  id: number;
  subscription: number;
  product: number;
  customer: number;
  status: PossessionStatus;
  handover_date: string | null;
  expected_return_date: string | null;
  actual_return_date: string | null;
  handover_condition_notes: string;
  return_condition_notes: string;
  serial_number: string;
  handed_over_by: number | null;
  returned_to: number | null;
  created_at: string;
  updated_at: string;
};

export async function getContractPossession(subscriptionId: number): Promise<ProductPossession | null> {
  try {
    return await apiFetch<ProductPossession>(`/admin/contracts/${subscriptionId}/possession/`);
  } catch {
    return null;
  }
}

export async function createContractPossession(
  subscriptionId: number,
  payload?: {
    expected_return_date?: string;
    serial_number?: string;
    handover_condition_notes?: string;
  }
): Promise<ProductPossession> {
  return apiFetch<ProductPossession>(`/admin/contracts/${subscriptionId}/possession/`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function recordContractHandover(
  subscriptionId: number,
  payload?: {
    handover_date?: string;
    handover_condition_notes?: string;
  }
): Promise<ProductPossession> {
  return apiFetch<ProductPossession>(`/admin/contracts/${subscriptionId}/possession/handover/`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function initiateContractReturn(
  subscriptionId: number,
  payload?: {
    actual_return_date?: string;
    return_condition_notes?: string;
  }
): Promise<ProductPossession> {
  return apiFetch<ProductPossession>(`/admin/contracts/${subscriptionId}/possession/return/`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

// ---------- return inspection ----------

export type InspectionStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "APPROVED";
export type InspectionOutcome = "SELLABLE" | "MAINTENANCE_REQUIRED" | "DAMAGED" | "SCRAPPED";
export type InspectionCondition = "NOT_ASSESSED" | "GOOD" | "FAIR" | "DAMAGED";

export type ReturnInspection = {
  id: number;
  subscription: number;
  status: InspectionStatus;
  outcome: InspectionOutcome | null;
  inspection_date: string | null;
  condition_recorded: InspectionCondition;
  damage_notes: string;
  damage_deduction_amount: string;
  deposit_refund_amount: string;
  deposit_refund_approved: boolean;
  approved_at: string | null;
  stock_routing_notes: string;
  inspected_by: number | null;
  approved_by: number | null;
  created_at: string;
  updated_at: string;
};

export async function getReturnInspection(subscriptionId: number): Promise<ReturnInspection | null> {
  try {
    return await apiFetch<ReturnInspection>(`/admin/contracts/${subscriptionId}/return-inspection/`);
  } catch {
    return null;
  }
}

export async function createReturnInspection(subscriptionId: number): Promise<ReturnInspection> {
  return apiFetch<ReturnInspection>(`/admin/contracts/${subscriptionId}/return-inspection/`, {
    method: "POST",
    body: "{}",
  });
}

export async function recordReturnInspection(
  subscriptionId: number,
  payload: {
    condition: InspectionCondition;
    outcome: InspectionOutcome;
    damage_notes?: string;
    damage_deduction_amount?: string;
    deposit_refund_amount?: string;
    stock_routing_notes?: string;
    inspection_date?: string;
  }
): Promise<ReturnInspection> {
  return apiFetch<ReturnInspection>(`/admin/contracts/${subscriptionId}/return-inspection/record/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveReturnInspection(subscriptionId: number): Promise<ReturnInspection> {
  return apiFetch<ReturnInspection>(`/admin/contracts/${subscriptionId}/return-inspection/approve/`, {
    method: "POST",
    body: "{}",
  });
}
