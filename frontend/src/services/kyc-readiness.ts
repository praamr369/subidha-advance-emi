import { apiFetch } from "@/lib/api";

/**
 * Contract KYC / document readiness service.
 *
 * Additive client for the backend `/admin/customers/<id>/contract-readiness/`
 * endpoint. Direct sale is reported as `is_direct_sale` with KYC optional; EMI /
 * Rent / Lease report can_activate / can_deliver and the document checklist.
 *
 * P3A: Also provides `fetchDocumentReadiness` for the per-subscription vault
 * checklist at `/admin/subscriptions/<id>/document-readiness/`.
 */
export type KycDocumentStatus = "VERIFIED" | "PENDING" | "MISSING" | string;

/** P3A Document Vault — per-item status (superset of KycDocumentStatus). */
export type VaultDocumentStatus =
  | "MISSING"
  | "PRESENT"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED"
  | "NOT_REQUIRED"
  | string;

export type VaultDocumentItem = {
  document_key: string;
  label: string;
  required: boolean;
  status: VaultDocumentStatus;
  blocker_code: string | null;
  document_id: number | null;
  expires_on: string | null;
  signed_status: "UNSIGNED" | "SIGNED" | "NOT_REQUIRED" | "UNKNOWN" | string;
  access_level: "INTERNAL" | "SENSITIVE" | "HIGHLY_SENSITIVE" | string;
};

export type DocumentReadiness = {
  subscription_id: number;
  plan_type: string;
  is_direct_sale: boolean;
  required_documents: VaultDocumentItem[];
  overall: {
    ready: boolean;
    blocker_codes: string[];
  };
};

export type KycRequiredDocument = {
  code: string;
  label: string;
  required: boolean;
  present: boolean;
  status: KycDocumentStatus;
  source: string;
  /** Present on contract-KYC rows; absent on activation-milestone rows. */
  stage?: string;
};

/**
 * Activation / handover milestone readiness (additive, P0).
 *
 * Surfaced only when the readiness endpoint is queried with a concrete
 * `subscription`. Reports the extra evidence required before the asset leaves
 * the shop: a collected security-deposit receipt (rent/lease) and an asset
 * condition proof (lease). Computation only — never enforced by this endpoint.
 */
export type ContractActivationMilestone = {
  plan_type: string;
  is_direct_sale: boolean;
  kyc_gating_enabled: boolean;
  enforced: boolean;
  kyc_verified: boolean;
  can_reach_active_or_handover: boolean;
  required_documents: KycRequiredDocument[];
  missing_documents: string[];
  present_documents: string[];
  blocker_codes: string[];
  blocker_messages: string[];
};

export type ContractKycReadiness = {
  plan_type: string;
  is_direct_sale: boolean;
  kyc_gating_enabled: boolean;
  enforced: boolean;
  kyc_status: string;
  kyc_verified: boolean;
  kyc_optional?: boolean;
  exception_approved: boolean;
  can_activate: boolean;
  can_generate_final_contract: boolean;
  can_deliver: boolean;
  required_documents: KycRequiredDocument[];
  missing_documents: string[];
  present_documents: string[];
  blocker_codes: string[];
  blocker_messages: string[];
  optional_warnings?: string[];
  /** Present only when the readiness query includes a concrete subscription. */
  activation_milestone?: ContractActivationMilestone;
};

export type FetchReadinessOptions = {
  subscriptionId?: number;
  deliveryAddressDiffers?: boolean;
  highValue?: boolean;
};

export async function fetchContractKycReadiness(
  customerId: number,
  planType: string,
  opts: FetchReadinessOptions = {}
): Promise<ContractKycReadiness> {
  const params = new URLSearchParams();
  params.set("plan_type", planType);
  if (opts.subscriptionId) params.set("subscription", String(opts.subscriptionId));
  if (opts.deliveryAddressDiffers) params.set("delivery_address_differs", "1");
  if (opts.highValue) params.set("high_value", "1");

  return apiFetch<ContractKycReadiness>(
    `/admin/customers/${customerId}/contract-readiness/?${params.toString()}`
  );
}

/** P3A: Fetch the Document Vault checklist for a specific subscription. */
export async function fetchDocumentReadiness(
  subscriptionId: number,
  opts: { includeHandover?: boolean } = {}
): Promise<DocumentReadiness> {
  const params = new URLSearchParams();
  if (opts.includeHandover) params.set("include_handover", "1");
  const qs = params.toString();
  return apiFetch<DocumentReadiness>(
    `/admin/subscriptions/${subscriptionId}/document-readiness/${qs ? `?${qs}` : ""}`
  );
}
