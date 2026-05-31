import { apiFetch } from "@/lib/api";

export type PolicyStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED";
export type PolicyVisibility = "PUBLIC" | "INTERNAL";
export type ComplianceRequiredLevel = "REQUIRED" | "RECOMMENDED" | "OPTIONAL";
export type CompliancePublicExposure = "PRIVATE_ONLY" | "SUMMARY_ONLY" | "PUBLIC_AFTER_APPROVAL";
export type ComplianceDocumentType =
  | "RENTAL_AGREEMENT"
  | "OWNERSHIP_PROOF"
  | "UDYAM_CERTIFICATE"
  | "GST_CERTIFICATE"
  | "SHOP_LICENSE"
  | "BANK_PROOF"
  | "PAN_OR_TAX_PROOF"
  | "OTHER";
export type ComplianceVisibility = "PRIVATE" | "PUBLIC_SUMMARY_ONLY";
export type ComplianceVerificationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "NOT_PROVIDED";
export type ComplianceDisplayStatus = "PENDING" | "APPROVED" | "REJECTED" | "NOT_PROVIDED" | "EXPIRED";

export type AdminPolicyPage = {
  id: number;
  slug: string;
  version: number;
  category: string;
  governance_category?: string;
  coverage_group?: string;
  visibility?: PolicyVisibility;
  public_visible?: boolean;
  internal_only?: boolean;
  public_ready?: boolean;
  internal_ready?: boolean;
  requires_legal_review?: boolean;
  review_due_date?: string | null;
  title: string;
  summary: string;
  content: string;
  status: PolicyStatus;
  effective_date?: string | null;
  last_reviewed_at?: string | null;
  published_at?: string | null;
  last_published_at?: string | null;
  published_by_username?: string;
  created_by_username?: string;
  updated_by_username?: string;
  created_at?: string;
  updated_at?: string;
};

export type AdminPolicyPageListResponse = {
  count: number;
  results: AdminPolicyPage[];
};

export type PolicyCreatePayload = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  content: string;
  status?: "DRAFT" | "ARCHIVED";
};

export type PolicyUpdatePayload = Partial<
  Pick<AdminPolicyPage, "slug" | "category" | "title" | "summary" | "content" | "status" | "effective_date" | "last_reviewed_at">
>;

export type PolicyCoverageRow = {
  required_policy_key: string;
  label: string;
  coverage_group: string;
  category: string;
  stored_category?: string;
  visibility: PolicyVisibility;
  status: PolicyStatus | "MISSING";
  policy_id?: number | null;
  slug: string;
  public_ready: boolean;
  internal_ready: boolean;
  blocker_reason?: string;
  recommended_action?: string;
  requires_legal_review?: boolean;
  requires_admin_acceptance?: boolean;
};

export type PolicyCoverageGroup = { group: string; items: PolicyCoverageRow[] };
export type PolicyCoverageMatrix = {
  summary: {
    required_count: number;
    missing_count: number;
    public_required_count: number;
    public_published_count: number;
    public_draft_count: number;
    internal_required_count: number;
    internal_ready_count: number;
    internal_draft_count: number;
  };
  groups: PolicyCoverageGroup[];
  results: PolicyCoverageRow[];
};

export type ComplianceDocument = {
  id: number;
  document_type: ComplianceDocumentType;
  title: string;
  file?: string | null;
  public_visibility: ComplianceVisibility;
  visibility?: ComplianceVisibility;
  verification_status: ComplianceVerificationStatus;
  status?: ComplianceDisplayStatus;
  public_summary: string;
  notes: string;
  internal_notes?: string;
  uploaded_by_username?: string;
  reviewed_by_username?: string;
  verified_at?: string | null;
  reviewed_at?: string | null;
  expires_at?: string | null;
  is_publicly_downloadable?: boolean;
  has_file?: boolean;
  public_summary_ready?: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ComplianceDocumentListResponse = { count: number; results: ComplianceDocument[] };

export type ComplianceTemplate = {
  key: string;
  label: string;
  document_type: ComplianceDocumentType;
  required_level: ComplianceRequiredLevel;
  visibility_default: ComplianceVisibility;
  allowed_public_exposure: CompliancePublicExposure;
  description: string;
  recommended_action: string;
  readiness_impact: string;
};

export type ComplianceTemplateListResponse = { count: number; results: ComplianceTemplate[] };

export type ComplianceReadiness = {
  status: "READY" | "NEEDS_SETUP" | "BLOCKED";
  blockers: string[];
  warnings: string[];
  route_hint: string;
  missing_required_count: number;
  pending_review_count: number;
  approved_required_count: number;
  required_count: number;
  recommended_missing_count: number;
  required_checks: Array<{ key: string; label: string; ready: boolean }>;
  recommended_checks: Array<{ key: string; label: string; ready: boolean }>;
  templates: ComplianceTemplate[];
  privacy_rule: string;
};

export type ComplianceSummary = {
  business_name: string;
  business_location: string;
  website_url: string;
  business_phone: string;
  business_email: string;
  business_address: string;
  gst_status_text: string;
  udyam_status_text: string;
  public_documents: Array<{
    document_type: string;
    title: string;
    verification_status: string;
    public_summary: string;
    verified_at?: string | null;
    is_publicly_downloadable?: boolean;
  }>;
  private_document_disclaimer: string;
};

export async function listAdminPolicies(params?: { slug?: string; status?: string; category?: string }): Promise<AdminPolicyPageListResponse> {
  const query = new URLSearchParams();
  if (params?.slug) query.set("slug", params.slug);
  if (params?.status) query.set("status", params.status);
  if (params?.category) query.set("category", params.category);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<AdminPolicyPageListResponse>(`/admin/public-site/policies/${suffix}`);
}

export async function getAdminPolicyCoverage(): Promise<PolicyCoverageMatrix> {
  return apiFetch<PolicyCoverageMatrix>("/admin/settings/policies/coverage/");
}

export async function getAdminPolicyBySlug(slug: string): Promise<AdminPolicyPage | null> {
  const payload = await apiFetch<{ policy: AdminPolicyPage | null }>(`/admin/public-site/policies/by-slug/${slug}/`);
  return payload.policy;
}

export async function createAdminPolicy(payload: PolicyCreatePayload): Promise<AdminPolicyPage> {
  return apiFetch<AdminPolicyPage>("/admin/public-site/policies/", { method: "POST", body: payload });
}

export async function updateAdminPolicy(id: number, payload: PolicyUpdatePayload): Promise<AdminPolicyPage> {
  return apiFetch<AdminPolicyPage>(`/admin/public-site/policies/${id}/`, { method: "PATCH", body: payload });
}

export async function publishAdminPolicy(id: number, payload?: { effective_date?: string; review_now?: boolean }): Promise<AdminPolicyPage> {
  return apiFetch<AdminPolicyPage>(`/admin/public-site/policies/${id}/publish/`, { method: "POST", body: payload || {} });
}

export async function archiveAdminPolicy(id: number): Promise<AdminPolicyPage> {
  return apiFetch<AdminPolicyPage>(`/admin/public-site/policies/${id}/archive/`, { method: "POST", body: {} });
}

export async function createAdminPolicyDraft(id: number): Promise<AdminPolicyPage> {
  return apiFetch<AdminPolicyPage>(`/admin/public-site/policies/${id}/create-draft/`, { method: "POST", body: {} });
}

export async function seedDefaultPolicies(payload?: { overwrite_existing_drafts?: boolean }): Promise<{ created: number; updated: number; skipped: number }> {
  return apiFetch<{ created: number; updated: number; skipped: number }>("/admin/public-site/policies/seed-defaults/", {
    method: "POST",
    body: payload || {},
  });
}

export async function listComplianceDocuments(): Promise<ComplianceDocumentListResponse> {
  return apiFetch<ComplianceDocumentListResponse>("/admin/public-site/business-compliance/documents/");
}

export async function listComplianceTemplates(): Promise<ComplianceTemplateListResponse> {
  return apiFetch<ComplianceTemplateListResponse>("/admin/settings/business-compliance/templates/");
}

export async function getBusinessComplianceReadiness(): Promise<ComplianceReadiness> {
  return apiFetch<ComplianceReadiness>("/admin/settings/business-compliance/readiness/");
}

export async function seedBusinessComplianceRows(): Promise<{
  created_count: number;
  skipped_count: number;
  created: Array<{ key: string; document_id: number }>;
  skipped: Array<{ key: string; document_id?: number; reason: string }>;
}> {
  return apiFetch("/admin/settings/business-compliance/seed-rows/", { method: "POST", body: {} });
}

export async function createComplianceDocument(payload: Partial<ComplianceDocument>): Promise<ComplianceDocument> {
  return apiFetch<ComplianceDocument>("/admin/public-site/business-compliance/documents/", { method: "POST", body: payload });
}

export async function updateComplianceDocument(id: number, payload: Partial<ComplianceDocument>): Promise<ComplianceDocument> {
  return apiFetch<ComplianceDocument>(`/admin/public-site/business-compliance/documents/${id}/`, { method: "PATCH", body: payload });
}

export async function getAdminComplianceSummary(): Promise<ComplianceSummary> {
  return apiFetch<ComplianceSummary>("/admin/public-site/business-compliance/summary/");
}
