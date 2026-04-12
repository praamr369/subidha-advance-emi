import { apiFetch } from "@/lib/api";

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

export type PartyRoleType = "LEAD" | "CUSTOMER" | "PARTNER" | "VENDOR" | "STAFF";
export type PartyFollowUpState = "NONE" | "DUE" | "SCHEDULED";

export type CrmLeadSnapshot = {
  id: number;
  name: string;
  phone: string;
  city?: string;
  status: string;
  product_name?: string | null;
  converted_customer_id?: number | null;
  converted_subscription_id?: number | null;
  converted_direct_sale_id?: number | null;
  created_at?: string | null;
};

export type PartyListRow = {
  id: number;
  party_no: string;
  display_name: string;
  party_kind: string;
  primary_phone?: string;
  primary_email?: string;
  city?: string;
  is_active: boolean;
  role_types: PartyRoleType[];
  next_follow_up_at?: string | null;
  follow_up_state: PartyFollowUpState;
  open_follow_up_count: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PartyInteraction = {
  id: number;
  party: number;
  interaction_type: string;
  status: "OPEN" | "DONE" | "CANCELLED";
  subject?: string;
  note: string;
  happened_at?: string | null;
  next_follow_up_at?: string | null;
  completed_at?: string | null;
  created_by?: number | null;
  created_by_username?: string | null;
  reminder?: number | null;
  reminder_no?: string | null;
  related_source_model?: string;
  related_source_pk?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PartyDirectoryListResponse = {
  count: number;
  results: PartyListRow[];
};

export type PartyDetailResponse = {
  party: PartyListRow & {
    role_types: PartyRoleType[];
  };
  links: Array<{
    id: number;
    role_type: PartyRoleType;
    source_model: string;
    source_pk: number;
    source_reference?: string;
    metadata?: Record<string, unknown>;
  }>;
  summary: {
    lead_count: number;
    customer_count: number;
    partner_count: number;
    vendor_count: number;
    staff_count: number;
    subscription_count: number;
    direct_sale_count: number;
    invoice_count: number;
    receipt_count: number;
    delivery_count: number;
    support_count: number;
    service_case_count: number;
    return_case_count: number;
    service_ticket_count: number;
    complaint_case_count: number;
    reminder_count: number;
    interaction_count: number;
    open_follow_up_count: number;
  };
  related: {
    leads: CrmLeadSnapshot[];
    customers: Array<Record<string, unknown>>;
    partners: Array<Record<string, unknown>>;
    vendors: Array<Record<string, unknown>>;
    staff: Array<Record<string, unknown>>;
    subscriptions: Array<Record<string, unknown>>;
    direct_sales: Array<Record<string, unknown>>;
    invoices: Array<Record<string, unknown>>;
    receipts: Array<Record<string, unknown>>;
    deliveries: Array<Record<string, unknown>>;
    support_requests: Array<Record<string, unknown>>;
    service_cases: Array<Record<string, unknown>>;
    return_cases: Array<Record<string, unknown>>;
    service_tickets: Array<Record<string, unknown>>;
    complaint_cases: Array<Record<string, unknown>>;
    reminders: Array<Record<string, unknown>>;
    interactions: PartyInteraction[];
  };
  timeline: Array<{
    event_at: string;
    event_type: string;
    label: string;
    status?: string;
    reference?: string;
    detail?: string;
    branch_id?: number | null;
    branch_code?: string | null;
    branch_name?: string | null;
    link?: Record<string, number | string>;
  }>;
};

export type CrmOverviewResponse = {
  summary: {
    party_count: number;
    lead_count: number;
    customer_count: number;
    partner_count: number;
    vendor_count: number;
    staff_count: number;
    due_follow_up_count: number;
    scheduled_follow_up_count: number;
    open_interaction_count: number;
  };
  lead_pipeline: {
    new: number;
    in_progress: number;
    contacted: number;
    converted: number;
    closed: number;
  };
  recent_parties: PartyListRow[];
  recent_leads: CrmLeadSnapshot[];
  follow_up_queue: Array<{
    id: number;
    party_id: number;
    party_no: string;
    party_display_name: string;
    interaction_type: string;
    status: string;
    subject?: string;
    next_follow_up_at?: string | null;
    happened_at?: string | null;
    created_by_username?: string | null;
  }>;
};

export function getCrmOverview() {
  return apiFetch<CrmOverviewResponse>("/crm/overview/");
}

export function listCrmParties(params: Record<string, QueryValue> = {}) {
  return apiFetch<PartyDirectoryListResponse>(`/crm/parties/${buildQuery(params)}`);
}

export function getCrmParty(id: number | string) {
  return apiFetch<PartyDetailResponse>(`/crm/parties/${id}/`);
}

export function createPartyInteraction(
  partyId: number | string,
  payload: {
    interaction_type?: string;
    status?: string;
    subject?: string;
    note: string;
    happened_at?: string | null;
    next_follow_up_at?: string | null;
    related_source_model?: string;
    related_source_pk?: number | null;
    create_follow_up_reminder?: boolean;
    reminder_channel?: string;
  }
) {
  return apiFetch<{ interaction: PartyInteraction; party: PartyDetailResponse["party"] }>(
    `/crm/parties/${partyId}/interactions/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function updatePartyInteractionStatus(
  interactionId: number | string,
  status: "OPEN" | "DONE" | "CANCELLED"
) {
  return apiFetch<{ interaction: PartyInteraction; party: PartyDetailResponse["party"] }>(
    `/crm/interactions/${interactionId}/status/`,
    {
      method: "POST",
      body: JSON.stringify({ status }),
    }
  );
}
