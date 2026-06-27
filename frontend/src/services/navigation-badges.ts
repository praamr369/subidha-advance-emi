import { apiFetch } from "@/lib/api";

export type AdminNavigationBadges = {
  outstanding_count: number;
  overdue_count: number;
  pending_delivery_count: number;
  pending_return_count: number;
  pending_refund_count: number;
  pending_reversal_count: number;
  open_support_ticket_count: number;
  low_stock_count: number;
  inspection_stock_count: number;
  unreconciled_count: number;
  pending_draw_count: number;
};

// Deduplicate concurrent in-flight requests — React StrictMode fires effects twice;
// this ensures only one network call goes out per tick.
let _inflight: Promise<AdminNavigationBadges> | null = null;

export async function getAdminNavigationBadges(): Promise<AdminNavigationBadges> {
  if (_inflight) return _inflight;
  _inflight = apiFetch<AdminNavigationBadges>("/admin/dashboard/navigation-badges/").finally(() => {
    _inflight = null;
  });
  return _inflight;
}
