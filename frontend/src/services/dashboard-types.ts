export type CanonicalDashboardSummary = {
  subscription_count?: number;
  active_subscriptions: number;
  completed_subscriptions?: number;
  winner_subscriptions?: number;
  pending_emis: number;
  upcoming_emis?: number;
  overdue_emis?: number;
  paid_emis: number;
  waived_emis?: number;
  total_paid_amount: string;
  total_pending_amount?: string;
  total_waived_amount?: string;
  remaining_amount?: string;
  outstanding_amount?: string;
  overdue_amount?: string;
  upcoming_amount?: string;
  next_due_amount?: string | null;
  next_due_date?: string | null;
  next_due_is_overdue?: boolean;
  next_due_subscription_id?: number | null;
  next_due_subscription_number?: string | null;
  next_due_product_name?: string | null;
  next_due_lucky_number?: number | null;
  has_payment_adjustments?: boolean;
};

export type DashboardWinnerSurface = {
  winner_subscriptions: number;
  waived_emis: number;
  total_waived_amount: string;
  note: string;
};

export type DashboardReconciliationRow = {
  subscription_id: number;
  subscription_number: string;
  customer_name?: string;
  total_amount?: string;
  paid_amount?: string;
  waived_amount?: string;
  pending_outstanding?: string;
  computed_outstanding?: string;
  delta?: string;
};

export type DashboardReconciliationSurface = {
  checked_count: number;
  flagged_count: number;
  results: DashboardReconciliationRow[];
  note?: string;
};

export type DashboardDueSubscription = {
  id: number | string;
  subscription_id?: number | string;
  subscription_number?: string;
  customer_id?: number | string;
  customer_name?: string;
  customer_phone?: string;
  product_name?: string;
  batch_code?: string | null;
  lucky_number?: number | string | null;
  due_date?: string | null;
  monthly_amount?: string;
  pending_amount?: string;
  overdue_days?: number;
  is_overdue?: boolean;
  emi_id?: number | null;
  month_no?: number | null;
};
