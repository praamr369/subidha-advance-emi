import { apiFetch } from "@/lib/api";

// ─── Plan Templates ────────────────────────────────────────────────────────

export type PlanTemplate = {
  id: number;
  template_code: string;
  name: string;
  description: string;
  plan_type: "EMI" | "RENT" | "LEASE";
  tenure_months: number | null;
  default_down_payment_percent: string | null;
  default_security_deposit_percent: string | null;
  default_grace_days: number | null;
  is_lucky_plan_eligible: boolean;
  requires_batch: boolean;
  requires_lucky_id: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
};

export type PlanTemplateListResponse = {
  results: PlanTemplate[];
};

export function listPlanTemplates(params: { plan_type?: string; is_active?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (params.plan_type) qs.set("plan_type", params.plan_type);
  if (params.is_active != null) qs.set("is_active", String(params.is_active));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<PlanTemplateListResponse>(`/admin/growth/plan-templates/${query}`);
}

export function getPlanTemplate(id: number) {
  return apiFetch<PlanTemplate>(`/admin/growth/plan-templates/${id}/`);
}

export function createPlanTemplate(data: Partial<PlanTemplate>) {
  return apiFetch<PlanTemplate>("/admin/growth/plan-templates/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updatePlanTemplate(id: number, data: Partial<PlanTemplate>) {
  return apiFetch<PlanTemplate>(`/admin/growth/plan-templates/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Offer Packages ────────────────────────────────────────────────────────

export type OfferPackageLine = {
  id: number;
  product_id: number;
  product_name: string | null;
  quantity: number;
  price_override: string | null;
  discount_type: "NONE" | "FLAT" | "PERCENT";
  discount_value: string;
  metadata: Record<string, unknown>;
};

export type OfferPackage = {
  id: number;
  package_code: string;
  name: string;
  description: string;
  plan_template_id: number;
  plan_template_code: string | null;
  plan_type: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "EXPIRED" | "ARCHIVED";
  audience_type: "ALL" | "NEW_CUSTOMER" | "EXISTING_CUSTOMER" | "PARTNER_REFERRED" | "HIGH_TRUST_CUSTOMER";
  max_contract_value: string | null;
  min_contract_value: string | null;
  display_priority: number;
  is_public_visible: boolean;
  requires_approval: boolean;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  lines: OfferPackageLine[];
};

export type OfferPackageListResponse = {
  results: OfferPackage[];
};

export type OfferPackagePreview = OfferPackage & {
  plan_template: PlanTemplate;
  eligibility?: {
    eligible: boolean;
    not_recommended: boolean;
    approval_required: boolean;
    warnings: string[];
    reasons: string[];
  };
  configuration_validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
};

export function listOfferPackages(params: { status?: string; plan_type?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.plan_type) qs.set("plan_type", params.plan_type);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<OfferPackageListResponse>(`/admin/growth/offer-packages/${query}`);
}

export function getOfferPackage(id: number) {
  return apiFetch<OfferPackage>(`/admin/growth/offer-packages/${id}/`);
}

export function createOfferPackage(data: Partial<OfferPackage> & { plan_template_id: number }) {
  return apiFetch<OfferPackage>("/admin/growth/offer-packages/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateOfferPackage(id: number, data: Partial<OfferPackage>) {
  return apiFetch<OfferPackage>(`/admin/growth/offer-packages/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function getOfferPackagePreview(id: number, customerId?: number) {
  const qs = customerId ? `?customer_id=${customerId}` : "";
  return apiFetch<OfferPackagePreview>(`/admin/growth/offer-packages/${id}/preview/${qs}`);
}

// ─── Growth Requests ───────────────────────────────────────────────────────

export type GrowthRequest = {
  id: number;
  request_number: string;
  customer_id: number;
  source_subscription_id: number | null;
  request_type: string;
  status: string;
  priority: string;
  desired_plan_template_id: number | null;
  desired_offer_package_id: number | null;
  requested_product_id: number | null;
  current_product_id: number | null;
  expected_value: string | null;
  reason: string;
  notes: string;
  risk_snapshot: Record<string, unknown>;
  approval_required: boolean;
  approved_by_id: number | null;
  decided_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GrowthRequestListResponse = {
  results: GrowthRequest[];
};

export function listGrowthRequests(params: { status?: string; request_type?: string; customer_id?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.request_type) qs.set("request_type", params.request_type);
  if (params.customer_id != null) qs.set("customer_id", String(params.customer_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<GrowthRequestListResponse>(`/admin/growth/requests/${query}`);
}

export function getGrowthRequest(id: number) {
  return apiFetch<GrowthRequest>(`/admin/growth/requests/${id}/`);
}

export function createGrowthRequest(data: {
  customer_id: number;
  request_type: string;
  reason?: string;
  notes?: string;
  priority?: string;
  expected_value?: string;
  source_subscription_id?: number;
  desired_plan_template_id?: number;
  desired_offer_package_id?: number;
}) {
  return apiFetch<GrowthRequest>("/admin/growth/requests/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function submitGrowthRequest(id: number) {
  return apiFetch<GrowthRequest>(`/admin/growth/requests/${id}/submit/`, { method: "POST" });
}

export function approveGrowthRequest(id: number, reason?: string) {
  return apiFetch<GrowthRequest>(`/admin/growth/requests/${id}/approve/`, {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? "" }),
  });
}

export function rejectGrowthRequest(id: number, reason: string) {
  return apiFetch<GrowthRequest>(`/admin/growth/requests/${id}/reject/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function getGrowthRequestPreview(id: number) {
  return apiFetch<Record<string, unknown>>(`/admin/growth/requests/${id}/preview/`);
}
