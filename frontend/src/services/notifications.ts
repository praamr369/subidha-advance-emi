import { apiFetch } from "@/lib/api";

export type SystemNotification = {
  id: number;
  recipient: number | null;
  audience: string;
  module: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
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

type QueryValue = string | number | undefined | null;

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
  return apiFetch(`/api/v1/admin/notifications/${buildQuery(params ?? {})}`);
}

export async function getAdminNotificationUnreadCount(params?: {
  module?: string;
}): Promise<UnreadCountResponse> {
  return apiFetch(`/api/v1/admin/notifications/unread-count/${buildQuery(params ?? {})}`);
}

export async function markAdminNotificationRead(id: number): Promise<SystemNotification> {
  return apiFetch(`/api/v1/admin/notifications/${id}/read/`, { method: "POST" });
}

export async function listCashierNotifications(params?: {
  module?: string;
  limit?: number;
}): Promise<NotificationListResponse> {
  return apiFetch(`/api/v1/cashier/notifications/${buildQuery(params ?? {})}`);
}

export async function getCashierNotificationUnreadCount(params?: {
  module?: string;
}): Promise<UnreadCountResponse> {
  return apiFetch(`/api/v1/cashier/notifications/unread-count/${buildQuery(params ?? {})}`);
}

export async function markCashierNotificationRead(id: number): Promise<SystemNotification> {
  return apiFetch(`/api/v1/cashier/notifications/${id}/read/`, { method: "POST" });
}
