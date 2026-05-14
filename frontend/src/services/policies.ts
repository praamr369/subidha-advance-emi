import { apiFetch } from "@/lib/api";

export type PolicyStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type AdminPolicyPage = {
  id: number;
  slug: string;
  version: number;
  category: string;
  title: string;
  summary: string;
  content: string;
  status: PolicyStatus;
  effective_date?: string | null;
  last_reviewed_at?: string | null;
  published_at?: string | null;
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
  Pick<
    AdminPolicyPage,
    "slug" | "category" | "title" | "summary" | "content" | "status" | "effective_date" | "last_reviewed_at"
  >
>;

export type ComplianceDocument = {
  id: number;
  document_type: string;
  title: string;
  file?: string | null;
  public_visibility: "PRIVATE" | "PUBLIC_SUMMARY_ONLY";
  verification_status: "PENDING" | "VERIFIED" | "REJECTED" | "NOT_PROVIDED";
  public_summary: string;
  notes: string;
  uploaded_by_username?: string;
  reviewed_by_username?: string;
  verified_at?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ComplianceDocumentListResponse = {
  count: number;
  results: ComplianceDocument[];
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
  }>;
  private_document_disclaimer: string;
};

export async function listAdminPolicies(params?: {
  slug?: string;
  status?: string;
  category?: string;
}): Promise<AdminPolicyPageListResponse> {
  const query = new URLSearchParams();
  if (params?.slug) query.set("slug", params.slug);
  if (params?.status) query.set("status", params.status);
  if (params?.category) query.set("category", params.category);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<AdminPolicyPageListResponse>(`/admin/public-site/policies/${suffix}`);
}

export async function getAdminPolicyBySlug(slug: string): Promise<AdminPolicyPage | null> {
  const payload = await apiFetch<{ policy: AdminPolicyPage | null }>(
    `/admin/public-site/policies/by-slug/${slug}/`
  );
  return payload.policy;
}

export async function createAdminPolicy(payload: PolicyCreatePayload): Promise<AdminPolicyPage> {
  return apiFetch<AdminPolicyPage>("/admin/public-site/policies/", {
    method: "POST",
    body: payload,
  });
}

export async function updateAdminPolicy(id: number, payload: PolicyUpdatePayload): Promise<AdminPolicyPage> {
  return apiFetch<AdminPolicyPage>(`/admin/public-site/policies/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export async function publishAdminPolicy(id: number, payload?: { effective_date?: string; review_now?: boolean }): Promise<AdminPolicyPage> {
  return apiFetch<AdminPolicyPage>(`/admin/public-site/policies/${id}/publish/`, {
    method: "POST",
    body: payload || {},
  });
}

export async function archiveAdminPolicy(id: number): Promise<AdminPolicyPage> {
  return apiFetch<AdminPolicyPage>(`/admin/public-site/policies/${id}/archive/`, {
    method: "POST",
    body: {},
  });
}

export async function createAdminPolicyDraft(id: number): Promise<AdminPolicyPage> {
  return apiFetch<AdminPolicyPage>(`/admin/public-site/policies/${id}/create-draft/`, {
    method: "POST",
    body: {},
  });
}

export async function seedDefaultPolicies(payload?: {
  overwrite_existing_drafts?: boolean;
}): Promise<{ created: number; updated: number; skipped: number }> {
  return apiFetch<{ created: number; updated: number; skipped: number }>(
    "/admin/public-site/policies/seed-defaults/",
    {
      method: "POST",
      body: payload || {},
    }
  );
}

export async function listComplianceDocuments(): Promise<ComplianceDocumentListResponse> {
  return apiFetch<ComplianceDocumentListResponse>("/admin/public-site/business-compliance/documents/");
}

export async function createComplianceDocument(payload: Partial<ComplianceDocument>): Promise<ComplianceDocument> {
  return apiFetch<ComplianceDocument>("/admin/public-site/business-compliance/documents/", {
    method: "POST",
    body: payload,
  });
}

export async function updateComplianceDocument(id: number, payload: Partial<ComplianceDocument>): Promise<ComplianceDocument> {
  return apiFetch<ComplianceDocument>(`/admin/public-site/business-compliance/documents/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export async function getAdminComplianceSummary(): Promise<ComplianceSummary> {
  return apiFetch<ComplianceSummary>("/admin/public-site/business-compliance/summary/");
}
