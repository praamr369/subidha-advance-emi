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

export async function getAdminNavigationBadges(): Promise<AdminNavigationBadges> {
  return apiFetch<AdminNavigationBadges>("/admin/dashboard/navigation-badges/");
}
