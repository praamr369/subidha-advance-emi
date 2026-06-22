export type KycStatus =
  | "PENDING"
  | "SUBMITTED"
  | "APPROVED"
  | "VERIFIED"
  | "REJECTED";

export type CustomerStatus = "ACTIVE" | "INACTIVE";

export type CustomerAdmin = {
  id: number;
  user: number;
  user_username: string;
  user_is_active: boolean;
  name: string;
  phone: string;
  address: string;
  city: string;
  email: string;
  kyc_status: KycStatus;
  kyc_reviewed_by_username: string | null;
  kyc_reviewed_at: string | null;
  kyc_rejection_reason: string | null;
  created_at: string;
  status: CustomerStatus;
  active_subscription_count: number;
  historical_subscription_count: number;
  cancelled_subscription_count: number;
  total_subscription_value: string;
  active_contract_value: string;
  historical_contract_value: string;
  active_subscription_due: string;
  active_direct_sale_outstanding: string;
  active_invoice_outstanding: string;
  customer_source: string;
  customer_code: string;
  profile_photo_url: string | null;
  gstin: string | null;
};

export type CustomerCreatePayload = {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  username?: string;
  password?: string;
};

export type CustomerUpdatePayload = Partial<
  Pick<CustomerAdmin, "name" | "phone" | "address" | "city" | "email">
>;

export type KycDecisionPayload = {
  status: KycStatus;
  reason?: string;
};

export type KycDecisionResponse = {
  id: number;
  kyc_status: KycStatus;
  kyc_reviewed_by_username: string;
  kyc_reviewed_at: string;
  kyc_rejection_reason: string;
};

export type CustomerListParams = {
  page?: number;
  page_size?: number;
  search?: string;
  kyc_status?: KycStatus | "";
  status?: CustomerStatus | "";
};
