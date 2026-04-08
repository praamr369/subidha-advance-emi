import { apiFetch } from "@/lib/api";

type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
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

export type PaymentReminder = {
  id: number;
  reminder_no?: string;
  channel: string;
  reminder_type: string;
  target_customer?: number | null;
  target_customer_name?: string | null;
  target_subscription?: number | null;
  target_invoice?: number | null;
  target_invoice_no?: string | null;
  target_payment?: number | null;
  target_payment_reference?: string | null;
  due_date: string;
  amount_due: string;
  status: string;
  scheduled_for?: string | null;
  sent_at?: string | null;
  sent_by_username?: string | null;
  customer_contact?: string;
  attempts?: number;
  notes?: string;
  template_key?: string;
  last_error?: string;
};

export function listReminders(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<PaymentReminder>>(
    `/reminders/payment-reminders/${buildQuery(params)}`
  );
}

export function scheduleReminder(id: number, scheduledFor: string) {
  return apiFetch<{ updated: boolean; reminder: PaymentReminder }>(`/reminders/${id}/schedule/`, {
    method: "POST",
    body: JSON.stringify({ scheduled_for: scheduledFor }),
  });
}

export function sendReminder(id: number, notes = "") {
  return apiFetch<{ updated: boolean; reminder: PaymentReminder }>(`/reminders/${id}/send/`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

export function cancelReminder(id: number, notes = "") {
  return apiFetch<{ updated: boolean; reminder: PaymentReminder }>(`/reminders/${id}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

export function runPaymentReminders(payload: {
  due_date_on_or_before?: string;
  send_now?: boolean;
}) {
  return apiFetch<{
    due_date_on_or_before: string;
    created_count: number;
    skipped_count: number;
    send_now: boolean;
    sent_count: number;
    send_skipped_count: number;
  }>("/reminders/run/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
