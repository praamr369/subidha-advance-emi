import { apiFetch } from "@/lib/api";

export type WhatsAppMessageStatus = "QUEUED" | "OPENED" | "SENT" | "SKIPPED";

export type WhatsAppMessage = {
  id: number;
  event_type: string;
  event_label: string;
  status: WhatsAppMessageStatus;
  status_label: string;
  customer: number | null;
  customer_name: string;
  subscription: number | null;
  subscription_number: string;
  phone: string;
  phone_e164: string;
  body: string;
  wa_link?: string;
  web_link?: string;
  opted_in_snapshot: boolean;
  source_model: string;
  source_id: string;
  opened_at: string | null;
  sent_at: string | null;
  sent_by_username: string;
  skip_reason: string;
  created_at: string;
};

export type WhatsAppOutboxSummary = {
  queued: number;
  opened: number;
  sent: number;
  skipped: number;
  pending: number;
  event_types: { value: string; label: string }[];
};

export type WhatsAppOpenResult = {
  id: number;
  link: string;
  web_link?: string;
  phone_e164: string;
  body: string;
  status: WhatsAppMessageStatus;
};

type Paginated<T> = { count: number; results: T[] };

export async function listWhatsAppMessages(params: {
  status?: string;
  event_type?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<Paginated<WhatsAppMessage>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  const payload = await apiFetch<Paginated<WhatsAppMessage> | WhatsAppMessage[]>(
    qs ? `/reminders/whatsapp/?${qs}` : "/reminders/whatsapp/",
  );
  if (Array.isArray(payload)) return { count: payload.length, results: payload };
  return { count: payload?.count ?? 0, results: payload?.results ?? [] };
}

export function getWhatsAppOutboxSummary() {
  return apiFetch<WhatsAppOutboxSummary>("/reminders/whatsapp/summary/");
}

export function openWhatsAppMessage(id: number) {
  return apiFetch<WhatsAppOpenResult>(`/reminders/whatsapp/${id}/open/`, { method: "POST" });
}

export function markWhatsAppMessageSent(id: number) {
  return apiFetch<WhatsAppMessage>(`/reminders/whatsapp/${id}/mark-sent/`, { method: "POST" });
}

export function skipWhatsAppMessage(id: number, reason: string) {
  return apiFetch<WhatsAppMessage>(`/reminders/whatsapp/${id}/skip/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function composeWhatsAppMessage(customerId: number, text: string) {
  return apiFetch<WhatsAppMessage>("/reminders/whatsapp/compose/", {
    method: "POST",
    body: JSON.stringify({ customer: customerId, text }),
  });
}

export type DirectWhatsAppComposePayload = {
  customer?: number | null;
  phone?: string;
  name?: string;
  event_type?: string;
  text?: string;
  amount?: string | number;
  ref?: string;
  receipt?: string;
  date?: string;
  product?: string;
  doc_url?: string;
  offer_text?: string;
  delivery_date?: string;
  payment_mode?: string;
  balance?: string | number;
  recovered_amount?: string | number;
  present_days?: string | number;
  absent_days?: string | number;
  overtime_hours?: string | number;
  customer_name?: string;
  period?: string;
  source_model?: string;
  source_id?: string;
};

export function composeWhatsAppDirect(payload: DirectWhatsAppComposePayload) {
  return apiFetch<WhatsAppMessage & { link?: string; web_link?: string }>("/reminders/whatsapp/compose/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

export function buildClientDirectWhatsAppUrl({
  phone,
  text,
  target = "web",
}: {
  phone: string;
  text: string;
  target?: "web" | "app";
}): string {
  const norm = normalizePhone(phone);
  const encoded = encodeURIComponent(text.trim());
  if (target === "web") {
    return `https://web.whatsapp.com/send?phone=${norm}&text=${encoded}`;
  }
  return `https://wa.me/${norm}?text=${encoded}`;
}
