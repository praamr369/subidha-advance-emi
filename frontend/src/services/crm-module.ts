import { apiFetch } from "@/lib/api";

export type LeadStage =
  | "NEW"
  | "CONTACTED"
  | "INTERESTED"
  | "KYC_PENDING"
  | "READY_TO_CONVERT"
  | "CONVERTED"
  | "LOST";

export type LeadPlanType = "LUCKY_PLAN" | "RENT" | "LEASE" | "DIRECT_SALE";

export type LeadSource =
  | "WALK_IN"
  | "REFERRAL"
  | "ONLINE_ENQUIRY"
  | "PARTNER"
  | "BROCHURE"
  | "EVENT"
  | "SOCIAL_MEDIA"
  | "PHONE_CALL"
  | "INTERNAL"
  | "OTHER";

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  WALK_IN: "Walk In",
  REFERRAL: "Referral",
  ONLINE_ENQUIRY: "Online Enquiry",
  PARTNER: "Partner",
  BROCHURE: "Brochure",
  EVENT: "Event",
  SOCIAL_MEDIA: "Social Media",
  PHONE_CALL: "Phone Call",
  INTERNAL: "Internal",
  OTHER: "Other",
};

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  KYC_PENDING: "KYC Pending",
  READY_TO_CONVERT: "Ready to Convert",
  CONVERTED: "Converted",
  LOST: "Lost",
};

export const LEAD_STAGES: LeadStage[] = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "KYC_PENDING",
  "READY_TO_CONVERT",
  "CONVERTED",
  "LOST",
];

// Valid stage transitions (mirrors backend VALID_TRANSITIONS)
export const VALID_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["INTERESTED", "LOST"],
  INTERESTED: ["KYC_PENDING", "LOST"],
  KYC_PENDING: ["READY_TO_CONVERT", "LOST"],
  READY_TO_CONVERT: ["CONVERTED", "LOST"],
  CONVERTED: [],
  LOST: ["NEW"],
};

export type InternalLeadRow = {
  id: number;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  source: string;
  notes?: string;
  interested_product?: number | null;
  product_name?: string | null;
  interested_plan_type: LeadPlanType;
  stage: LeadStage;
  assigned_to?: number | null;
  assigned_to_username?: string | null;
  assigned_to_full_name?: string | null;
  next_follow_up_at?: string | null;
  converted_customer?: number | null;
  converted_customer_name?: string | null;
  public_lead_id?: number | null;
  created_at: string;
  updated_at?: string | null;
};

export type FollowUpTask = {
  id: number;
  lead: number;
  lead_name?: string | null;
  customer?: number | null;
  assigned_to?: number | null;
  assigned_to_username?: string | null;
  due_at: string;
  status: "OPEN" | "DONE" | "CANCELLED";
  call_note?: string;
  completed_at?: string | null;
  is_overdue: boolean;
  created_at: string;
};

export type Opportunity = {
  id: number;
  lead: number;
  customer?: number | null;
  title: string;
  estimated_value: string;
  stage: "OPEN" | "WON" | "LOST";
  expected_close_date?: string | null;
  owner?: number | null;
  owner_username?: string | null;
  notes?: string;
  created_at: string;
  updated_at?: string | null;
};

export type CustomerInteraction = {
  id: number;
  customer: number;
  lead?: number | null;
  interaction_type: string;
  note: string;
  happened_at: string;
  created_by?: number | null;
  created_by_username?: string | null;
  created_at: string;
};

export type StaffUser = {
  id: number;
  username: string;
  full_name: string;
  role: string;
};

export type InternalLeadDetail = {
  lead: InternalLeadRow;
  follow_up_tasks: FollowUpTask[];
  opportunities: Opportunity[];
  overdue_task_count: number;
  open_task_count: number;
};

export type PaginationMeta = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
};

export type InternalLeadListResponse = PaginationMeta & {
  stage_counts: Record<string, number>;
  results: InternalLeadRow[];
};

export type CrmFunnelResponse = {
  summary: {
    total_leads: number;
    converted: number;
    lost: number;
    active: number;
    overall_conversion_rate: number;
  };
  stages: Array<{
    stage: string;
    count: number;
    pct_of_total: number;
  }>;
  source_breakdown: Array<{
    source: string;
    total: number;
    converted: number;
    conversion_rate: number;
  }>;
  plan_type_breakdown: Array<{
    plan_type: string;
    count: number;
  }>;
};

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

// ── Lead CRUD ────────────────────────────────────────────────
export function getInternalCrmLeads(params: {
  q?: string;
  stage?: string;
  source?: string;
  assigned_to?: string;
  plan_type?: string;
  created_after?: string;
  created_before?: string;
  page?: number;
  page_size?: number;
} = {}) {
  return apiFetch<InternalLeadListResponse>(`/admin/crm/internal/leads/${buildQuery(params)}`);
}

export function createInternalLead(payload: {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  source?: string;
  notes?: string;
  interested_product?: number | null;
  interested_plan_type?: LeadPlanType;
  stage?: LeadStage;
  assigned_to?: number | null;
  next_follow_up_at?: string | null;
}) {
  return apiFetch<InternalLeadRow>("/admin/crm/internal/leads/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getInternalLeadDetail(id: number | string) {
  return apiFetch<InternalLeadDetail>(`/admin/crm/internal/leads/${id}/`);
}

export function updateInternalLead(
  id: number | string,
  payload: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    source?: string;
    notes?: string;
    interested_product?: number | null;
    interested_plan_type?: LeadPlanType;
    next_follow_up_at?: string | null;
  }
) {
  return apiFetch<InternalLeadRow>(`/admin/crm/internal/leads/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function moveLeadStage(id: number | string, stage: LeadStage) {
  return apiFetch<InternalLeadRow>(`/admin/crm/internal/leads/${id}/stage/`, {
    method: "POST",
    body: JSON.stringify({ stage }),
  });
}

export function assignLead(id: number | string, assigned_to: number | null) {
  return apiFetch<InternalLeadRow>(`/admin/crm/internal/leads/${id}/assign/`, {
    method: "POST",
    body: JSON.stringify({ assigned_to }),
  });
}

export function convertLead(
  id: number | string,
  payload: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
  } = {}
) {
  return apiFetch<{ lead: InternalLeadRow; customer_id: number }>(
    `/admin/crm/internal/leads/${id}/convert/`,
    { method: "POST", body: JSON.stringify({ create_customer: true, ...payload }) }
  );
}

// ── Follow-up tasks ──────────────────────────────────────────
export function getInternalCrmFollowUps(params: {
  status?: string;
  assigned_to?: string;
  page?: number;
  page_size?: number;
} = {}) {
  return apiFetch<PaginationMeta & { overdue_count: number; results: FollowUpTask[] }>(
    `/admin/crm/internal/follow-ups/${buildQuery(params)}`
  );
}

export function getLeadTasks(leadId: number | string) {
  return apiFetch<{ count: number; overdue_count: number; results: FollowUpTask[] }>(
    `/admin/crm/internal/leads/${leadId}/tasks/`
  );
}

export function createLeadTask(
  leadId: number | string,
  payload: {
    due_at: string;
    call_note?: string;
    assigned_to?: number | null;
    customer?: number | null;
  }
) {
  return apiFetch<FollowUpTask>(`/admin/crm/internal/leads/${leadId}/tasks/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function completeFollowUpTask(id: number | string, call_note?: string) {
  return apiFetch<FollowUpTask>(`/admin/crm/internal/follow-ups/${id}/complete/`, {
    method: "POST",
    body: JSON.stringify({ call_note: call_note ?? "" }),
  });
}

export function cancelFollowUpTask(id: number | string) {
  return apiFetch<FollowUpTask>(`/admin/crm/internal/follow-ups/${id}/cancel/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function updateFollowUpCallNote(id: number | string, call_note: string) {
  return apiFetch<FollowUpTask>(`/admin/crm/internal/follow-ups/${id}/call-note/`, {
    method: "POST",
    body: JSON.stringify({ call_note }),
  });
}

// ── Opportunities ────────────────────────────────────────────
export function getLeadOpportunities(leadId: number | string) {
  return apiFetch<{ count: number; results: Opportunity[] }>(
    `/admin/crm/internal/leads/${leadId}/opportunities/`
  );
}

export function createOpportunity(
  leadId: number | string,
  payload: {
    title: string;
    estimated_value?: string | number;
    expected_close_date?: string | null;
    owner?: number | null;
    notes?: string;
    customer?: number | null;
  }
) {
  return apiFetch<Opportunity>(`/admin/crm/internal/leads/${leadId}/opportunities/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOpportunityStage(
  id: number | string,
  stage: "OPEN" | "WON" | "LOST",
  notes?: string
) {
  return apiFetch<Opportunity>(`/admin/crm/internal/opportunities/${id}/stage/`, {
    method: "POST",
    body: JSON.stringify({ stage, notes }),
  });
}

// ── Customer interactions ─────────────────────────────────────
export function getCustomerInteractions(customerId: number | string) {
  return apiFetch<{ count: number; results: CustomerInteraction[] }>(
    `/admin/crm/internal/customers/${customerId}/interactions/`
  );
}

export function createCustomerInteraction(
  customerId: number | string,
  payload: {
    interaction_type?: string;
    note: string;
    happened_at?: string;
    lead?: number | null;
  }
) {
  return apiFetch<CustomerInteraction>(`/admin/crm/internal/customers/${customerId}/interactions/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Staff list for assignment dropdown ────────────────────────
export function getCrmStaffList() {
  return apiFetch<{ count: number; results: StaffUser[] }>("/admin/crm/internal/staff/");
}

// ── PublicLead promotion ──────────────────────────────────────
export function promotePublicLeadToCrm(
  publicLeadId: number | string,
  payload: { interested_plan_type?: string } = {}
) {
  return apiFetch<{ crm_lead: InternalLeadRow; public_lead_id: number }>(
    `/admin/crm/internal/public-leads/${publicLeadId}/promote/`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

// ── Customer CRM profile ─────────────────────────────────────
export function getInternalCustomerCrmProfile(customerId: number | string) {
  return apiFetch(`/admin/crm/internal/customers/${customerId}/profile/`);
}

// ── Funnel analytics ─────────────────────────────────────────
export function getCrmFunnel() {
  return apiFetch<CrmFunnelResponse>("/admin/crm/funnel/");
}
