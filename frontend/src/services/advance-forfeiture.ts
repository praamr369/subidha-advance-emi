import { apiFetch } from "@/lib/api";

export type AdvanceForfeitureStatus = "PENDING_REVIEW" | "CONTACT_ATTEMPTED" | "FORFEITED" | "REVERSED";

export type DormantCandidate = {
  advance_id: number;
  customer_id: number;
  customer_name: string | null;
  amount: string;
  unapplied_amount: string;
  payment_date: string;
  dormant_days: number;
};

export type ContactAttempt = {
  date: string;
  method: string;
  outcome: string;
  recorded_by: string;
};

export type AdvanceForfeiture = {
  id: number;
  advance_id: number;
  status: AdvanceForfeitureStatus;
  forfeited_amount: string;
  dormant_since: string;
  forfeiture_date: string | null;
  contact_attempts: ContactAttempt[];
  legal_basis: string;
  forfeited_by: string | null;
  customer_name: string | null;
  reversed_at: string | null;
  reversal_reason: string;
};

type ForfeitureListResponse = {
  dormant_candidates: DormantCandidate[];
  existing_forfeitures: AdvanceForfeiture[];
};

export async function listAdvanceForfeitures(): Promise<ForfeitureListResponse> {
  return apiFetch<ForfeitureListResponse>("/admin/finance/advance-forfeitures/");
}

export function recordContactAttempt(
  advanceId: number,
  method: string,
  outcome: string,
): Promise<{ forfeiture_id: number; attempts: number }> {
  return apiFetch(`/admin/finance/advance-forfeitures/${advanceId}/contact-attempt/`, {
    method: "POST",
    body: JSON.stringify({ method, outcome }),
  });
}

export function forfeitAdvance(
  advanceId: number,
): Promise<{ forfeiture_id: number; forfeited_amount: string; status: string }> {
  return apiFetch(`/admin/finance/advance-forfeitures/${advanceId}/forfeit/`, {
    method: "POST",
  });
}

export function reverseForfeiture(
  id: number,
  reason: string,
): Promise<{ forfeiture_id: number; status: string }> {
  return apiFetch(`/admin/finance/advance-forfeitures/${id}/reverse/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
