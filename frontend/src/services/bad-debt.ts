import { apiFetch } from "@/lib/api";

export type BadDebtCase = {
  id: number;
  subscription_id: number;
  customer_name: string | null;
  stage: string;
  overdue_amount: string;
  overdue_emis: number;
  aging_days: number;
  aging_bucket: string;
  npa_classified_at: string | null;
  provisioning_percent: string;
  provisioned_amount: string;
  written_off_amount: string;
  written_off_at: string | null;
  legal_notice_date: string | null;
  legal_notice_ref: string;
};

type ListResponse = { count: number; results: BadDebtCase[] };

export type AgingReport = {
  buckets: Record<string, { count: number; total: string }>;
  total_overdue: string;
  total_provisioned: string;
  total_written_off: string;
};

export async function listBadDebtCases(includeWrittenOff = false): Promise<BadDebtCase[]> {
  const data = await apiFetch<ListResponse>(
    `/admin/finance/bad-debt/?include_written_off=${includeWrittenOff}`,
  );
  return data.results ?? [];
}

export function getAgingReport(): Promise<AgingReport> {
  return apiFetch<AgingReport>("/admin/finance/bad-debt/aging-report/");
}

export function classifyNpa(id: number): Promise<{ id: number; npa_classified_at: string; provisioning_percent: string }> {
  return apiFetch(`/admin/finance/bad-debt/${id}/classify-npa/`, { method: "POST" });
}

export function recordLegalNotice(
  id: number,
  noticeDate: string,
  noticeRef: string,
): Promise<{ id: number; stage: string; legal_notice_date: string }> {
  return apiFetch(`/admin/finance/bad-debt/${id}/legal-notice/`, {
    method: "POST",
    body: JSON.stringify({ notice_date: noticeDate, notice_ref: noticeRef }),
  });
}

export function writeOff(id: number): Promise<{ id: number; stage: string; written_off_amount: string }> {
  return apiFetch(`/admin/finance/bad-debt/${id}/write-off/`, { method: "POST" });
}
