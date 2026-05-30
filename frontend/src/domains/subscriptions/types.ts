export type AdminSubscription = {
  id: number;
  customer: number;
  product: number;
  partner: number | null;
  batch: number | null;
  lucky_id: number | null;
  plan_type: string;
  tenure_months: number;
  start_date: string;
  total_amount: string;
  monthly_amount: string;
  status: string;
};

export type SubscriptionDetail = AdminSubscription & {
  winner_month: number | null;
  waived_amount: string;
  created_at?: string;
};

export type SubscriptionCustomerOption = {
  id: number;
  name: string;
  phone: string;
  kyc_status?: string;
};

export type Product = {
  id: number;
  name: string;
  base_price: string;
  product_code?: string;
};

export type Batch = {
  id: number;
  batch_code: string;
  duration_months: number;
  status: string;
  draw_day?: number;
  start_date?: string;
};

export type LuckyId = {
  id: number;
  lucky_number: number;
  status?: string;
  batch?: number;
};

export type Partner = {
  id: number;
  username: string;
  phone: string;
};

export type Emi = {
  id: number;
  subscription: number;
  month_no: number;
  due_date: string;
  amount: string;
  status: string;
};

export type Payment = {
  id: number;
  customer: number;
  subscription: number;
  emi: number | null;
  amount: string;
  method: string;
  reference_no: string | null;
  payment_date: string;
  collected_by?: number | null;
};

export type CreateForm = {
  customer: string | null;
  product: string;
  batch: string;
  lucky_id: string;
  partner: string;
  plan_type: string;
  tenure_months: string;
  start_date: string;
};

export type TableRow = {
  id: number;
  customer_name: string;
  product_name: string;
  partner_name: string;
  batch_code: string;
  lucky_label: string;
  plan_type: string;
  tenure_months: number;
  monthly_amount: string;
  total_amount: string;
  status: string;
  start_date: string;
};
