import { apiFetch } from "@/lib/api";

export type CalendarEventPayload = {
  id: string;
  date: string;
  title: string;
  source_type: string;
  href: string;
  is_completed: boolean;
  color: string;
  customer_name?: string | null;
};

export type DashboardCalendarEventsResponse = {
  events: CalendarEventPayload[];
};

export async function getDashboardCalendarEvents(month?: string): Promise<DashboardCalendarEventsResponse> {
  const query = month ? `?month=${month}` : "";
  return apiFetch(`/api/v1/dashboard/calendar-events${query}`);
}

export type CreateMemoPayload = {
  date: string;
  title: string;
  description?: string;
  color_code?: string;
};

export async function createDashboardMemo(payload: CreateMemoPayload): Promise<{ id: number }> {
  return apiFetch(`/api/v1/dashboard/memos`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
