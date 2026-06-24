import { request } from "@/services/api";
import { toPaginated, toResultsArray } from "@/services/api/list";
import type { ApiPaginatedResponse } from "@/services/api/types";

export type LuckyIdRecord = {
  id: number;
  lucky_number?: number;
  status?: string;
  batch?: number;
};

export type LuckyDrawRecord = {
  id: number;
  batch?: number;
  batch_code?: string;
  draw_commit_id?: number | null;
  draw_month?: number;
  draw_date?: string;
  executed_at?: string;
  is_revealed?: boolean;
  revealed_at?: string | null;
  winner_lucky_id?: number | null;
  winner_lucky_number?: number | null;
  winner_customer_name?: string | null;
  winner_subscription_number?: string | null;
  winner_context?: {
    winner_lucky_id: number;
    winner_lucky_number: number;
    draw_month: number;
    batch_id: number;
  } | null;
  committed_hash?: string;
  public_commit_hash?: string | null;
  commitment_published_at?: string | null;
  eligible_snapshot_count?: number | null;
  revealed_seed?: string | null;
  created_at?: string;
  verification_status?: string | null;
  public_verification_status?: string | null;
  public_winner_name_masked?: string | null;
  public_explanation?: string | null;
  waived_emi_count?: number | null;
  waived_amount?: string | null;
  waiver_scope?: string | null;
  paid_emi_count?: number | null;
  delivery_status?: string | null;
};

export type BatchDrawSummary = {
  id: number;
  batch_code: string;
  status: string;
  duration_months: number;
  total_slots: number;
  draw_day?: number;
  start_date?: string;
  subscription_count: number;
  active_subscription_count: number;
  won_subscription_count: number;
  available_lucky_ids: number;
  assigned_lucky_ids: number;
  won_lucky_ids: number;
  monthly_booked_value: string;
  draw_count: number;
};

export type DrawCommitResponse = {
  id: number;
  batch: number;
  draw_month: number;
  committed_hash: string;
  admin_seed_store_securely: string;
  is_revealed: boolean;
};

export type DrawRevealResponse = {
  id: number;
  draw_month: number;
  winner_subscription_id: number | null;
  winner_lucky_id: number | null;
  winner_lucky_number: number | null;
  waived_amount: string;
  is_revealed: boolean;
  already_revealed: boolean;
};

export async function listAvailableLuckyIds(batchId: string | number): Promise<LuckyIdRecord[]> {
  const payload = await request(`/admin/lucky-ids/available/?batch_id=${encodeURIComponent(String(batchId))}`);
  return toResultsArray<LuckyIdRecord>(payload);
}

export async function listLuckyDraws(params?: { batch?: string | number; revealed?: boolean; page?: number }): Promise<ApiPaginatedResponse<LuckyDrawRecord>> {
  const search = new URLSearchParams();
  if (params?.batch !== undefined) search.set("batch", String(params.batch));
  if (params?.revealed !== undefined) search.set("is_revealed", String(params.revealed));
  if (params?.page) search.set("page", String(params.page));
  const query = search.toString();
  const payload = await request(`/admin/lucky-draws/${query ? `?${query}` : ""}`);
  return toPaginated<LuckyDrawRecord>(payload);
}

export async function listLuckyDrawWinners(params?: { batch?: string | number; page?: number }): Promise<ApiPaginatedResponse<LuckyDrawRecord>> {
  const search = new URLSearchParams();
  if (params?.batch !== undefined) search.set("batch", String(params.batch));
  if (params?.page) search.set("page", String(params.page));
  const query = search.toString();
  const payload = await request(`/admin/lucky-draws/winners/${query ? `?${query}` : ""}`);
  return toPaginated<LuckyDrawRecord>(payload);
}

export function getLuckyDraw(id: number | string): Promise<LuckyDrawRecord> {
  return request(`/admin/lucky-draws/${id}/`);
}

export function getBatchDrawSummary(batchId: number | string): Promise<BatchDrawSummary> {
  return request(`/admin/batches/${batchId}/summary/`);
}

export function createDrawCommit(batchId: number | string): Promise<DrawCommitResponse> {
  return request(`/admin/batches/${batchId}/create-commit/`, {
    method: "POST",
    retryCount: 0,
  });
}

export function revealDraw(drawId: number | string, revealedSeed: string): Promise<DrawRevealResponse> {
  return request(`/admin/lucky-draws/${drawId}/reveal/`, {
    method: "POST",
    body: JSON.stringify({ revealed_seed: revealedSeed }),
    retryCount: 0,
  });
}

export async function verifyLuckyDrawWinner(
  drawId: number | string,
  action: "approve" | "reject",
  notes: string = ""
): Promise<{
  detail: string;
  draw_id: number;
  winner_status: string;
  verified_at: string | null;
}> {
  return request(`/admin/lucky-draws/${drawId}/verify-winner/`, {
    method: "POST",
    body: JSON.stringify({ action, notes }),
  });
}

export async function settleLuckyDrawWinner(
  drawId: number | string
): Promise<{
  detail: string;
  settlement_data: Record<string, unknown>;
  status: string;
}> {
  return request(`/admin/lucky-draws/${drawId}/settle-winner/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
