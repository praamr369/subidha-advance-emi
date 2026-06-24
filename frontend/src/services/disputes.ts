import { apiFetch } from "@/lib/api";

export type DisputeStage = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED" | "ESCALATED";
export type DisputeType = "PAYMENT_DISPUTE" | "DELIVERY_DISPUTE" | "PRODUCT_DEFECT" | "BILLING_ERROR" | "KYC_ISSUE" | "OTHER";
export type DisputePriority = "LOW" | "MEDIUM" | "HIGH";

export interface CustomerDispute {
  id: number;
  dispute_ref: string;
  customer_id: number;
  customer_name: string;
  subscription_id: number | null;
  dispute_type: DisputeType;
  subject: string;
  description: string;
  stage: DisputeStage;
  priority: DisputePriority;
  assigned_to_id: number | null;
  resolution_notes: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisputeListResponse {
  count: number;
  results: CustomerDispute[];
}

export const DISPUTE_TYPES: { value: DisputeType; label: string }[] = [
  { value: "PAYMENT_DISPUTE", label: "Payment Dispute" },
  { value: "DELIVERY_DISPUTE", label: "Delivery Dispute" },
  { value: "PRODUCT_DEFECT", label: "Product Defect" },
  { value: "BILLING_ERROR", label: "Billing Error" },
  { value: "KYC_ISSUE", label: "KYC Issue" },
  { value: "OTHER", label: "Other" },
];

export const DISPUTE_STAGES: DisputeStage[] = ["OPEN", "UNDER_REVIEW", "RESOLVED", "REJECTED", "ESCALATED"];

export function listDisputes(params: { stage?: string; dispute_type?: string; customer_id?: string } = {}): Promise<DisputeListResponse> {
  const q = new URLSearchParams();
  if (params.stage) q.set("stage", params.stage);
  if (params.dispute_type) q.set("dispute_type", params.dispute_type);
  if (params.customer_id) q.set("customer_id", params.customer_id);
  return apiFetch(`/crm/disputes/?${q}`);
}

export function createDispute(payload: {
  customer_id: number;
  subscription_id?: number | null;
  dispute_type: DisputeType;
  subject: string;
  description: string;
  priority?: DisputePriority;
}): Promise<CustomerDispute> {
  return apiFetch("/crm/disputes/", { method: "POST", body: JSON.stringify(payload) });
}

export function getDispute(id: number): Promise<CustomerDispute> {
  return apiFetch(`/crm/disputes/${id}/`);
}

export function updateDispute(id: number, payload: Partial<{
  stage: DisputeStage;
  resolution_notes: string;
  assigned_to_id: number | null;
  priority: DisputePriority;
}>): Promise<CustomerDispute> {
  return apiFetch(`/crm/disputes/${id}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function notifyCustomerDispute(id: number, message: string): Promise<{ message: string; email: string; dispute_ref: string }> {
  return apiFetch(`/crm/disputes/${id}/notify/`, { method: "POST", body: JSON.stringify({ message }) });
}
