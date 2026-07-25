import { apiFetch } from "@/lib/api";
import type { SolopreneurCloseResponse } from "@/services/accounting";

// ── Types ────────────────────────────────────────────────────────────

export type ActionQueueItem = {
  label: string;
  href: string;
  severity: "red" | "amber" | "sky";
  count: number;
  category: string;
};

export type CashPositionAccount = {
  id: number;
  name: string;
  kind: string;
  opening_balance: string;
};

export type SolopreneurTodayResponse = {
  generated_at: string;
  date: string;
  money_today: {
    emis_due_today_count: number;
    emis_due_today_total: string;
    emis_overdue_count: number;
    emis_overdue_total: string;
    ds_outstanding_count: number;
    ds_outstanding_total: string;
    yesterday_collections_total: string;
  };
  cash_position: CashPositionAccount[];
  action_queue: ActionQueueItem[];
  action_queue_count: number;
  health: {
    last_daily_close_date: string | null;
    is_balanced: boolean | null;
  };
};

// ── API calls ────────────────────────────────────────────────────────

export function fetchSolopreneurToday(): Promise<SolopreneurTodayResponse> {
  return apiFetch<SolopreneurTodayResponse>("/admin/solopreneur/today/");
}

// Re-export daily close for convenience from this service
export { postSolopreneurDailyClose } from "@/services/accounting";
export type { SolopreneurCloseResponse };
