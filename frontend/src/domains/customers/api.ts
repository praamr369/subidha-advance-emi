import { toArray } from "@/lib/api";
import { apiClient } from "@/services/api/client";
import { request } from "@/services/api";
import type { Customer } from "@/domains/customers/types";

export type CustomerImportPreviewRow = {
  row_number: number;
  name: string;
  phone: string;
  email: string;
  valid: boolean;
};

export type CustomerImportPreviewError = {
  row_number: number | null;
  phone?: string;
  email?: string;
  errors: string[];
};

export type CustomerImportPreviewResponse = {
  columns: string[];
  preview_rows: CustomerImportPreviewRow[];
  errors: CustomerImportPreviewError[];
  valid_count: number;
  invalid_count: number;
};

export type CustomerImportCommitRow = {
  row_number: number;
  name: string;
  phone: string;
  email?: string;
  valid?: boolean;
  errors?: string[];
  created_customer_id?: number | null;
  created_user_id?: number | null;
  generated_username?: string;
};

export type CustomerImportCommitResponse = {
  created: number;
  skipped: number;
  row_count: number;
  rows: CustomerImportCommitRow[];
};

export type OtpDeliveryReadinessItem = {
  status: string;
  detail: string;
};

export type OtpDeliveryEmailReadiness = OtpDeliveryReadinessItem & {
  fallback_enabled: boolean;
  backend: string;
  from_email_configured: boolean;
};

export type OtpDeliveryAdminVisibility = {
  status: string;
  detail: string;
  list_endpoint: string;
};

export type OtpDeliveryReadinessResponse = {
  overall_status: string;
  summary: string;
  delivery_backend: string;
  public_reset_roles: string[];
  public_reset_identifiers: string[];
  sms: OtpDeliveryReadinessItem;
  email: OtpDeliveryEmailReadiness;
  console: OtpDeliveryReadinessItem;
  admin_visibility: OtpDeliveryAdminVisibility;
};

export async function listCustomers(): Promise<Customer[]> {
  const payload = await apiClient<unknown>("/admin/customers/");
  return toArray<Customer>(payload);
}

export async function searchCustomers(query: string): Promise<Customer[]> {
  const payload = await apiClient<unknown>(`/admin/customers/search/?q=${encodeURIComponent(query)}`);
  return toArray<Customer>(payload);
}

export async function previewCustomerImport(file: File): Promise<CustomerImportPreviewResponse> {
  const form = new FormData();
  form.append("file", file);
  return request<CustomerImportPreviewResponse>("/admin/customers/import/preview/", {
    method: "POST",
    body: form,
    retryCount: 0,
  });
}

export async function importCustomers(
  file: File
): Promise<CustomerImportCommitResponse> {
  const form = new FormData();
  form.append("file", file);
  return request<CustomerImportCommitResponse>("/admin/customers/import-csv/", {
    method: "POST",
    body: form,
    retryCount: 0,
  });
}

export async function getOtpDeliveryReadiness(): Promise<OtpDeliveryReadinessResponse> {
  return request<OtpDeliveryReadinessResponse>("/admin/system/otp-delivery-readiness/");
}

export type CustomerKycDecisionStatus = "VERIFIED" | "REJECTED";

export type CustomerKycDecisionResponse = {
  id: number;
  kyc_status: CustomerKycDecisionStatus | "PENDING" | "NOT_PROVIDED";
  kyc_reviewed_by_username?: string;
  kyc_reviewed_at?: string;
  kyc_rejection_reason?: string;
};

export async function submitCustomerKycDecision(
  customerId: number | string,
  payload: {
    status: CustomerKycDecisionStatus;
    reason?: string;
  }
): Promise<CustomerKycDecisionResponse> {
  return request<CustomerKycDecisionResponse>(
    `/admin/customers/${customerId}/kyc-decision/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}
