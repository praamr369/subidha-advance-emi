import { apiFetch } from "@/lib/api";

export type PublicContractItem = {
  id?: number;
  product_id?: number;
  name: string;
  product_code?: string;
  quantity: number;
  unit_base_price?: string;
  total_base_price?: string;
  monthly_amount: string;
  monthly_yield_percent?: string;
  security_deposit_amount?: string;
  security_deposit_percent?: string;
};

export type PublicContractSigningInfo = {
  success: boolean;
  subscription_id: number;
  contract_ref: string;
  plan_type: string;
  status: string;
  customer_name: string;
  customer_phone_masked: string;
  customer_email?: string;
  support_phone?: string;
  product_name: string;
  items?: PublicContractItem[];
  total_amount: string;
  monthly_amount: string;
  tenure_months: number;
  start_date?: string | null;
  security_deposit_amount?: string;
  security_deposit_paid?: string;
  security_deposit_pending?: string;
  refundable_security_deposit?: string;
  security_deposit_percent?: string;
  deposit_status?: string;
  already_signed: boolean;
  signed_at?: string | null;
  signature_url?: string | null;
};

export type AdminContractSigningLink = {
  success: boolean;
  subscription_id: number;
  token: string;
  signing_path: string;
  signing_url: string;
  support_phone?: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  contract_ref: string;
  plan_type: string;
  product_name: string;
  items?: PublicContractItem[];
  total_amount: string;
  monthly_amount: string;
  security_deposit_amount?: string;
  security_deposit_paid?: string;
  security_deposit_pending?: string;
  refundable_security_deposit?: string;
  deposit_status?: string;
  has_signature: boolean;
  signed_at?: string | null;
  signature_url?: string | null;
};

export async function getAdminContractSigningLink(subscriptionId: number | string): Promise<AdminContractSigningLink> {
  return apiFetch<AdminContractSigningLink>(`/admin/subscriptions/${subscriptionId}/signing-link/`, {
    cache: "no-store",
  });
}

export async function getPublicContractSigningInfo(token: string): Promise<PublicContractSigningInfo> {
  const cleanToken = (token || "").trim();
  return apiFetch<PublicContractSigningInfo>(`/public/contracts/sign/${cleanToken}/`, {
    cache: "no-store",
  });
}

export async function submitPublicContractSignature(
  token: string,
  payload: {
    signature_data?: string;
    signature_image?: File;
    customer_name_confirmation?: string;
  }
): Promise<{
  success: boolean;
  message: string;
  signed_at: string;
  document_id: number;
  contract_ref: string;
  signature_url?: string | null;
}> {
  const cleanToken = (token || "").trim();
  if (payload.signature_image) {
    const formData = new FormData();
    formData.append("signature_image", payload.signature_image);
    if (payload.customer_name_confirmation) {
      formData.append("customer_name_confirmation", payload.customer_name_confirmation);
    }
    if (payload.signature_data) {
      formData.append("signature_data", payload.signature_data);
    }
    return apiFetch(`/public/contracts/sign/${cleanToken}/`, {
      method: "POST",
      body: formData,
    });
  }

  return apiFetch(`/public/contracts/sign/${cleanToken}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      signature_data: payload.signature_data,
      customer_name_confirmation: payload.customer_name_confirmation,
    }),
  });
}

