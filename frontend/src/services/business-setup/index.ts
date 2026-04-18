import { ApiError, apiFetch } from "@/lib/api";

export type BusinessProfile = {
  id?: number;
  legal_name: string;
  trade_name?: string;
  business_code?: string;
  primary_email?: string;
  primary_phone?: string;
  alternate_phone?: string;
  website_url?: string;
  address_line_1?: string;
  address_line_2?: string;
  landmark?: string;
  city?: string;
  district?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  gstin?: string;
  pan_number?: string;
  invoice_prefix?: string;
  receipt_prefix?: string;
  default_currency_code?: string;
  timezone_name?: string;
  logo_url?: string;
  is_active?: boolean;
};

export type SetupChecklistItem = {
  key: string;
  label: string;
  level?: "required" | "recommended" | "optional" | string;
  status: string;
  detail: string;
  route?: string;
};

export type SetupChecklist = {
  is_ready_for_go_live: boolean;
  percent_complete: number;
  items: SetupChecklistItem[];
  counts?: Record<string, unknown>;
};

export async function getBusinessProfile(): Promise<BusinessProfile | null> {
  try {
    return await apiFetch<BusinessProfile>("/admin/business-profile/");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function saveBusinessProfile(payload: Partial<BusinessProfile>): Promise<BusinessProfile> {
  return apiFetch<BusinessProfile>("/admin/business-profile/", {
    method: "PATCH",
    body: payload,
  });
}

export async function getSetupChecklist(): Promise<SetupChecklist> {
  return apiFetch<SetupChecklist>("/admin/business-setup/checklist/");
}

export async function getResetPreview(preserveUsername?: string): Promise<Record<string, unknown>> {
  const query = preserveUsername ? `?preserve_username=${encodeURIComponent(preserveUsername)}` : "";
  return apiFetch<Record<string, unknown>>(`/admin/business-setup/reset-preview/${query}`);
}

export type BusinessResetExecuteRequest = {
  confirm: string;
  preserve_username: string;
  delete_non_preserved_users?: boolean;
  clear_auth_artifacts?: boolean;
  dry_run?: boolean;
};

export async function executeBusinessReset(payload: BusinessResetExecuteRequest): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/admin/business-setup/reset/", {
    method: "POST",
    body: payload,
  });
}
