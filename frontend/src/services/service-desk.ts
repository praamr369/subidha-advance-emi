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

type PaginatedResponse<T> = {
  count: number;
  results: T[];
};

export type ServiceDeskCaseType =
  | "COMPLAINT"
  | "SALES_RETURN"
  | "DELIVERY_RETURN"
  | "EXCHANGE"
  | "SERVICE";

export type ServiceDeskCaseStatus =
  | "DRAFT"
  | "OPEN"
  | "UNDER_REVIEW"
  | "AUTHORIZED"
  | "IN_SERVICE"
  | "RESOLVED"
  | "CLOSED"
  | "REJECTED"
  | "CANCELLED";

export type ServiceDeskLine = {
  id?: number;
  product?: number | null;
  product_code?: string | null;
  inventory_item?: number | null;
  inventory_item_sku?: string | null;
  description: string;
  quantity: string;
  disposition: string;
  taxable_amount: string;
  tax_amount: string;
  line_total?: string;
  notes?: string;
};

export type ServiceDeskCase = {
  id: number;
  case_no: string;
  case_type: ServiceDeskCaseType;
  status: ServiceDeskCaseStatus;
  priority: string;
  branch_id?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  party?: number | null;
  party_no?: string | null;
  party_display_name?: string | null;
  support_request?: number | null;
  support_request_status?: string | null;
  direct_sale?: number | null;
  direct_sale_no?: string | null;
  subscription?: number | null;
  delivery?: number | null;
  delivery_reference?: string | null;
  billing_invoice?: number | null;
  billing_invoice_no?: string | null;
  credit_note?: number | null;
  credit_note_no?: string | null;
  debit_note?: number | null;
  debit_note_no?: string | null;
  replacement_direct_sale?: number | null;
  replacement_direct_sale_no?: string | null;
  product?: number | null;
  inventory_item?: number | null;
  warranty_status: string;
  finance_status: string;
  stock_status: string;
  credit_note_required: boolean;
  debit_note_required: boolean;
  stock_resolution_required: boolean;
  issue_summary: string;
  issue_details?: string;
  reporter_name_snapshot?: string;
  reporter_phone_snapshot?: string;
  taxable_total: string;
  tax_total: string;
  total_amount: string;
  internal_notes?: string;
  resolution_summary?: string;
  service_due_at?: string | null;
  authorized_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  assigned_to?: number | null;
  assigned_to_username?: string | null;
  authorized_by?: number | null;
  authorized_by_username?: string | null;
  resolved_by?: number | null;
  resolved_by_username?: string | null;
  closed_by?: number | null;
  closed_by_username?: string | null;
  lines: ServiceDeskLine[];
  created_at?: string;
  updated_at?: string;
};

export type ServiceDeskComplaint = {
  id: number;
  branch_id?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  customer?: number | null;
  customer_name?: string;
  customer_phone?: string;
  payment?: number | null;
  payment_reference_no?: string | null;
  payment_amount?: string | null;
  payment_method?: string | null;
  payment_date?: string | null;
  subscription?: number | null;
  subscription_number?: string | null;
  category: string;
  message: string;
  status: string;
  assigned_to_id?: number | null;
  assigned_to_full_name?: string | null;
  internal_notes?: string;
  created_at?: string;
  resolved_at?: string | null;
  linked_service_case_id?: number | null;
  linked_service_case_no?: string | null;
  linked_service_case_type?: string | null;
  linked_service_case_status?: string | null;
  linked_service_case_count?: number;
};

export type ServiceDeskOverview = {
  summary: {
    case_count: number;
    open_count: number;
    returns_count: number;
    service_count: number;
    complaint_case_count: number;
    finance_pending_count: number;
    stock_pending_count: number;
    support_request_count: number;
    open_support_request_count: number;
  };
  recent_cases: ServiceDeskCase[];
  recent_complaints: ServiceDeskComplaint[];
};

export type ServiceDeskComplaintListResponse = {
  count: number;
  summary: {
    total: number;
    submitted: number;
    under_review: number;
    closed: number;
    linked_case_count: number;
  };
  results: ServiceDeskComplaint[];
};

export type ServiceDeskCasePayload = {
  case_type: ServiceDeskCaseType;
  priority?: string;
  party?: number | null;
  support_request?: number | null;
  direct_sale?: number | null;
  subscription?: number | null;
  delivery?: number | null;
  billing_invoice?: number | null;
  product?: number | null;
  inventory_item?: number | null;
  warranty_status?: string;
  credit_note_required?: boolean;
  debit_note_required?: boolean;
  stock_resolution_required?: boolean;
  issue_summary: string;
  issue_details?: string;
  reporter_name_snapshot?: string;
  reporter_phone_snapshot?: string;
  internal_notes?: string;
  service_due_at?: string | null;
  assigned_to?: number | null;
  lines?: ServiceDeskLine[];
};

export function getServiceDeskOverview() {
  return apiFetch<ServiceDeskOverview>("/service-desk/overview/");
}

export function listServiceDeskCases(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<ServiceDeskCase>>(
    `/service-desk/cases/${buildQuery(params)}`
  );
}

export function getServiceDeskCase(id: number | string) {
  return apiFetch<ServiceDeskCase>(`/service-desk/cases/${id}/`);
}

export function createServiceDeskCase(payload: ServiceDeskCasePayload) {
  return apiFetch<ServiceDeskCase>("/service-desk/cases/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateServiceDeskCase(id: number | string, payload: Partial<ServiceDeskCasePayload>) {
  return apiFetch<ServiceDeskCase>(`/service-desk/cases/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateServiceDeskCaseStatus(
  id: number | string,
  payload: { status: ServiceDeskCaseStatus; resolution_summary?: string }
) {
  return apiFetch<{ updated: boolean; service_case: ServiceDeskCase }>(
    `/service-desk/cases/${id}/status/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function requestServiceDeskDeliveryReturn(id: number | string, notes = "") {
  return apiFetch<{ updated: boolean; service_case: ServiceDeskCase }>(
    `/service-desk/cases/${id}/request-delivery-return/`,
    {
      method: "POST",
      body: JSON.stringify({ notes }),
    }
  );
}

export function completeServiceDeskDeliveryReturn(id: number | string, notes = "") {
  return apiFetch<{ updated: boolean; service_case: ServiceDeskCase }>(
    `/service-desk/cases/${id}/complete-delivery-return/`,
    {
      method: "POST",
      body: JSON.stringify({ notes }),
    }
  );
}

export function postServiceDeskCreditNote(id: number | string) {
  return apiFetch<{ service_case: ServiceDeskCase; credit_note_id: number }>(
    `/service-desk/cases/${id}/post-credit-note/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postServiceDeskDebitNote(id: number | string) {
  return apiFetch<{ service_case: ServiceDeskCase; debit_note_id: number }>(
    `/service-desk/cases/${id}/post-debit-note/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function linkServiceDeskReplacementSale(id: number | string, replacementDirectSale: number) {
  return apiFetch<{ updated: boolean; service_case: ServiceDeskCase }>(
    `/service-desk/cases/${id}/link-replacement-sale/`,
    {
      method: "POST",
      body: JSON.stringify({ replacement_direct_sale: replacementDirectSale }),
    }
  );
}

export function listServiceDeskComplaints(params: Record<string, QueryValue> = {}) {
  return apiFetch<ServiceDeskComplaintListResponse>(
    `/service-desk/complaints/${buildQuery(params)}`
  );
}
