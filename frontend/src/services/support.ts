import { apiFetch } from "@/lib/api";

export type SupportTicketCategory =
  | "SERVICE_REQUEST"
  | "RETURN_REQUEST"
  | "WARRANTY_CLAIM"
  | "DELIVERY_ISSUE"
  | "PRODUCT_DAMAGE"
  | "PAYMENT_ISSUE"
  | "EMI_QUERY"
  | "RENT_QUERY"
  | "LEASE_QUERY"
  | "DIRECT_SALE_QUERY"
  | "DOCUMENT_CORRECTION"
  | "CUSTOMER_PROFILE_UPDATE"
  | "LUCKY_DRAW_QUERY"
  | "PARTNER_COMPLAINT"
  | "GENERAL_SUPPORT";

export type SupportTicketTab = "open" | "waiting_customer" | "resolved" | "all";

export type SupportTicketListItem = {
  id: number;
  ticket_no: string;
  category: SupportTicketCategory | string;
  status: string;
  priority: string;
  subject: string;
  source?: string;
  customer?: number | null;
  created_by?: number | null;
  assigned_to?: number | null;
  due_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  preferred_contact_time?: string;
  created_at: string;
  updated_at: string;
};

export type SupportTicketDetail = SupportTicketListItem & {
  description: string;
  resolution_summary?: string | null;
  customer_detail?: { id: number; name: string; phone: string } | null;
  comments: Array<{
    id: number;
    body: string;
    is_internal?: boolean;
    author: { id: number; username: string; first_name: string; last_name: string };
    created_at: string;
  }>;
  timeline: Array<Record<string, unknown>>;
  operational_context: Record<string, unknown>;
};

export type SupportDashboardSummary = {
  total: number;
  open: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
};

function qs(params: Record<string, string | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

export async function listCustomerSupportTickets(tab: SupportTicketTab = "all"): Promise<{
  count: number;
  results: SupportTicketListItem[];
}> {
  return apiFetch(`/api/v1/customer/support/tickets/${qs({ tab: tab === "all" ? undefined : tab })}`);
}

export async function createCustomerSupportTicket(payload: {
  category: SupportTicketCategory;
  subject: string;
  description: string;
  priority?: string;
  preferred_contact_time?: string;
  link_type?: string;
  link_object_id?: number;
}): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/customer/support/tickets/`, {
    method: "POST",
    body: payload,
  });
}

export async function getCustomerSupportTicket(id: number): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/customer/support/tickets/${id}/`);
}

export async function commentCustomerSupportTicket(
  id: number,
  body: string
): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/customer/support/tickets/${id}/comment/`, {
    method: "POST",
    body: { body },
  });
}

export async function reopenCustomerSupportTicket(
  id: number,
  message?: string
): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/customer/support/tickets/${id}/reopen/`, {
    method: "POST",
    body: { message: message || "" },
  });
}

export async function listAdminSupportTickets(params: {
  q?: string;
  status?: string;
  priority?: string;
  category?: string;
  assignee?: string;
}): Promise<{ count: number; summary: SupportDashboardSummary; results: SupportTicketListItem[] }> {
  return apiFetch(`/api/v1/admin/support/tickets/${qs(params)}`);
}

export async function getAdminSupportTicketDashboard(params: {
  q?: string;
  status?: string;
}): Promise<SupportDashboardSummary> {
  return apiFetch(`/api/v1/admin/support/dashboard/${qs(params)}`);
}

export async function getAdminSupportTicket(id: number): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/admin/support/tickets/${id}/`);
}

export async function patchAdminSupportTicket(
  id: number,
  body: Partial<{
    status: string;
    priority: string;
    due_at: string | null;
    subject: string;
    description: string;
    category: string;
  }>
): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/admin/support/tickets/${id}/`, {
    method: "PATCH",
    body,
  });
}

export async function assignAdminSupportTicket(
  id: number,
  assigneeId: number | null
): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/admin/support/tickets/${id}/assign/`, {
    method: "POST",
    body: { assignee_id: assigneeId },
  });
}

export async function commentAdminSupportTicket(
  id: number,
  body: string
): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/admin/support/tickets/${id}/comment/`, {
    method: "POST",
    body: { body },
  });
}

export async function internalNoteAdminSupportTicket(
  id: number,
  body: string
): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/admin/support/tickets/${id}/internal-note/`, {
    method: "POST",
    body: { body },
  });
}

export async function linkAdminSupportTicket(
  id: number,
  link_type: string,
  object_id: number
): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/admin/support/tickets/${id}/link/`, {
    method: "POST",
    body: { link_type, object_id },
  });
}

export async function resolveAdminSupportTicket(
  id: number,
  resolution_summary: string
): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/admin/support/tickets/${id}/resolve/`, {
    method: "POST",
    body: { resolution_summary },
  });
}

export async function rejectAdminSupportTicket(id: number, reason: string): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/admin/support/tickets/${id}/reject/`, {
    method: "POST",
    body: { reason },
  });
}

export async function closeAdminSupportTicket(id: number, note?: string): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/admin/support/tickets/${id}/close/`, {
    method: "POST",
    body: { note: note || "" },
  });
}

export async function reopenAdminSupportTicket(
  id: number,
  message?: string
): Promise<SupportTicketDetail> {
  return apiFetch(`/api/v1/admin/support/tickets/${id}/reopen/`, {
    method: "POST",
    body: { message: message || "" },
  });
}
