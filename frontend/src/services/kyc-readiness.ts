import { apiFetch } from "@/lib/api";

/**
 * Contract KYC / document readiness service.
 *
 * Additive client for the backend `/admin/customers/<id>/contract-readiness/`
 * endpoint. Direct sale is reported as `is_direct_sale` with KYC optional; EMI /
 * Rent / Lease report can_activate / can_deliver and the document checklist.
 */
export type KycDocumentStatus = "VERIFIED" | "PENDING" | "MISSING" | string;

export type KycRequiredDocument = {
  code: string;
  label: string;
  required: boolean;
  present: boolean;
  status: KycDocumentStatus;
  source: string;
  stage: string;
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
