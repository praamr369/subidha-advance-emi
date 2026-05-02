import { apiFetch } from "@/lib/api";

export type SystemNotification = {
  id: number;
  module: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  source_job_id: number | null;
};

export type NotificationListResponse = {
  count: number;
  unread_count: number;
  results: SystemNotification[];
};

export type UnreadCountResponse = {
  unread_count: number;
};

export type NotificationSummaryResponse = {
  unread_count: number;
  high_priority_count: number;
  latest: SystemNotification[];
};

type QueryValue = string | number | boolean | undefined | null;

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listAdminNotifications(params?: {
  module?: string;
  limit?: number;
}): Promise<NotificationListResponse> {
  return apiFetch(`/admin/notifications/${buildQuery(params ?? {})}`);
}

export async function getAdminNotificationUnreadCount(params?: {
  module?: string;
}): Promise<UnreadCountResponse> {
  return apiFetch(`/admin/notifications/unread-count/${buildQuery(params ?? {})}`);
}

export async function markAdminNotificationRead(id: number): Promise<SystemNotification> {
  return apiFetch(`/admin/notifications/${id}/read/`, { method: "POST" });
}

export async function listCashierNotifications(params?: {
  module?: string;
  limit?: number;
}): Promise<NotificationListResponse> {
  return apiFetch(`/cashier/notifications/${buildQuery(params ?? {})}`);
}

export async function getCashierNotificationUnreadCount(params?: {
  module?: string;
}): Promise<UnreadCountResponse> {
  return apiFetch(`/cashier/notifications/unread-count/${buildQuery(params ?? {})}`);
}

export async function markCashierNotificationRead(id: number): Promise<SystemNotification> {
  return apiFetch(`/cashier/notifications/${id}/read/`, { method: "POST" });
}

export async function listNotifications(params?: {
  module?: string;
  category?: string;
  severity?: string;
  unread?: boolean;
  limit?: number;
}): Promise<NotificationListResponse> {
  return apiFetch(`/notifications/${buildQuery(params ?? {})}`);
}

export async function markNotificationRead(id: number): Promise<SystemNotification> {
  return apiFetch(`/notifications/${id}/read/`, { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<{ updated_count: number }> {
  return apiFetch("/notifications/mark-all-read/", { method: "POST" });
}

export async function getNotificationSummary(): Promise<NotificationSummaryResponse> {
  return apiFetch("/notifications/summary/");
}
