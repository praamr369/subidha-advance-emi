import { toArray } from "@/lib/api";
import { apiClient } from "@/services/api/client";
import { request } from "@/services/api";
import {
  listCustomers as listCustomerPage,
  searchCustomers as searchCustomerRecords,
  type CustomerRecord,
} from "@/services/customers";
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

export type CustomerListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Customer[];
};

function toCustomer(row: CustomerRecord): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    kyc_status: row.kyc_status,
    status: row.status,
    created_at: row.created_at ?? null,
  };
}

export async function listCustomers(): Promise<CustomerListResponse> {
  const page = await listCustomerPage();
  return {
    count: page.count,
    next: page.next,
    previous: page.previous,
    results: page.results.map(toCustomer),
  };
}

export async function listCustomerRows(): Promise<Customer[]> {
  const page = await listCustomers();
  return page.results;
}

export async function searchCustomers(query: string): Promise<Customer[]> {
  const rows = await searchCustomerRecords(query);
  return rows.map(toCustomer);
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

/**
 * Legacy raw fetch kept for rare callers that need the unnormalized endpoint payload.
 * Normal customer screens should use listCustomers() or listCustomerRows().
 */
export async function listCustomersRaw(): Promise<Customer[]> {
  const payload = await apiClient<unknown>("/admin/customers/");
  return toArray<Customer>(payload);
}
